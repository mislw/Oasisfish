import { execFile } from 'node:child_process'
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { syncUpstream } from '../src/sync-upstream.ts'

const execFileAsync = promisify(execFile)
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url))
const packagedAssets = fileURLToPath(new URL('../assets/', import.meta.url))

async function git(root: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: root,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
      GIT_AUTHOR_EMAIL: 'fixture@example.test',
      GIT_AUTHOR_NAME: 'Fixture Author',
      GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
      GIT_COMMITTER_EMAIL: 'fixture@example.test',
      GIT_COMMITTER_NAME: 'Fixture Author',
    },
  })
  return stdout.trim()
}

async function mutateFixture(root: string, name: string): Promise<void> {
  const stylePath = join(root, 'data', 'style-library.json')
  const casesPath = join(root, 'data', 'cases.json')
  if (['valid', 'dirty-checkout', 'wrong-commit', 'wrong-origin', 'unreachable-remote', 'tracked-executable'].includes(name)) return
  if (name === 'unknown-field') {
    const library = JSON.parse(await readFile(stylePath, 'utf8')) as Record<string, unknown>
    library.unexpected = true
    await writeFile(stylePath, JSON.stringify(library, undefined, 2) + '\n')
    return
  }
  if (name === 'duplicate-id') {
    const library = JSON.parse(await readFile(stylePath, 'utf8')) as { styles: unknown[] }
    library.styles.push(library.styles[0])
    await writeFile(stylePath, JSON.stringify(library, undefined, 2) + '\n')
    return
  }
  if (name === 'missing-reference') {
    const library = JSON.parse(await readFile(stylePath, 'utf8')) as {
      templates: Array<Record<string, unknown>>
    }
    library.templates[0]!.category = 'Missing category'
    await writeFile(stylePath, JSON.stringify(library, undefined, 2) + '\n')
    return
  }
  if (name === 'path-traversal') {
    const library = JSON.parse(await readFile(stylePath, 'utf8')) as Record<string, unknown>
    library.templateDocument = '../outside.md'
    await writeFile(stylePath, JSON.stringify(library, undefined, 2) + '\n')
    return
  }
  if (name === 'executable-reference') {
    const library = JSON.parse(await readFile(stylePath, 'utf8')) as Record<string, unknown>
    library.templateDocument = 'site/run.js'
    await writeFile(stylePath, JSON.stringify(library, undefined, 2) + '\n')
    await writeFile(join(root, 'site', 'run.js'), 'process.exit(0)\n')
    return
  }
  if (name === 'missing-upstream-path') {
    const library = JSON.parse(await readFile(stylePath, 'utf8')) as Record<string, unknown>
    library.templateDocument = ['docs', 'missing.md'].join('/')
    await writeFile(stylePath, JSON.stringify(library, undefined, 2) + '\n')
    return
  }
  if (name === 'invalid-utf8') {
    await writeFile(casesPath, Uint8Array.of(0xc3, 0x28))
    return
  }
  throw new Error(`unknown sync fixture: ${name}`)
}

/** Create one complete local Git checkout for synchronizer tests. */
export async function prepareCheckout(name: string): Promise<{
  commit: string
  root: string
  cleanup(): Promise<void>
}> {
  const temp = await mkdtemp(join(tmpdir(), `dsh-image-library-${name}-`))
  const root = join(temp, 'checkout')
  await cp(join(fixtures, 'valid'), root, { recursive: true })
  await mutateFixture(root, name)
  await git(root, 'init', '--quiet')
  await git(root, 'remote', 'add', 'origin', 'https://github.com/freestylefly/awesome-gpt-image-2.git')
  await git(root, 'commit', '--quiet', '--allow-empty', '-m', 'remote base')
  const remoteBase = await git(root, 'rev-parse', 'HEAD')
  await git(root, 'add', '.')
  if (name === 'tracked-executable') await git(root, 'update-index', '--chmod=+x', ['docs', 'templates.md'].join('/'))
  await git(root, 'commit', '--quiet', '-m', 'fixture')
  let commit = await git(root, 'rev-parse', 'HEAD')
  await git(root, 'update-ref', 'refs/remotes/origin/main', name === 'unreachable-remote' ? remoteBase : commit)
  if (name === 'dirty-checkout') await writeFile(join(root, 'untracked.txt'), 'dirty\n')
  if (name === 'wrong-origin') await git(root, 'remote', 'set-url', 'origin', 'https://example.test/not-upstream.git')
  if (name === 'wrong-commit') commit = '0'.repeat(40)
  return { root, commit, cleanup: () => rm(temp, { recursive: true, force: true }) }
}

/** Synchronize one fixed reviewed-checkout fixture and return every emitted file. */
export async function syncFixture(name: string): Promise<Readonly<Record<string, string>>> {
  const checkout = await prepareCheckout(name)
  const outputRoot = await mkdtemp(join(tmpdir(), 'dsh-image-library-output-'))
  try {
    await syncUpstream({ sourceRoot: checkout.root, outputRoot, upstreamCommit: checkout.commit })
    const output: Record<string, string> = {}
    for (const entry of (await readdir(outputRoot)).sort()) {
      output[entry] = await readFile(join(outputRoot, entry), 'utf8')
    }
    return output
  } finally {
    await checkout.cleanup()
    await rm(outputRoot, { recursive: true, force: true })
  }
}

/** Copy the packaged runtime assets into an isolated writable directory. */
export async function copiedAssets(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-image-library-assets-'))
  await cp(packagedAssets, root, { recursive: true })
  return root
}

/** Synchronize the valid fixture into an isolated runtime asset directory. */
export async function syncedAssets(): Promise<{ root: string; cleanup(): Promise<void> }> {
  const checkout = await prepareCheckout('valid')
  const root = await mkdtemp(join(tmpdir(), 'dsh-image-library-synced-'))
  try {
    await syncUpstream({ sourceRoot: checkout.root, outputRoot: root, upstreamCommit: checkout.commit })
  } finally {
    await checkout.cleanup()
  }
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) }
}

/** Replace a JSON resource and retain its containing directory for a test. */
export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, undefined, 2) + '\n')
}

/** Return the directory containing one path. */
export function parent(path: string): string {
  return dirname(path)
}
