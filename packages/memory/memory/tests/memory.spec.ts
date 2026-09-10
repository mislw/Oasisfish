import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import MemoryService, {
  MemoryError,
  MemoryId,
  type MemoryContext,
  type MemoryProvider,
  type MemoryRecord,
} from '../src/index.ts'

const context: MemoryContext = { cwd: 'C:\\work\\project' }
const cwd = 'C:\\work\\project'
const record: MemoryRecord = Object.freeze({
  id: MemoryId('memory-1'),
  scope: 'project',
  projectKey: 'project-key',
  projectLabel: 'project',
  content: 'Use focused tests.',
  createdAt: 1,
  updatedAt: 1,
})

function provider(): MemoryProvider {
  return {
    list: vi.fn(() => Promise.resolve({ enabled: true, records: [record] })),
    add: vi.fn(() => Promise.resolve(record)),
    update: vi.fn(() => Promise.resolve(record)),
    remove: vi.fn(() => Promise.resolve({ id: record.id, absent: true as const })),
    setEnabled: vi.fn(() => Promise.resolve(false)),
  }
}

async function setup(): Promise<{ ctx: Context; memory: MemoryService }> {
  const ctx = new Context()
  await ctx.plugin(MemoryService)
  return { ctx, memory: ctx.memory }
}

describe('MemoryService', () => {
  it('publishes the exact memory management Remote namespace and methods', async () => {
    const { memory } = await setup()
    expect(memory.typertRemote.serviceKey).toBe('memory')
    expect(memory.typertRemote.namespace).toBe('memory')
    expect(remoteMethods(memory)).toEqual([
      { method: 'listRemote', exportName: 'list', invocation: { kind: 'direct' } },
      { method: 'addRemote', exportName: 'add', invocation: { kind: 'direct' } },
      { method: 'updateRemote', exportName: 'update', invocation: { kind: 'direct' } },
      { method: 'removeRemote', exportName: 'remove', invocation: { kind: 'direct' } },
      { method: 'setEnabledRemote', exportName: 'setEnabled', invocation: { kind: 'direct' } },
    ])
  })

  it('routes Remote management calls through validated caller context', async () => {
    const { memory } = await setup()
    const backend = provider()
    memory.registerProvider(backend)

    await expect(memory.listRemote({ cwd })).resolves.toEqual({ enabled: true, records: [record] })
    await expect(memory.addRemote({ scope: 'project', content: record.content, cwd })).resolves.toBe(record)
    await expect(memory.updateRemote({ id: record.id, content: 'Use coverage.', cwd })).resolves.toBe(record)
    await expect(memory.removeRemote({ id: record.id, cwd })).resolves.toEqual({ id: record.id, absent: true })
    await expect(memory.setEnabledRemote({ enabled: false, cwd })).resolves.toBe(false)

    expect(backend.list).toHaveBeenCalledWith({ cwd: context.cwd })
    expect(backend.add).toHaveBeenCalledWith(
      { scope: 'project', content: record.content },
      { cwd: context.cwd },
    )
    expect(backend.update).toHaveBeenCalledWith(
      { id: record.id, content: 'Use coverage.' },
      { cwd: context.cwd },
    )
    expect(backend.remove).toHaveBeenCalledWith({ id: record.id }, { cwd: context.cwd })
    expect(backend.setEnabled).toHaveBeenCalledWith(false, { cwd: context.cwd })
  })

  it('omits an absent cwd from Remote provider contexts', async () => {
    const { memory } = await setup()
    const backend = provider()
    memory.registerProvider(backend)
    await memory.listRemote({})
    expect(backend.list).toHaveBeenCalledWith({})
  })

  it('brands opaque ids without changing their runtime value', () => {
    expect(MemoryId('memory-1')).toBe('memory-1')
  })

  it('delegates every operation to the registered provider', async () => {
    const { memory } = await setup()
    const backend = provider()
    memory.registerProvider(backend)

    await expect(memory.list(context)).resolves.toEqual({ enabled: true, records: [record] })
    await expect(memory.add({ scope: 'project', content: record.content }, context)).resolves.toBe(record)
    await expect(memory.update({ id: record.id, content: 'Use coverage.' }, context)).resolves.toBe(record)
    await expect(memory.remove({ id: record.id }, context)).resolves.toEqual({ id: record.id, absent: true })
    await expect(memory.setEnabled(false, context)).resolves.toBe(false)

    expect(backend.list).toHaveBeenCalledWith(context)
    expect(backend.add).toHaveBeenCalledWith({ scope: 'project', content: record.content }, context)
    expect(backend.update).toHaveBeenCalledWith({ id: record.id, content: 'Use coverage.' }, context)
    expect(backend.remove).toHaveBeenCalledWith({ id: record.id }, context)
    expect(backend.setEnabled).toHaveBeenCalledWith(false, context)
  })

  it('fails loud without a provider', async () => {
    const { memory } = await setup()
    await expect(memory.list(context)).rejects.toMatchObject({ code: 'MEMORY_PROVIDER_UNAVAILABLE' })
  })

  it('rejects a duplicate provider and releases the slot on disposal', async () => {
    const { memory } = await setup()
    const dispose = memory.registerProvider(provider())
    expect(() => memory.registerProvider(provider()))
      .toThrow(expect.objectContaining({ code: 'MEMORY_DUPLICATE_PROVIDER' }))

    await dispose()
    expect(() => memory.registerProvider(provider())).not.toThrow()
  })

  it('disposes a provider with its contributing fiber', async () => {
    const { ctx, memory } = await setup()
    const fiber = await ctx.plugin(Object.assign((inner: Context) => {
      inner.memory.registerProvider(provider())
    }, { inject: ['memory'] }))

    await expect(memory.list(context)).resolves.toMatchObject({ enabled: true })
    await fiber.dispose()
    await expect(memory.list(context)).rejects.toMatchObject({ code: 'MEMORY_PROVIDER_UNAVAILABLE' })
  })

  it('exposes stable error codes', () => {
    const error = new MemoryError('MEMORY_NOT_FOUND', 'missing')
    expect(error).toMatchObject({ name: 'MemoryError', code: 'MEMORY_NOT_FOUND', message: 'missing' })
  })
})
