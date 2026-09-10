import { describe, expect, it, vi } from 'vitest'
import { MemoryId, type MemoryRecord } from '@deepseek-ai/dsh-memory'
import { MemorySettingsStore, type MemoryRemote } from '../src/client/store.ts'

const USER_RECORD: MemoryRecord = Object.freeze({
  id: MemoryId('user-1'),
  scope: 'user',
  content: 'Prefer concise Chinese responses.',
  createdAt: 1,
  updatedAt: 1,
})

function success<T>(value: T) {
  return Promise.resolve({ ok: true as const, value })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function remote(overrides: Partial<MemoryRemote> = {}): MemoryRemote {
  return {
    list: vi.fn<MemoryRemote['list']>(() => success({ enabled: true, records: [USER_RECORD] })),
    add: vi.fn<MemoryRemote['add']>(request => success(Object.freeze({
      ...USER_RECORD,
      id: MemoryId('added'),
      scope: request.scope,
      content: request.content,
    }))),
    update: vi.fn<MemoryRemote['update']>(request => success(Object.freeze({ ...USER_RECORD, id: request.id, content: request.content }))),
    remove: vi.fn<MemoryRemote['remove']>(request => success({ id: request.id, absent: true as const })),
    setEnabled: vi.fn<MemoryRemote['setEnabled']>(request => success(request.enabled)),
    ...overrides,
  }
}

describe('MemorySettingsStore', () => {
  it('loads the current user and project snapshot lazily', async () => {
    const api = remote()
    const controller = new MemorySettingsStore(api)
    expect(controller.store.getSnapshot().status).toBe('idle')

    await controller.load('C:\\work\\project')

    expect(api.list).toHaveBeenCalledWith({ cwd: 'C:\\work\\project' })
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready', enabled: true, records: [USER_RECORD], failure: undefined,
    })
  })

  it('keeps the last good snapshot and exposes a contained mutation failure', async () => {
    const api = remote({
      add: vi.fn(() => Promise.resolve({
        ok: false as const,
        error: { code: 'remote-error', message: 'rejected', details: {} },
      })),
    })
    const controller = new MemorySettingsStore(api)
    await controller.load(undefined)

    await expect(controller.add({ scope: 'user', content: 'draft' }, undefined)).resolves.toBe(false)
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready', records: [USER_RECORD], failure: 'rejected', operation: undefined,
    })
  })

  it('reports rejected and unavailable loads without discarding the last good snapshot', async () => {
    const api = remote()
    const controller = new MemorySettingsStore(api)
    await controller.load(undefined)

    vi.mocked(api.list).mockResolvedValueOnce({
      ok: false,
      error: { code: 'remote-error', message: 'list rejected', details: {} },
    })
    await controller.load('/work/rejected')
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'error', records: [USER_RECORD], failure: 'list rejected',
    })

    vi.mocked(api.list).mockRejectedValueOnce(new Error('transport unavailable'))
    await controller.load('/work/unavailable')
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'error', records: [USER_RECORD], failure: undefined,
    })
  })

  it('keeps only the newest concurrent load result or failure', async () => {
    const first = deferred<Awaited<ReturnType<MemoryRemote['list']>>>()
    const staleFailure = deferred<Awaited<ReturnType<MemoryRemote['list']>>>()
    const api = remote({
      list: vi.fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => success({ enabled: false, records: [] }))
        .mockImplementationOnce(() => staleFailure.promise)
        .mockImplementationOnce(() => success({ enabled: true, records: [USER_RECORD] })),
    })
    const controller = new MemorySettingsStore(api)

    const oldLoad = controller.load('/work/old')
    await controller.load('/work/new')
    first.resolve({ ok: true, value: { enabled: true, records: [USER_RECORD] } })
    await oldLoad
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'ready', enabled: false, records: [] })

    const oldRejectedLoad = controller.load('/work/old-rejected')
    await controller.load('/work/newest')
    staleFailure.reject(new Error('stale transport failure'))
    await oldRejectedLoad
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready', enabled: true, records: [USER_RECORD], failure: undefined,
    })
  })

  it('rejects mutations before loading and while another mutation is pending', async () => {
    const pending = deferred<Awaited<ReturnType<MemoryRemote['add']>>>()
    const api = remote({ add: vi.fn(() => pending.promise) })
    const controller = new MemorySettingsStore(api)

    await expect(controller.setEnabled(false, undefined)).resolves.toBe(false)
    await controller.load(undefined)
    const first = controller.add({ scope: 'user', content: 'first' }, undefined)
    await expect(controller.remove(USER_RECORD.id, undefined)).resolves.toBe(false)
    expect(api.remove).not.toHaveBeenCalled()

    pending.resolve({ ok: true, value: { ...USER_RECORD, id: MemoryId('first'), content: 'first' } })
    await expect(first).resolves.toBe(true)
  })

  it('contains transport failures and commits against the last ready snapshot during a reload', async () => {
    const pendingAdd = deferred<Awaited<ReturnType<MemoryRemote['add']>>>()
    const pendingLoad = deferred<Awaited<ReturnType<MemoryRemote['list']>>>()
    const api = remote({
      add: vi.fn()
        .mockRejectedValueOnce(new Error('transport unavailable'))
        .mockImplementationOnce(() => pendingAdd.promise),
      list: vi.fn()
        .mockImplementationOnce(() => success({ enabled: true, records: [USER_RECORD] }))
        .mockImplementationOnce(() => pendingLoad.promise),
    })
    const controller = new MemorySettingsStore(api)
    await controller.load(undefined)

    await expect(controller.add({ scope: 'user', content: 'failed' }, undefined)).resolves.toBe(false)
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready', records: [USER_RECORD], operation: undefined, failure: 'unavailable',
    })

    const adding = controller.add({ scope: 'user', content: 'stored' }, undefined)
    const loading = controller.load('/work/project')
    pendingAdd.resolve({ ok: true, value: { ...USER_RECORD, id: MemoryId('stored'), content: 'stored' } })
    await expect(adding).resolves.toBe(true)
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'ready', failure: undefined })
    expect(controller.store.getSnapshot().records.map(record => record.content))
      .toEqual(['Prefer concise Chinese responses.', 'stored'])

    pendingLoad.resolve({ ok: true, value: { enabled: false, records: [] } })
    await loading
  })

  it('updates the local snapshot after successful add, edit, delete, and enable calls', async () => {
    const api = remote()
    const controller = new MemorySettingsStore(api)
    await controller.load('/work/project')

    expect(await controller.add({ scope: 'project', content: 'Run focused tests.' }, '/work/project')).toBe(true)
    const added = controller.store.getSnapshot().records.find(record => record.id === MemoryId('added'))!
    expect(added).toMatchObject({ scope: 'project', content: 'Run focused tests.' })

    expect(await controller.update(added.id, 'Run focused coverage.', '/work/project')).toBe(true)
    expect(controller.store.getSnapshot().records.find(record => record.id === added.id)?.content)
      .toBe('Run focused coverage.')

    expect(await controller.remove(added.id, '/work/project')).toBe(true)
    expect(controller.store.getSnapshot().records.some(record => record.id === added.id)).toBe(false)

    expect(await controller.setEnabled(false, '/work/project')).toBe(true)
    expect(controller.store.getSnapshot().enabled).toBe(false)
  })
})
