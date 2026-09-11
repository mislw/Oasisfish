import { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { describe, expect, it, vi } from 'vitest'
import { apply as applyGateway, inject as injectGateway } from '@deepseek-ai/dsh-api-gateway/client'
import { apply, inject } from '../src/client/index.ts'

describe('Client Remote assembly', () => {
  it('mounts every selected namespace on the real Client gateway', async () => {
    const ctx = new Context()
    await ctx.plugin(TypertRegistry)
    ctx.provide('connection', {
      rpc: { call: vi.fn<ConnectionHandle['rpc']['call']>() },
    } as unknown as ConnectionHandle)
    await ctx.plugin({ inject: injectGateway, apply: applyGateway })

    await ctx.plugin({ inject, apply }).await()
    expect(ctx.remote.memory.removeRecord).toBeTypeOf('function')

    await ctx.fiber.dispose()
  })
})
