import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boot, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SkillSearchProviderName } from '@deepseek-ai/dsh-skill-search'
import {
  DeterministicFixtureEmbedder,
  LocalSkillSearchProvider,
  openSkillSearchStore,
} from '@deepseek-ai/dsh-skill-search-local'

const overlayPath = process.argv[2]
if (overlayPath === undefined) throw new Error('desktop Oasis Wiki snapshot requires an overlay path')
const rootConfigPath = fileURLToPath(new URL('../../../../../packages/bundle/base/tests/fixtures/root.cordis.yml', import.meta.url))
const basePatchPath = fileURLToPath(new URL('../../../../../packages/bundle/base/cordis.patch.yml', import.meta.url))
const desktopPatchPath = fileURLToPath(new URL('../../../../desktop-host/oasisfish.cordis.patch.yml', import.meta.url))
const ctx = await boot('desktop-oasis-wiki-snapshot', rootConfigPath, [
  ...loadOverlayPatches('desktop-oasis-wiki-snapshot', basePatchPath),
  ...loadOverlayPatches('desktop-oasis-wiki-snapshot', desktopPatchPath),
  ...loadOverlayPatches('desktop-oasis-wiki-snapshot', overlayPath),
])
const cacheRoot = process.env.DSH_SKILL_SEARCH_FIXTURE_PROVIDER === '1'
  ? await mkdtemp(join(tmpdir(), 'desktop-oasis-wiki-search-'))
  : undefined
const fixtureProvider = cacheRoot === undefined
  ? undefined
  : new LocalSkillSearchProvider(
    await openSkillSearchStore(join(cacheRoot, 'skill-search.sqlite')),
    new DeterministicFixtureEmbedder(32),
    {
      providerName: 'snapshot-local',
      chunkTargetCodePoints: 800,
      chunkMaxCodePoints: 1200,
      chunkOverlapCodePoints: 120,
      lexicalCandidates: 50,
      vectorCandidates: 50,
      rrfK: 60,
      headingBoost: 0.1,
      pathBoost: 0.05,
      mmrLambda: 0.6,
      defaultResultCount: 5,
      maxResultCount: 10,
    },
  )
const unregisterFixtureProvider = fixtureProvider === undefined
  ? undefined
  : ctx.skillSearch.registerProvider(SkillSearchProviderName('snapshot-local'), fixtureProvider)

async function search(name: string, query: string): Promise<unknown> {
  const result = await ctx.tools.execute({
    callId: ToolCallId(`desktop-skill-search-${name}`),
    name: 'skill_search',
    arguments: { name, query, limit: 1 },
    signal: new AbortController().signal,
  })
  return result.isError
    ? { isError: true, code: result.error.info?.code, text: result.content[0] }
    : { isError: false, value: result.value, text: result.content[0] }
}

try {
  const schemas = ctx.tools.schemas().filter(tool => tool.name === 'skill_search')
  process.stdout.write(`${JSON.stringify({
    schemaCount: schemas.length,
    skillNames: (await ctx.skills.list()).map(skill => skill.name).sort(),
    oasis: await search('oasis-wiki', 'UGCAskQ DataTable'),
    imageGuidance: await search('ai-image-prompts', 'Game Item Icon cropped edges rarity accent'),
    undeclared: await search('undeclared-skill', 'hidden resource'),
  })}\n`)
} finally {
  unregisterFixtureProvider?.()
  await fixtureProvider?.dispose()
  await ctx.fiber.dispose()
  if (cacheRoot !== undefined) await rm(cacheRoot, { recursive: true, force: true })
}
