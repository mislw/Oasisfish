import { createServer } from 'node:net'
import { describe, expect, it, vi } from 'vitest'
import { reserveLoopbackPort, waitForServer } from '../src/server.ts'

describe('reserveLoopbackPort', () => {
  it('returns a port that can be rebound on loopback after reservation closes', async () => {
    const port = await reserveLoopbackPort()
    const server = createServer()

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', resolve)
    })

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error === undefined) resolve()
        else reject(error)
      })
    })
  })
})

describe('waitForServer', () => {
  it('retries non-ready responses and resolves with the first successful response', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }))
    const sleep = vi.fn().mockResolvedValue(undefined)

    await expect(waitForServer('http://127.0.0.1:3123', {
      fetch,
      sleep,
      timeoutMs: 100,
      intervalMs: 5,
      now: (() => {
        let now = 0
        return () => now += 10
      })(),
    })).resolves.toBeUndefined()

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledOnce()
  })

  it('times out with the requested URL after repeated connection failures', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('connection refused'))

    await expect(waitForServer('http://127.0.0.1:4123', {
      fetch,
      sleep: vi.fn().mockResolvedValue(undefined),
      timeoutMs: 20,
      intervalMs: 5,
      now: (() => {
        let now = 0
        return () => now += 10
      })(),
    })).rejects.toThrow('Timed out waiting for http://127.0.0.1:4123')
  })
})
