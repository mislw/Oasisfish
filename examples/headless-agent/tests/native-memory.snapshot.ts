import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const configPath = fileURLToPath(new URL('../native-memory.cordis.snapshot.yml', import.meta.url))
const binScript = fileURLToPath(new URL('./fixtures/native-memory-driver.ts', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))

function records(stdout: string): Array<Record<string, unknown>> {
  return stdout.split(/\r?\n/u)
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line) as Record<string, unknown>)
}

describe('headless native-memory snapshot', () => {
  it('stores a project fact and injects the logged snapshot on the next turn', async () => {
    const result = await runLoaderSmoke({
      label: 'native-memory headless snapshot',
      tempDirPrefix: 'headless-snapshot-native-memory-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath],
      tsconfigPath,
      env: {
        NODE_OPTIONS: [process.env.NODE_OPTIONS, '--disable-warning=ExperimentalWarning'].filter(Boolean).join(' '),
      },
    })

    expect(result.stderr).toBe('')
    const emitted = records(result.stdout)
    expect(emitted.at(-1)).toMatchObject({
      type: 'turn_result',
      turn: 2,
      result: { output: 'MEMORY_OK' },
    })
    const events = emitted.flatMap(record => (
      record.type === 'session_event' && typeof record.event === 'object' && record.event !== null
        ? [record.event as Record<string, unknown>]
        : []
    ))
    expect(events.filter(event => event.type === 'tool/call')).toMatchObject([{
      data: { name: 'memory_manage' },
    }])
    expect(JSON.stringify(events.filter(event => event.type === 'tool/result'))).toContain('Stored project memory')
    const memoryMessages = events.filter((event) => {
      if (event.type !== 'user/message') return false
      return JSON.stringify(event).includes('native-memory-context')
    })
    expect(memoryMessages).toHaveLength(1)
    expect(JSON.stringify(memoryMessages[0])).toContain('Use pnpm for repository tasks.')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
