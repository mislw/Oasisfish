/** Keyless OpenAI-compatible image responses for the Session replay. */
const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgZGIGAAAOAAeCcsnOAAAAAElFTkSuQmCC'

export const name = 'image-generation-snapshot-fixture'

export function apply(ctx) {
  const previous = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (!url.endsWith('/images/generations')) throw new Error('unexpected image fixture endpoint')
    const body = JSON.parse(String(init?.body))
    if (url.startsWith('https://primary.example/') && body.prompt.includes('Candidate variation: side view')) {
      return new Response('fixture primary failure', { status: 503 })
    }
    if (!url.startsWith('https://primary.example/') && !url.startsWith('https://backup.example/')) {
      throw new Error('unexpected image fixture provider')
    }
    return Response.json({ data: [{ b64_json: image }] })
  }
  ctx.effect(() => () => { globalThis.fetch = previous }, 'image generation snapshot fetch')
}
