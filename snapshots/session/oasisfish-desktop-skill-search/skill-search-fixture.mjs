/** Deterministic local provider for the Oasisfish Desktop Skill search snapshot. */

import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const name = 'oasisfish-desktop-skill-search-snapshot-fixture'
export const inject = ['skillSearch']

/** Register the production local provider with deterministic embeddings. */
export async function apply(ctx) {
  const packageEntry = join(
    process.cwd(),
    '.dsh',
    'profiles',
    'headless',
    'node_modules',
    '@deepseek-ai',
    'dsh-skill-search-local',
    'lib',
    'index.js',
  )
  const {
    DeterministicFixtureEmbedder,
    LocalSkillSearchProvider,
    openSkillSearchStore,
  } = await import(pathToFileURL(packageEntry).href)
  const provider = new LocalSkillSearchProvider(
    await openSkillSearchStore(join(process.cwd(), '.dsh', 'skill-search-snapshot.sqlite')),
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
  let unregister
  try {
    unregister = ctx.skillSearch.registerProvider('snapshot-local', provider)
    ctx.effect(() => async () => {
      unregister?.()
      await provider.dispose()
    }, 'Oasisfish Desktop Skill search snapshot provider')
  } catch (error) {
    unregister?.()
    await provider.dispose()
    throw error
  }
}
