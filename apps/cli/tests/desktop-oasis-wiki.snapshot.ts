import { cp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const binScript = fileURLToPath(new URL('./fixtures/desktop-oasis-wiki/snapshot.ts', import.meta.url))
const configPath = fileURLToPath(new URL('./fixtures/desktop-oasis-wiki/cordis.yml', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const bundledSkills = fileURLToPath(new URL('../../desktop/resources/bundled-skills/', import.meta.url))

describe('Oasisfish Desktop Skill retrieval composition', () => {
  it('searches exactly the declared bundled corpora through the real Loader composition', async () => {
    const result = await runLoaderSmoke({
      label: 'Oasisfish Desktop Skill search snapshot',
      tempDirPrefix: 'desktop-oasis-wiki-search-',
      binScript,
      libBinScript: binScript,
      configPath,
      tsconfigPath,
      processTimeoutMs: 180_000,
      prepare: async (cwd) => {
        const root = join(cwd, 'bundled-skills')
        await cp(bundledSkills, root, { recursive: true })
        const undeclared = join(root, 'undeclared-skill')
        await mkdir(join(undeclared, 'references'), { recursive: true })
        await writeFile(join(undeclared, 'SKILL.md'), [
          '---',
          'name: undeclared-skill',
          'description: Must remain unavailable to corpus search.',
          '---',
          '',
          '# Undeclared',
          '',
          'Hidden resource.',
          '',
        ].join('\n'))
        await writeFile(join(undeclared, 'references', 'hidden.md'), '# Hidden\n\nNever index this resource.\n')
      },
      env: {
        DSH_BUNDLED_SKILL_DIR: 'bundled-skills',
        DSH_SKILL_SEARCH_FIXTURE_PROVIDER: '1',
      },
    })
    const snapshot = JSON.parse(result.stdout) as unknown
    expect(result.stderr).toBe('')
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "imageGuidance": {
          "isError": false,
          "text": {
            "text": "1. references/visual-recipes.md:7-7
      Headings: Visual Recipes > Game Item Icon
      Design one unmistakable silhouette centered within a stable square composition. Use a slight three-quarter view when volume matters, controlled perspective, generous negative space, and separation between the object and background. Establish a bright focal edge, readable material cues, selective wear, and a restrained rarity accent. Keep the image legible at thumbnail size. Exclude extra objects, cropped edges, tiny labels, random symbols, clutter, and muddy shadows.",
            "type": "text",
          },
          "value": {
            "count": 1,
            "hits": [
              {
                "endLine": 7,
                "excerpt": "Design one unmistakable silhouette centered within a stable square composition. Use a slight three-quarter view when volume matters, controlled perspective, generous negative space, and separation between the object and background. Establish a bright focal edge, readable material cues, selective wear, and a restrained rarity accent. Keep the image legible at thumbnail size. Exclude extra objects, cropped edges, tiny labels, random symbols, clutter, and muddy shadows.",
                "headings": [
                  "Visual Recipes",
                  "Game Item Icon",
                ],
                "path": "references/visual-recipes.md",
                "rank": 1,
                "score": 0.03177805800756621,
                "startLine": 7,
              },
            ],
            "query": "Game Item Icon cropped edges rarity accent",
            "skill": "ai-image-prompts",
          },
        },
        "oasis": {
          "isError": false,
          "text": {
            "text": "1. references/mcp-integration.md:241-248
      Headings: MCP Integration > MCP Tool Roles
      Use these UGCAskQ tools in this order:

      - \`ue_read\`: read editor context, API docs, schemas, asset registry, widget tree, DataTable structure, selected actors.
      - \`ue_plan_submit\`: submit a PRV mutation plan when doing CDO, WidgetTree, DataTable, map, or asset writes.
      - \`ue_py\`: execute editor Python. For reads, no plan is needed. For writes, include \`transaction_name\` and a YAML \`plan\`.
      - \`ue_pie\`: control PIE lifecycle and perform fast Lua runtime iteration. Use it instead of computer control for PIE debugging.

      If no direct \`mcp__ugcaskq__...\` namespace is exposed, connect to the SSE URL from \`.mcp.json\` and call JSON-RPC methods:",
            "type": "text",
          },
          "value": {
            "count": 1,
            "hits": [
              {
                "endLine": 248,
                "excerpt": "Use these UGCAskQ tools in this order:

      - \`ue_read\`: read editor context, API docs, schemas, asset registry, widget tree, DataTable structure, selected actors.
      - \`ue_plan_submit\`: submit a PRV mutation plan when doing CDO, WidgetTree, DataTable, map, or asset writes.
      - \`ue_py\`: execute editor Python. For reads, no plan is needed. For writes, include \`transaction_name\` and a YAML \`plan\`.
      - \`ue_pie\`: control PIE lifecycle and perform fast Lua runtime iteration. Use it instead of computer control for PIE debugging.

      If no direct \`mcp__ugcaskq__...\` namespace is exposed, connect to the SSE URL from \`.mcp.json\` and call JSON-RPC methods:",
                "headings": [
                  "MCP Integration",
                  "MCP Tool Roles",
                ],
                "path": "references/mcp-integration.md",
                "rank": 1,
                "score": 0.01639344262295082,
                "startLine": 241,
              },
            ],
            "query": "UGCAskQ DataTable",
            "skill": "oasis-wiki",
          },
        },
        "schemaCount": 1,
        "skillNames": [
          "ai-image-prompts",
          "oasis-wiki",
          "undeclared-skill",
        ],
        "undeclared": {
          "code": "CORPUS_UNDECLARED",
          "isError": true,
          "text": {
            "text": "Error: Skill "undeclared-skill" has no declared searchable corpus.",
            "type": "text",
          },
        },
      }
    `)
  }, 210_000)
})
