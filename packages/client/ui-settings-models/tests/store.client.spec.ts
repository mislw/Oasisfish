/** Page-store join: directory × namespaces × credentials, with last-good rows on failure. */
import { describe, expect, it, vi } from 'vitest'
import type { RpcResponse } from '@deepseek-ai/dsh-api-remotes/client'
import { SettingsDescribeMirror } from '@deepseek-ai/dsh-client-ui-settings/src/client/settings-mirror.ts'
import { settingsSchema } from './settings-schema.client.ts'
import { messageOf, ModelsSettingsStore } from '../src/client/store.ts'

let nextRpc = 0
function ok<T>(value: T): RpcResponse<T> {
  return { rpcId: `r-${nextRpc++}` as never, result: { ok: true, value } }
}
function fail<T>(message: string): RpcResponse<T> {
  return { rpcId: `r-${nextRpc++}` as never, result: { ok: false, error: { code: 'internal', message, details: {} } } }
}

const DIRECTORY = [
  { provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [], active: true },
  { provider: 'openai', displayName: 'openai', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openai'], active: true },
  { provider: 'anthropic', displayName: 'anthropic', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'anthropic'], active: false },
  { provider: 'ghost', displayName: 'Ghost', settingsNs: '', settingsPath: [], active: true },
]

const GROUPS = [{
  id: 'openai',
  name: 'OpenAI Relay',
  models: [{ id: 'gpt-5', name: 'GPT-5' }, { id: 'gpt-5-mini', name: 'GPT-5 mini' }],
}]

const NAMESPACES = [
  {
    ns: 'image-generation',
    schema: {},
    value: { provider: 'openai', model: 'gpt-image-1', endpointPath: 'images/generations' },
    user: { provider: 'openai', model: 'gpt-image-1' },
    applies: 'live' as const,
    secrets: [],
    revision: 0,
  },
  {
    ns: 'llm-deepseek',
    schema: {},
    value: { apiKeyEnv: 'DEEPSEEK_API_KEY', baseURL: 'https://base' },
    base: { baseURL: 'https://base' },
    applies: 'live' as const,
    secrets: [],
    revision: 0,
  },
  {
    ns: 'llm-pi-ai',
    schema: {},
    value: { providers: { openai: {
      apiKeyEnv: 'OPENAI_API_KEY',
      baseURL: 'https://relay.example/v1?trace=private',
      api: 'openai-responses',
    } } },
    user: { providers: { openai: {
      apiKeyEnv: 'OPENAI_API_KEY',
      baseURL: 'https://relay.example/v1?trace=private',
      api: 'openai-responses',
    } } },
    applies: 'live' as const,
    secrets: [],
    revision: 0,
  },
]

function api(overrides: {
  providers?: () => Promise<RpcResponse<{ providers: typeof DIRECTORY }>>
  models?: () => Promise<RpcResponse<{ groups: typeof GROUPS; failures: never[] }>>
  defaultModel?: () => Promise<RpcResponse<{ selected: { provider: string; model: string } }>>
  selectDefaultModel?: ReturnType<typeof vi.fn>
  describeSettings?: () => Promise<RpcResponse<{ writable: boolean; namespaces: typeof NAMESPACES }>>
  describeCredentials?: (refs: string[]) => Promise<RpcResponse<{ credentials: Record<string, unknown> }>>
} = {}) {
  const seenRefs: string[][] = []
  const face = {
    llm: {
      providers: overrides.providers ?? (() => Promise.resolve(ok({ providers: DIRECTORY }))),
      models: overrides.models ?? (() => Promise.resolve(ok({ groups: GROUPS, failures: [] }))),
      defaultModel: overrides.defaultModel ?? (() => Promise.resolve(ok({
        selected: { provider: 'deepseek-official', model: 'deepseek-chat' },
      }))),
      selectDefaultModel: overrides.selectDefaultModel
        ?? vi.fn((payload: { provider: string; model: string }) => Promise.resolve(ok({ selected: payload }))),
    },
    settings: {
      describe: overrides.describeSettings ?? (() => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: NAMESPACES }))),
      update: () => Promise.resolve(fail('unused')),
      replace: () => Promise.resolve(fail('unused')),
    },
    credentials: {
      describe: (payload: { refs: string[] }) => {
        seenRefs.push(payload.refs)
        return (overrides.describeCredentials ?? (refs => Promise.resolve(ok({
          credentials: Object.fromEntries(refs.map(ref => [ref, { configured: ref === 'OPENAI_API_KEY', writable: true }])),
        }))))(payload.refs)
      },
      set: () => Promise.resolve(ok({})),
      unset: () => Promise.resolve(ok({})),
    },
  }
  const wire = face as never
  return { face: wire, mirror: new SettingsDescribeMirror(wire), seenRefs }
}

describe('ModelsSettingsStore', () => {
  it('joins rows with configured, removable, and credential state', async () => {
    const { face, mirror, seenRefs } = api()
    const store = new ModelsSettingsStore(face, settingsSchema, mirror)
    await store.load()
    const state = store.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.writable).toBe(true)
    expect(state.credentialError).toBeNull()
    expect(state.defaultSelection).toEqual({ provider: 'deepseek-official', model: 'deepseek-chat' })
    expect(state.defaultImageSelection).toEqual({
      provider: 'openai', model: 'gpt-image-1', endpointPath: 'images/generations',
    })
    expect(state.groups).toEqual(GROUPS)
    expect(state.catalogFailures).toEqual([])
    expect(seenRefs).toEqual([['DEEPSEEK_API_KEY', 'OPENAI_API_KEY']])
    const byProvider = new Map(state.rows.map(row => [row.entry.provider, row]))
    expect(byProvider.get('deepseek-official')).toMatchObject({
      configured: true,
      removable: false,
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      credential: { configured: false, writable: true },
    })
    expect(byProvider.get('openai')).toMatchObject({
      configured: true,
      removable: true,
      apiKeyEnv: 'OPENAI_API_KEY',
      credential: { configured: true },
      summary: {
        endpointHost: 'relay.example',
        protocol: 'openai-responses',
        modelCount: 2,
      },
    })
    expect(JSON.stringify(byProvider.get('openai')?.summary)).not.toContain('trace=private')
    expect(byProvider.get('anthropic')).toMatchObject({ configured: false, removable: false })
    expect(byProvider.get('anthropic')?.apiKeyEnv).toBeUndefined()
    expect(byProvider.get('ghost')).toMatchObject({ configured: false, removable: false })
    expect(state.namespaces.get('llm-pi-ai')?.ns).toBe('llm-pi-ai')
  })

  it('degrades the credential badge, not the page, when the credential domain fails', async () => {
    const { face, mirror } = api({ describeCredentials: () => Promise.resolve(fail('no provider')) })
    const store = new ModelsSettingsStore(face, settingsSchema, mirror)
    await store.load()
    const state = store.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.credentialError).toBe('no provider')
    expect(state.rows.every(row => row.credential === undefined)).toBe(true)
  })

  it('settles a credential transport rejection without leaving the store loading', async () => {
    const { face, mirror } = api({
      describeCredentials: () => Promise.reject(new Error('credential transport down')),
    })
    const store = new ModelsSettingsStore(face, settingsSchema, mirror)
    await expect(store.load()).resolves.toBeUndefined()
    expect(store.store.getSnapshot()).toMatchObject({
      status: 'ready',
      credentialError: 'credential transport down',
    })
  })

  it('stringifies a non-Error credential transport rejection', async () => {
    const { face, mirror } = api({
      describeCredentials: async () => { throw 'credential transport refusal' },
    })
    const store = new ModelsSettingsStore(face, settingsSchema, mirror)
    await expect(store.load()).resolves.toBeUndefined()
    expect(store.store.getSnapshot().credentialError).toBe('credential transport refusal')
  })

  it('surfaces a directory failure and keeps the last good rows', async () => {
    const { face, mirror } = api()
    const store = new ModelsSettingsStore(face, settingsSchema, mirror)
    await store.load()
    expect(store.store.getSnapshot().rows).toHaveLength(4)
    const broken = api({ providers: () => Promise.resolve(fail('directory down')) })
    const failing = new ModelsSettingsStore(broken.face, settingsSchema, broken.mirror)
    await failing.load()
    expect(failing.store.getSnapshot()).toMatchObject({ status: 'error', error: 'directory down' })
    // The first store's snapshot is untouched by the second's failure.
    expect(store.store.getSnapshot().status).toBe('ready')
  })

  it('lets the newest load win over a stale slow response', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    let call = 0
    const { face, mirror } = api({
      providers: async () => {
        call += 1
        if (call === 1) {
          await gate
          return fail('stale slow failure')
        }
        return ok({ providers: DIRECTORY })
      },
    })
    const store = new ModelsSettingsStore(face, settingsSchema, mirror)
    const first = store.load()
    const second = store.load()
    release?.()
    await Promise.all([first, second])
    expect(store.store.getSnapshot().status).toBe('ready')
  })

  it('saves a new default through llm and refreshes the joined snapshot', async () => {
    let selected = { provider: 'deepseek-official', model: 'deepseek-chat' }
    const selectDefaultModel = vi.fn((payload: typeof selected) => {
      selected = { ...payload }
      return Promise.resolve(ok({ selected }))
    })
    const { face, mirror } = api({
      defaultModel: () => Promise.resolve(ok({ selected })),
      selectDefaultModel,
    })
    const store = new ModelsSettingsStore(face, settingsSchema, mirror)
    await store.load()

    await expect(store.selectDefault({ provider: 'openai', model: 'gpt-5' })).resolves.toBeUndefined()
    expect(selectDefaultModel).toHaveBeenCalledWith({ provider: 'openai', model: 'gpt-5' })
    expect(store.store.getSnapshot().defaultSelection).toEqual({ provider: 'openai', model: 'gpt-5' })
  })

  it('keeps the prior snapshot when saving a default is refused', async () => {
    const { face, mirror } = api({
      selectDefaultModel: vi.fn(() => Promise.resolve(fail('default is read-only'))),
    })
    const store = new ModelsSettingsStore(face, settingsSchema, mirror)
    await store.load()
    const before = store.store.getSnapshot()

    await expect(store.selectDefault({ provider: 'openai', model: 'gpt-5' }))
      .resolves.toBe('default is read-only')
    expect(store.store.getSnapshot()).toBe(before)
  })

  it('saves the default image route through the image-generation settings namespace', async () => {
    const { face, mirror } = api()
    const mutate = vi.fn(() => Promise.resolve(ok({})))
    ;(face as unknown as { settings: { mutate: typeof mutate } }).settings.mutate = mutate
    const store = new ModelsSettingsStore(face, settingsSchema, mirror)
    await store.load()

    await expect(store.selectDefaultImage({
      provider: 'openai', model: 'gpt-image-1', endpointPath: 'images/generations',
    })).resolves.toBeUndefined()
    expect(mutate).toHaveBeenCalledWith({
      ns: 'image-generation',
      ops: [
        { op: 'set', path: ['provider'], value: 'openai' },
        { op: 'set', path: ['model'], value: 'gpt-image-1' },
        { op: 'set', path: ['endpointPath'], value: 'images/generations' },
      ],
    })
  })
})

describe('edge joins', () => {
  it('treats a non-object profile as having no credential reference', async () => {
    const { face, mirror } = api({
      describeSettings: () => Promise.resolve(ok({
        writable: true,
        hasDocument: false,
        namespaces: [{
          ns: 'llm-pi-ai',
          schema: {},
          value: { providers: { weird: 'oops' } },
          applies: 'live' as const,
          secrets: [],
          revision: 0,
        }] as never,
      })),
      providers: () => Promise.resolve(ok({
        providers: [
          { provider: 'weird', displayName: 'weird', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'weird'], active: false },
        ] as never,
      })),
    })
    const store = new ModelsSettingsStore(face, settingsSchema, mirror)
    await store.load()
    const state = store.store.getSnapshot()
    expect(state.rows[0]).toMatchObject({ configured: true, removable: false })
    expect(state.rows[0]?.apiKeyEnv).toBeUndefined()
  })

  it('skips the credential describe entirely when no row names a reference', async () => {
    const { face, mirror, seenRefs } = api({
      describeSettings: () => Promise.resolve(ok({
        writable: true,
        hasDocument: false,
        namespaces: [{ ns: 'llm-pi-ai', schema: {}, value: { providers: {} }, applies: 'live' as const, secrets: [], revision: 0 }] as never,
      })),
      providers: () => Promise.resolve(ok({
        providers: [
          { provider: 'anthropic', displayName: 'anthropic', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'anthropic'], active: false },
        ] as never,
      })),
    })
    const store = new ModelsSettingsStore(face, settingsSchema, mirror)
    await store.load()
    expect(seenRefs).toEqual([])
    expect(store.store.getSnapshot().status).toBe('ready')
  })

  it('surfaces a settings describe failure', async () => {
    const { face, mirror } = api({ describeSettings: () => Promise.resolve(fail('settings down')) })
    const store = new ModelsSettingsStore(face, settingsSchema, mirror)
    await store.load()
    expect(store.store.getSnapshot()).toMatchObject({ status: 'error', error: 'settings down' })
  })

  it('reports a terminally unavailable settings mirror precisely', async () => {
    const { face } = api()
    const store = new ModelsSettingsStore(
      face,
      settingsSchema,
      new SettingsDescribeMirror(face, 'memory'),
    )
    await store.load()
    expect(store.store.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'settings are unavailable in this browser',
    })
  })

  it('reuses a held settings view after its refresh fails', async () => {
    let settingsCall = 0
    const { face, mirror } = api({
      describeSettings: () => {
        settingsCall += 1
        return Promise.resolve(settingsCall === 1
          ? ok({ writable: true, hasDocument: false, namespaces: NAMESPACES })
          : fail('settings refresh down'))
      },
    })
    const store = new ModelsSettingsStore(face, settingsSchema, mirror)
    await store.load()
    await mirror.load()
    expect(mirror.getSnapshot().error).toBe('settings refresh down')
    await store.load()
    expect(store.store.getSnapshot()).toMatchObject({ status: 'ready', error: null })
    expect(store.store.getSnapshot().rows).toHaveLength(4)
  })

  it('stringifies a non-Error load failure', async () => {
    // The wire can surface non-Error throwables; the store must stringify them.
    const { face, mirror } = api({ providers: async () => { throw 'plain refusal' } })
    const store = new ModelsSettingsStore(face, settingsSchema, mirror)
    await store.load()
    expect(store.store.getSnapshot()).toMatchObject({ status: 'error', error: 'plain refusal' })
  })

  it('drops a stale successful response after a newer load finished', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    let call = 0
    const { face, mirror } = api({
      providers: async () => {
        call += 1
        if (call === 1) {
          await gate
          return ok({ providers: [] as never })
        }
        return ok({ providers: DIRECTORY })
      },
    })
    const store = new ModelsSettingsStore(face, settingsSchema, mirror)
    const first = store.load()
    const second = store.load()
    await second
    release?.()
    await first
    // The stale empty directory never overwrote the newer join.
    expect(store.store.getSnapshot().rows).toHaveLength(4)
  })
})

describe('messageOf', () => {
  it('reads an Error message, and stringifies anything else a rejection may carry', () => {
    // The wire layer rejects with an Error, but a host or a runtime can reject
    // with any value, and the page still has to render something.
    expect(messageOf(new Error('connection lost'))).toBe('connection lost')
    expect(messageOf('the host refused')).toBe('the host refused')
    expect(messageOf(undefined)).toBe('undefined')
  })
})
