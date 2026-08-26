import { createServer } from 'node:net'

/** Dependencies and timing controls for the startup readiness probe. */
export interface WaitForServerOptions {
  fetch?: typeof globalThis.fetch
  sleep?: (milliseconds: number) => Promise<void>
  now?: () => number
  timeoutMs?: number
  intervalMs?: number
}

/** Reserve and release one ephemeral loopback TCP port. */
export async function reserveLoopbackPort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('Loopback port reservation returned no TCP address.'))
        return
      }
      server.close(error => error === undefined ? resolve(address.port) : reject(error))
    })
  })
}

/**
 * Wait until the local Harness server answers with a successful status.
 * @param url - Loopback URL selected for this desktop process.
 * @param options - Injectable timing and fetch functions for deterministic tests.
 */
export async function waitForServer(url: string, options: WaitForServerOptions = {}): Promise<void> {
  const fetch = options.fetch ?? globalThis.fetch
  const sleep = options.sleep ?? (async milliseconds => await new Promise(resolve => setTimeout(resolve, milliseconds)))
  const now = options.now ?? Date.now
  const timeoutMs = options.timeoutMs ?? 30_000
  const intervalMs = options.intervalMs ?? 100
  const deadline = now() + timeoutMs

  while (now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' })
      if (response.ok) return
    } catch (error) {
      // Connection failures are expected while the local server is starting.
      void error
    }
    await sleep(intervalMs)
  }

  throw new Error(`Timed out waiting for ${url} after ${timeoutMs} ms.`)
}
