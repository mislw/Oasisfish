import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { coordinateHarnessStartup } from '../src/harness-startup.ts'

const roots: string[] = []

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'oasisfish-harness-startup-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => { await rm(root, { recursive: true, force: true }) }))
})

describe('coordinateHarnessStartup', () => {
  it('reuses a live loopback Harness without starting another process', async () => {
    const root = await temporaryRoot()
    await writeFile(join(root, 'desktop-ready.json'), JSON.stringify({
      url: 'http://127.0.0.1:4123',
      pid: 41,
    }))
    const start = vi.fn()

    await expect(coordinateHarnessStartup(root, start, {
      fetch: vi.fn().mockResolvedValue(new Response('', { status: 200 })),
      isProcessAlive: pid => pid === 41,
    })).resolves.toEqual({ url: 'http://127.0.0.1:4123', owned: false })

    expect(start).not.toHaveBeenCalled()
  })

  it('waits for another desktop package to publish its ready Harness', async () => {
    const root = await temporaryRoot()
    await writeFile(join(root, 'desktop-harness-startup.lock'), '52\n')
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
    const start = vi.fn()
    const sleep = vi.fn(async () => {
      await writeFile(join(root, 'desktop-ready.json'), JSON.stringify({
        url: 'http://127.0.0.1:5123',
        pid: 53,
      }))
    })

    await expect(coordinateHarnessStartup(root, start, {
      fetch,
      isProcessAlive: pid => pid === 52 || pid === 53,
      sleep,
      now: (() => {
        let now = 0
        return () => now += 10
      })(),
      timeoutMs: 100,
    })).resolves.toEqual({ url: 'http://127.0.0.1:5123', owned: false })

    expect(start).not.toHaveBeenCalled()
    expect(sleep).toHaveBeenCalledOnce()
  })

  it('removes a stale startup lock and starts one owned Harness', async () => {
    const root = await temporaryRoot()
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'desktop-harness-startup.lock'), '64\n')
    const start = vi.fn().mockResolvedValue('http://127.0.0.1:6123')

    await expect(coordinateHarnessStartup(root, start, {
      fetch: vi.fn(),
      isProcessAlive: () => false,
    })).resolves.toEqual({ url: 'http://127.0.0.1:6123', owned: true })

    expect(start).toHaveBeenCalledOnce()
    await expect(readFile(join(root, 'desktop-harness-startup.lock'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('ignores a ready file that points outside the local loopback server', async () => {
    const root = await temporaryRoot()
    await writeFile(join(root, 'desktop-ready.json'), JSON.stringify({
      url: 'https://example.com/',
      pid: 75,
    }))
    const fetch = vi.fn()
    const start = vi.fn().mockResolvedValue('http://127.0.0.1:7123')

    await expect(coordinateHarnessStartup(root, start, {
      fetch,
      isProcessAlive: () => true,
    })).resolves.toEqual({ url: 'http://127.0.0.1:7123', owned: true })

    expect(fetch).not.toHaveBeenCalled()
  })
})
