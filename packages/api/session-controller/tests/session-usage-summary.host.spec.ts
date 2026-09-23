import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore, {
  SESSION_FORMAT_VERSION,
  SessionId,
  SessionLogOffset,
  SessionSeq,
} from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, vi } from 'vitest'
import { createSessionTestController } from './test-remote.ts'

const defaults = {
  defaultModelSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-flash' }),
  cwd: '/tmp',
}

function header(id: string): SessionHeader {
  return {
    version: SESSION_FORMAT_VERSION,
    id: SessionId(id),
    createdAt: 1,
    cwd: '/workspace',
    isSeeded: false,
  }
}

function marker(seq: number): SessionEvent {
  return {
    type: 'turn/start',
    seq: SessionSeq(seq),
    time: seq,
    data: { turn: seq },
  }
}

describe('session.usageSummary', () => {
  it('sums visible Sessions, excludes inherited events, and isolates read failures', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    const summarizeUsage = vi.fn((events: readonly SessionEvent[]) => ({
      uncachedInputTokens: events[0]?.seq ?? 0,
      outputTokens: 2,
      cacheReadTokens: 3,
      cacheWriteTokens: 4,
      turns: 1,
      minimumNanoUsd: 5,
      maximumNanoUsd: 6,
      pricedRequests: 1,
      unpricedRequests: 0,
    }))
    ctx.provide('tokenMeter', { summarizeUsage } as never)
    const controller = createSessionTestController(ctx, defaults)
    const first = header('usage-first')
    const second = header('usage-second')
    const failed = header('usage-failed')
    vi.spyOn((controller as unknown as {
      listState: { list(signal: AbortSignal): Promise<Array<{ sessionId: ReturnType<typeof SessionId> }>> }
    }).listState, 'list').mockResolvedValue([
      { sessionId: first.id },
      { sessionId: second.id },
      { sessionId: failed.id },
    ])
    vi.spyOn(ctx.sessionQuery, 'projectSessions').mockImplementation(async (_ids, project) => [
      {
        sessionId: first.id,
        status: 'fulfilled' as const,
        value: project({
          header: first,
          inheritedEventCount: SessionLogOffset(1),
          events: [marker(100), marker(10)],
        }),
      },
      {
        sessionId: second.id,
        status: 'fulfilled' as const,
        value: project({
          header: second,
          inheritedEventCount: SessionLogOffset(0),
          events: [marker(20)],
        }),
      },
      { sessionId: failed.id, status: 'rejected' as const, reason: new Error('unreadable') },
    ])

    await expect(controller.usageSummary(
      { fromInclusive: 1_000, toExclusive: 2_000 },
      new AbortController().signal,
    )).resolves.toEqual({
      uncachedInputTokens: 30,
      outputTokens: 4,
      cacheReadTokens: 6,
      cacheWriteTokens: 8,
      turns: 2,
      minimumNanoUsd: 10,
      maximumNanoUsd: 12,
      pricedRequests: 2,
      unpricedRequests: 0,
      failedSessions: 1,
    })
    expect(summarizeUsage).toHaveBeenNthCalledWith(1, [marker(10)], 1_000, 2_000)
    expect(summarizeUsage).toHaveBeenNthCalledWith(2, [marker(20)], 1_000, 2_000)
  })

  it.each([
    { fromInclusive: -1, toExclusive: 1 },
    { fromInclusive: 1, toExclusive: 1 },
    { fromInclusive: 1.5, toExclusive: 2 },
  ])('rejects invalid epoch bounds: $fromInclusive..$toExclusive', async (request) => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    ctx.provide('tokenMeter', { summarizeUsage: vi.fn() } as never)
    const controller = createSessionTestController(ctx, defaults)

    await expect(controller.usageSummary(request, new AbortController().signal))
      .rejects.toBeInstanceOf(RemoteError)
  })
})
