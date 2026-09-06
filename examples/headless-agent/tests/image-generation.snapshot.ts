import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const configPath = fileURLToPath(new URL('../image-generation.cordis.snapshot.yml', import.meta.url))
const binScript = fileURLToPath(new URL('./fixtures/headless-driver.ts', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

interface ImageServer {
  readonly url: string
  readonly requests: unknown[]
  close(): Promise<void>
}

/** Serve deterministic OpenAI-compatible Images API responses. */
async function startImageServer(): Promise<ImageServer> {
  const requests: unknown[] = []
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => { body += chunk })
    request.on('end', () => {
      if (request.method !== 'POST' || request.url !== '/v1/images/generations') {
        response.writeHead(404).end()
        return
      }
      requests.push(JSON.parse(body) as unknown)
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ data: [{ b64_json: PNG_1X1.toString('base64') }] }))
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('image snapshot server has no port')
  return {
    url: `http://127.0.0.1:${String(address.port)}/v1`,
    requests,
    close: () => new Promise(resolve => server.close(() => { resolve() })),
  }
}

function records(stdout: string): Array<Record<string, unknown>> {
  return stdout.split(/\r?\n/u)
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line) as Record<string, unknown>)
}

describe('headless generated-image snapshot', () => {
  it('keeps the chat model active around one image_generate call', async () => {
    const server = await startImageServer()
    try {
      const result = await runLoaderSmoke({
        label: 'generated-image headless snapshot',
        tempDirPrefix: 'headless-snapshot-image-generation-',
        binScript,
        libBinScript: binScript,
        configPath,
        binArgs: [configPath, 'Generate a game inventory panel image.'],
        tsconfigPath,
        env: {
          DSH_IMAGE_SNAPSHOT_BASE_URL: server.url,
          NODE_OPTIONS: [process.env.NODE_OPTIONS, '--disable-warning=ExperimentalWarning'].filter(Boolean).join(' '),
        },
      })

      expect(result.stderr).toBe('')
      expect(server.requests).toEqual([{
        model: 'gpt-image-1',
        prompt: 'A clean game inventory panel with six item slots',
        n: 1,
        response_format: 'b64_json',
        size: '1024x1024',
      }])
      const emitted = records(result.stdout)
      expect(emitted.at(-1)).toMatchObject({
        type: 'result',
        output: 'IMAGE_GENERATION_OK: the chat model stayed active after the generated image was attached.',
      })
      const events = emitted.flatMap(record => (
        record.type === 'session_event' && typeof record.event === 'object' && record.event !== null
          ? [record.event as Record<string, unknown>]
          : []
      ))
      expect(events.filter(event => event.type === 'tool/call')).toMatchObject([{
        data: { name: 'image_generate' },
      }])
      expect(JSON.stringify(events.filter(event => event.type === 'tool/result'))).toContain(
        'Generated image with snapshot-image/gpt-image-1.',
      )
      expect(JSON.stringify(events.filter(event => event.type === 'tool/result'))).toContain('"type":"image"')
    } finally {
      await server.close()
    }
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
