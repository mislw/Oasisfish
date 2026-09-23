/** Deterministic Skill and search provider for the skill_search snapshot. */

export const name = 'skill-search-snapshot-fixture'
export const inject = ['skills', 'skillSearch']

/** Register one model-invocable Skill and one stable cited result. */
export function apply(ctx) {
  ctx.skills.register({
    name: 'fixture-skill',
    description: 'Fixture Skill for recorded skill_search coverage.',
    source: 'snapshot',
    content: 'Use skill_search to retrieve declared references.',
    resourceBase: { kind: 'directory', path: process.cwd() },
  })
  ctx.skillSearch.registerProvider('fixture', {
    supports: corpus => corpus.resourceBase.kind === 'directory',
    async search(corpus, request) {
      return {
        skill: corpus.skill.name,
        query: request.query,
        hits: [{
          skill: corpus.skill.name,
          rank: 1,
          score: 1,
          path: 'references/respawn.md',
          headings: ['Player', 'Respawn'],
          startLine: 7,
          endLine: 9,
          excerpt: 'Respawn at the nearest active checkpoint.',
        }],
      }
    },
  })
}
