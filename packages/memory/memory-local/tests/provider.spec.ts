import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import type { KvUnit, StorageBackend } from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { descriptorOf } from '@deepseek-ai/dsh-storage-domain'
import MemoryService, { MemoryId } from '@deepseek-ai/dsh-memory'
import type { MemoryProvider } from '@deepseek-ai/dsh-memory/types'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import * as MemoryLocal from '../src/index.ts'
import { memoryDomainSpec, memoryRecordSchema, memoryStateSchema } from '../src/spec.ts'

const limits = {
  maxUserItems: 2,
  maxProjectItems: 2,
  maxItemChars: 20,
  maxUserChars: 30,
  maxProjectChars: 30,
}

const cleanups: Array<() => Promise<void>> = []
const projectA = resolve('fixtures/memory/project-a')
const projectB = resolve('fixtures/memory/project-b')

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((settle) => { resolve = settle })
  return { promise, resolve }
}

function unusedProvider(): MemoryProvider {
  const unexpected = (): Promise<never> => Promise.reject(new Error('unexpected occupied-provider call'))
  return {
    list: unexpected,
    add: unexpected,
    update: unexpected,
    remove: unexpected,
    setEnabled: unexpected,
  }
}

class BlockingStorageBackend implements StorageBackend {
  readonly kv
  readonly writeStarted = deferred()
  readonly releaseWrite = deferred()
  private readonly backend: MemoryStorageBackend

  constructor(pool: MemoryMediaPool) {
    this.backend = new MemoryStorageBackend(pool)
    this.kv = {
      open: async (...args: Parameters<NonNullable<StorageBackend['kv']>['open']>): Promise<KvUnit> => {
        const unit = await this.backend.kv.open(...args)
        let blocked = false
        return {
          loadAll: () => unit.loadAll(),
          putRecord: (table, key, value) => unit.putRecord(table, key, value),
          deleteRecord: (table, key) => unit.deleteRecord(table, key),
          setGlobal: async (value) => {
            if (!blocked) {
              blocked = true
              this.writeStarted.resolve()
              await this.releaseWrite.promise
            }
            await unit.setGlobal(value)
          },
          close: () => unit.close(),
        }
      },
    }
  }

  close(): Promise<void> {
    return this.backend.close()
  }
}

async function harness(
  pool = new MemoryMediaPool(),
  config: MemoryLocal.Config = limits,
  backend: StorageBackend = new MemoryStorageBackend(pool),
) {
  const ctx = new Context()
  cleanups.push(async () => { await ctx.fiber.dispose() })
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', backend)
  const facility = new DomainFacility(ctx, { backend: 'memory' })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  await ctx.plugin(MemoryService)
  const fiber = await ctx.plugin(MemoryLocal, config)
  return { ctx, fiber, pool, memory: ctx.memory }
}

describe('local memory provider', () => {
  it('isolates project records while sharing user records', async () => {
    const { memory } = await harness()
    await memory.add({ scope: 'user', content: 'Reply in Chinese.' }, { cwd: projectA })
    const project = await memory.add({ scope: 'project', content: 'Run focused tests.' }, { cwd: projectA })

    expect(project).toMatchObject({ scope: 'project', projectLabel: 'project-a' })
    await expect(memory.list({ cwd: projectA })).resolves.toMatchObject({ records: [
      expect.objectContaining({ scope: 'user' }),
      expect.objectContaining({ scope: 'project' }),
    ] })
    await expect(memory.list({ cwd: projectB })).resolves.toMatchObject({ records: [
      expect.objectContaining({ scope: 'user' }),
    ] })
  })

  it('requires cwd for project mutations', async () => {
    const { memory } = await harness()
    await expect(memory.add({ scope: 'project', content: 'Stable fact.' }, {}))
      .rejects.toMatchObject({ code: 'MEMORY_PROJECT_UNAVAILABLE' })
  })

  it('updates a visible project record and hides it from other project contexts', async () => {
    const { memory } = await harness()
    const record = await memory.add({ scope: 'project', content: 'Use pnpm.' }, { cwd: projectA })
    await expect(memory.update({ id: record.id, content: 'Use pnpm only.' }, { cwd: projectA }))
      .resolves.toMatchObject({ scope: 'project', content: 'Use pnpm only.' })
    await expect(memory.update({ id: record.id, content: 'Hidden update.' }, { cwd: projectB }))
      .rejects.toMatchObject({ code: 'MEMORY_NOT_FOUND' })
  })

  it('lists only user records without cwd and preserves mutation source metadata', async () => {
    const { memory } = await harness()
    const user = await memory.add(
      { scope: 'user', content: 'Use short replies.' },
      { sourceSessionId: 'source-session' as never },
    )
    await memory.add({ scope: 'project', content: 'Use pnpm.' }, { cwd: projectA })
    expect(user.sourceSessionId).toBe('source-session')
    await expect(memory.list({})).resolves.toMatchObject({ records: [expect.objectContaining({ scope: 'user' })] })
    const updated = await memory.update(
      { id: user.id, content: 'Reply briefly.' },
      { sourceSessionId: 'updated-session' as never },
    )
    expect(updated.sourceSessionId).toBe('updated-session')
  })

  it('survives provider restart over the same domain medium', async () => {
    const pool = new MemoryMediaPool()
    const first = await harness(pool)
    await first.memory.add({ scope: 'user', content: 'Use concise answers.' }, {})
    await first.ctx.fiber.dispose()
    const second = await harness(pool)
    await expect(second.memory.list({})).resolves.toMatchObject({ records: [
      expect.objectContaining({ content: 'Use concise answers.' }),
    ] })
  })

  it('serializes concurrent additions without losing records', async () => {
    const { memory } = await harness()
    await Promise.all([
      memory.add({ scope: 'user', content: 'First fact.' }, {}),
      memory.add({ scope: 'user', content: 'Second fact.' }, {}),
    ])
    expect((await memory.list({})).records.map(item => item.content)).toEqual(['First fact.', 'Second fact.'])
  })

  it('leaves memory and durable state unchanged when an atomic write fails', async () => {
    const pool = new MemoryMediaPool()
    const { memory } = await harness(pool)
    pool.failNextWrites = 1
    const content = 'Atomic fact.'

    try {
      await memory.add({ scope: 'user', content }, {})
      throw new Error('expected atomic memory write failure')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      if (error instanceof Error) {
        expect(error.message).toContain('injected write failure')
        expect(error.message).not.toContain(content)
      }
    }
    await expect(memory.list({})).resolves.toEqual({ enabled: true, records: [] })
    expect(pool.media.get('native_memory')).toEqual({ tables: new Map(), global: null })
  })

  it('cancels a queued mutation before it reaches durable state without echoing its reason', async () => {
    const pool = new MemoryMediaPool()
    const backend = new BlockingStorageBackend(pool)
    cleanups.push(async () => { backend.releaseWrite.resolve() })
    const { memory } = await harness(pool, limits, backend)
    const first = memory.add({ scope: 'user', content: 'First fact.' }, {})
    await backend.writeStarted.promise
    const secret = 'password: canceled-operation-secret'
    const controller = new AbortController()
    const second = memory.add(
      { scope: 'user', content: 'Second fact.' },
      { signal: controller.signal },
    )
    controller.abort(new Error(secret))
    backend.releaseWrite.resolve()

    await expect(first).resolves.toMatchObject({ content: 'First fact.' })
    try {
      await second
      throw new Error('expected queued memory cancellation')
    } catch (error) {
      expect(error).toMatchObject({ name: 'AbortError' })
      expect(error).toBeInstanceOf(Error)
      if (error instanceof Error) expect(error.message).not.toContain(secret)
    }
    await expect(memory.list({})).resolves.toMatchObject({
      records: [expect.objectContaining({ content: 'First fact.' })],
    })
  })

  it('unregisters before awaiting in-flight writes and disposes only after they settle', async () => {
    const pool = new MemoryMediaPool()
    const backend = new BlockingStorageBackend(pool)
    cleanups.push(async () => { backend.releaseWrite.resolve() })
    const { fiber, memory } = await harness(pool, limits, backend)
    const pending = memory.add({ scope: 'user', content: 'Commit on close.' }, {})
    await backend.writeStarted.promise

    let disposed = false
    const disposal = fiber.dispose().then(() => { disposed = true })
    await Promise.resolve()
    await expect(memory.list({})).rejects.toMatchObject({ code: 'MEMORY_PROVIDER_UNAVAILABLE' })
    expect(disposed).toBe(false)

    backend.releaseWrite.resolve()
    await expect(pending).resolves.toMatchObject({ content: 'Commit on close.' })
    await disposal
    expect(disposed).toBe(true)
    expect(pool.media.get('native_memory')?.global).toMatchObject({
      records: [expect.objectContaining({ content: 'Commit on close.' })],
    })
  })

  it('releases the opened domain when duplicate Provider registration aborts activation', async () => {
    const ctx = new Context()
    cleanups.push(async () => { await ctx.fiber.dispose() })
    await ctx.plugin(Storage)
    ctx.storage.backend.register('memory', new MemoryStorageBackend())
    const facility = new DomainFacility(ctx, { backend: 'memory' })
    ctx.storage.mount('domain', facility)
    ctx.provide('storageDomain', facility)
    await ctx.plugin(MemoryService)
    const unregister = ctx.memory.registerProvider(unusedProvider())

    await expect(ctx.plugin(MemoryLocal, limits))
      .rejects.toMatchObject({ code: 'MEMORY_DUPLICATE_PROVIDER' })
    await unregister()
    await expect(MemoryLocal.apply(ctx, limits)).resolves.toBeUndefined()
  })

  it('rejects duplicates and exact item or aggregate limits', async () => {
    const { memory } = await harness()
    await memory.add({ scope: 'user', content: '1234567890' }, {})
    await expect(memory.add({ scope: 'user', content: '  1234567890  ' }, {}))
      .rejects.toMatchObject({ code: 'MEMORY_DUPLICATE' })
    await memory.add({ scope: 'user', content: 'abcdefghij' }, {})
    await expect(memory.add({ scope: 'user', content: 'third' }, {}))
      .rejects.toMatchObject({ code: 'MEMORY_ITEM_LIMIT' })
  })

  it('rejects aggregate character overflow and invalid updates', async () => {
    const { memory } = await harness()
    const first = await memory.add({ scope: 'user', content: '123456789' }, {})
    const second = await memory.add({ scope: 'user', content: 'abcdefghijk' }, {})
    await expect(memory.update({ id: first.id, content: second.content }, {}))
      .rejects.toMatchObject({ code: 'MEMORY_DUPLICATE' })
    await expect(memory.update({ id: first.id, content: '12345678901234567890' }, {}))
      .rejects.toMatchObject({ code: 'MEMORY_CHAR_LIMIT' })
    await expect(memory.update({ id: MemoryId('missing'), content: 'missing' }, {}))
      .rejects.toMatchObject({ code: 'MEMORY_NOT_FOUND' })
  })

  it('enforces project-specific item and aggregate limits', async () => {
    const { memory } = await harness()
    const cwd = projectA
    await memory.add({ scope: 'project', content: '12345678901234567890' }, { cwd })
    await memory.add({ scope: 'project', content: 'abcdefghij' }, { cwd })
    await expect(memory.add({ scope: 'project', content: 'third' }, { cwd }))
      .rejects.toMatchObject({ code: 'MEMORY_ITEM_LIMIT' })
  })

  it('counts Unicode code points and rejects oversized items', async () => {
    const { memory } = await harness()
    await expect(memory.add({ scope: 'user', content: '😀'.repeat(20) }, {})).resolves.toBeDefined()
    await expect(memory.update({ id: (await memory.list({})).records[0]!.id, content: '😀'.repeat(21) }, {}))
      .rejects.toMatchObject({ code: 'MEMORY_CHAR_LIMIT' })
  })

  it.each([
    ['private key', '-----BEGIN PRIVATE KEY----- abc'],
    ['bearer token', 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz'],
    ['api key', 'api_key = sk-abcdefghijklmnopqrstuv'],
    ['password', 'password: hunter2'],
    ['temporary path', 'C:\\Windows\\Temp\\secret.txt'],
    ['raw log', '[2026-09-10 10:20:30] ERROR stack trace'],
  ])('rejects %s without echoing content', async (_name, content) => {
    const { memory } = await harness()
    try {
      await memory.add({ scope: 'user', content }, {})
      throw new Error('expected sensitive memory rejection')
    } catch (error) {
      expect(error).toMatchObject({ code: 'MEMORY_CONTENT_REJECTED' })
      expect(error).toBeInstanceOf(Error)
      if (error instanceof Error) expect(error.message).not.toContain(content)
    }
  })

  it('updates monotonically and removes idempotently', async () => {
    const { memory } = await harness()
    const added = await memory.add({ scope: 'user', content: 'Old fact.' }, {})
    const updated = await memory.update({ id: added.id, content: 'New fact.' }, {})
    expect(updated.createdAt).toBe(added.createdAt)
    expect(updated.updatedAt).toBeGreaterThan(added.updatedAt)
    await expect(memory.remove({ id: added.id }, {})).resolves.toEqual({ id: added.id, absent: true })
    await expect(memory.remove({ id: added.id }, {})).resolves.toEqual({ id: added.id, absent: true })
  })

  it('persists enable state without deleting records', async () => {
    const { memory } = await harness()
    await memory.add({ scope: 'user', content: 'Remember me.' }, {})
    await expect(memory.setEnabled(false, {})).resolves.toBe(false)
    await expect(memory.list({})).resolves.toMatchObject({ enabled: false, records: [expect.any(Object)] })
    await expect(memory.setEnabled(true, {})).resolves.toBe(true)
    await expect(memory.setEnabled(true, {})).resolves.toBe(true)
  })

  it('uses schema defaults and rejects invalid direct plugin config', async () => {
    expect(MemoryLocal.Config({})).toEqual({
      maxUserItems: 80,
      maxProjectItems: 120,
      maxItemChars: 1200,
      maxUserChars: 12000,
      maxProjectChars: 18000,
    })
    const defaults = await harness(new MemoryMediaPool(), {})
    await defaults.ctx.fiber.dispose()
    const directDefaults = new Context()
    await directDefaults.plugin(Storage)
    directDefaults.storage.backend.register('memory', new MemoryStorageBackend())
    const defaultFacility = new DomainFacility(directDefaults, { backend: 'memory' })
    directDefaults.storage.mount('domain', defaultFacility)
    directDefaults.provide('storageDomain', defaultFacility)
    await directDefaults.plugin(MemoryService)
    await MemoryLocal.apply(directDefaults, {})
    await expect(directDefaults.memory.add({ scope: 'user', content: 'Default limits.' }, {})).resolves.toBeDefined()
    await directDefaults.fiber.dispose()
    const ctx = new Context()
    await ctx.plugin(Storage)
    ctx.storage.backend.register('memory', new MemoryStorageBackend())
    const facility = new DomainFacility(ctx, { backend: 'memory' })
    ctx.storage.mount('domain', facility)
    ctx.provide('storageDomain', facility)
    await ctx.plugin(MemoryService)
    await expect(MemoryLocal.apply(ctx, { ...limits, maxUserItems: 0 })).rejects.toThrow(/positive safe integer/)
    await ctx.fiber.dispose()
  })

  it('rejects malformed stored record timestamps and project fields', () => {
    expect(memoryRecordSchema.safeParse({
      id: 'bad-time', scope: 'user', content: 'x', createdAt: 2, updatedAt: 1,
    }).success).toBe(false)
    expect(memoryRecordSchema.safeParse({
      id: 'bad-project', scope: 'project', projectKey: 'key', content: 'x', createdAt: 1, updatedAt: 1,
    }).success).toBe(false)
    expect(memoryRecordSchema.safeParse({
      id: 'bad-user', scope: 'user', projectKey: 'key', projectLabel: 'repo', content: 'x', createdAt: 1, updatedAt: 1,
    }).success).toBe(false)
  })

  it('keeps the released native_memory v0 global document and declares no tables or successor', () => {
    expect(descriptorOf(memoryDomainSpec)).toEqual({
      name: 'native_memory',
      version: 0,
      tables: [],
      hasGlobal: true,
    })
    expect(memoryStateSchema.parse({
      enabled: false,
      records: [{
        id: 'memory-released',
        scope: 'project',
        projectKey: 'project-key',
        projectLabel: 'project',
        content: 'Released record.',
        sourceSessionId: 'session-released',
        createdAt: 1,
        updatedAt: 2,
      }],
    })).toEqual({
      enabled: false,
      records: [{
        id: 'memory-released',
        scope: 'project',
        projectKey: 'project-key',
        projectLabel: 'project',
        content: 'Released record.',
        sourceSessionId: 'session-released',
        createdAt: 1,
        updatedAt: 2,
      }],
    })
  })
})
