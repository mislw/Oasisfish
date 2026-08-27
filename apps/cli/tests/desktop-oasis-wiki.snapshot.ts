import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const binScript = fileURLToPath(new URL('./fixtures/desktop-oasis-wiki/snapshot.ts', import.meta.url))
const configPath = fileURLToPath(new URL('./fixtures/desktop-oasis-wiki/cordis.yml', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const bundledSkillDir = fileURLToPath(new URL('../../desktop/bundled-skills/', import.meta.url))
const bundledSkillRoot = fileURLToPath(new URL('../../desktop/bundled-skills/oasis-wiki/', import.meta.url))
  .replace(/[\\/]$/, '')

describe('desktop Oasis Wiki assembled snapshot', () => {
  it('desktop-bundled skill search', async () => {
    const result = await runLoaderSmoke({
      label: 'desktop Oasis Wiki skill snapshot',
      tempDirPrefix: 'desktop-oasis-wiki-snapshot-',
      binScript,
      libBinScript: binScript,
      configPath,
      tsconfigPath,
      env: { DSH_BUNDLED_SKILL_DIR: bundledSkillDir, NODE_NO_WARNINGS: '1' },
    })
    const snapshot = JSON.parse(result.stdout) as {
      summary: { resourceBase: { path: string } }
      loaded: { resourceBase: { path: string } }
      search: {
        skill: string
        query: string
        count: number
        hits: Array<{ path: string; headings: string[]; startLine: number; endLine: number; excerpt: string }>
      }
      transcript: unknown[]
    }

    expect(result.stderr).toBe('')
    expect(snapshot.summary.resourceBase.path).toBe(bundledSkillRoot)
    expect(snapshot.loaded.resourceBase.path).toBe(bundledSkillRoot)
    expect(snapshot.search.hits.length).toBeGreaterThan(0)
    expect(snapshot.search.hits.every(hit => hit.path.startsWith('references/'))).toBe(true)
    expect(snapshot.search.hits.every(hit => hit.startLine >= 1 && hit.endLine >= hit.startLine)).toBe(true)
    snapshot.summary.resourceBase.path = '{{bundledSkillRoot}}'
    snapshot.loaded.resourceBase.path = '{{bundledSkillRoot}}'
    snapshot.search.hits = snapshot.search.hits.map(hit => ({
      ...hit,
      excerpt: hit.excerpt.split(/\r?\n/u, 1)[0] ?? '',
    }))
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "catalogIncludesSkill": true,
        "loaded": {
          "firstHeading": "# Oasis Wiki",
          "name": "oasis-wiki",
          "provider": "filesystem",
          "resourceBase": {
            "kind": "directory",
            "path": "{{bundledSkillRoot}}",
          },
        },
        "search": {
          "count": 1,
          "hits": [
            {
              "endLine": 204,
              "excerpt": "Use these UGCAskQ tools in this order:",
              "headings": [
                "MCP Integration",
                "MCP Tool Roles",
              ],
              "path": "references/mcp-integration.md",
              "rank": 1,
              "score": 0.01639344262295082,
              "startLine": 193,
            },
          ],
          "query": "UGCAskQ DataTable",
          "skill": "oasis-wiki",
        },
        "summary": {
          "description": "Use for Oasis/绿洲启元/绿洲起源/和平精英 UGC projects, UGC Lua, UGCAskQ MCP/editor automation, DataTable/WidgetBlueprint, logs/debugging, project planning, game UI systems, Cowart UI generation, or requests such as 做一下 UI 生成, 我有一个 UI 需要生图, 帮我做个 UI, and 启动 UI 生图工具. Trigger on common UGC classes and APIs including GameMode, GameState, PlayerController, UIManager, EventDefine, UnrealNetwork, LuaQuickFireEvent, UGCGameSystem, RPC, and replication.",
          "invocation": {
            "modelInvocable": true,
            "userInvocable": true,
          },
          "name": "oasis-wiki",
          "provider": "filesystem",
          "resourceBase": {
            "kind": "directory",
            "path": "{{bundledSkillRoot}}",
          },
          "source": "bundled",
        },
        "transcript": [
          {
            "arguments": "{"name":"oasis-wiki","query":"UGCAskQ DataTable","limit":1}",
            "callId": "desktop-oasis-wiki-search",
            "name": "skill_search",
            "step": 1,
            "turn": 1,
            "type": "tool/call",
          },
          {
            "callId": "desktop-oasis-wiki-search",
            "content": [
              {
                "text": "1. references/mcp-integration.md:193-204
      Headings: MCP Integration > MCP Tool Roles
      Use these UGCAskQ tools in this order:

      - \`ue_read\`: read editor context, API docs, schemas, asset registry, widget tree, DataTable structure, selected actors.
      - \`ue_plan_submit\`: submit a PRV mutation plan when doing CDO, WidgetTree, DataTable, map, or asset writes.
      - \`ue_py\`: execute editor Python. For reads, no plan is needed. For writes, include \`transaction_name\` and a YAML \`plan\`.

      If no direct \`mcp__ugcaskq__...\` namespace is exposed, connect to the SSE URL from \`.mcp.json\` and call JSON-RPC methods:

      1. \`initialize\`
      2. \`notifications/initialized\`
      3. \`tools/list\`
      4. \`tools/call\` with \`name: ue_read | ue_py | ue_plan_submit\`",
                "type": "text",
              },
            ],
            "isError": false,
            "meta": {
              "hits": [
                {
                  "excerpt": "Use these UGCAskQ tools in this order:

      - \`ue_read\`: read editor context, API docs, schemas, asset registry, widget tree, DataTable structure, selected actors.
      - \`ue_plan_submit\`: submit a PRV mutation plan when doing CDO, WidgetTree, DataTable, map, or asset writes.
      - \`ue_py\`: execute editor Python. For reads, no plan is needed. For writes, include \`transaction_name\` and a YAML \`plan\`.

      If no direct \`mcp__ugcaskq__...\` namespace is exposed, connect to the SSE URL from \`.mcp.json\` and call JSON-RPC methods:

      1. \`initialize\`
      2. \`notifications/initialized\`
      3. \`tools/list\`
      4. \`tools/call\` with \`name: ue_read | ue_py | ue_plan_submit\`",
                  "path": "references/mcp-integration.md",
                  "startLine": 193,
                },
              ],
            },
            "step": 1,
            "turn": 1,
            "type": "tool/result",
          },
        ],
      }
    `)
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
