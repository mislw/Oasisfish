import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const binScript = fileURLToPath(new URL('./fixtures/desktop-oasis-wiki/snapshot.ts', import.meta.url))
const configPath = fileURLToPath(new URL('./fixtures/desktop-oasis-wiki/cordis.yml', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const bundledSkillDir = fileURLToPath(new URL('../../desktop/bundled-skills/', import.meta.url))
const bundledSkillRoot = fileURLToPath(new URL('../../desktop/bundled-skills/oasis-wiki/', import.meta.url))
  .replace(/[\\/]$/, '')
const imagePromptSkillRoot = fileURLToPath(new URL('../../desktop/bundled-skills/ai-image-prompts/', import.meta.url))
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
      imagePromptSummary: { resourceBase: { path: string } }
      imagePromptLoaded: { resourceBase: { path: string } }
      imagePromptSearch: {
        skill: string
        query: string
        count: number
        hits: Array<{ path: string; headings: string[]; startLine: number; endLine: number; excerpt: string }>
      }
    }

    expect(result.stderr).toBe('')
    expect(snapshot.summary.resourceBase.path).toBe(bundledSkillRoot)
    expect(snapshot.loaded.resourceBase.path).toBe(bundledSkillRoot)
    expect(snapshot.search.hits.length).toBeGreaterThan(0)
    expect(snapshot.search.hits.every(hit => hit.path.startsWith('references/'))).toBe(true)
    expect(snapshot.search.hits.every(hit => hit.startLine >= 1 && hit.endLine >= hit.startLine)).toBe(true)
    expect(snapshot.imagePromptSummary.resourceBase.path).toBe(imagePromptSkillRoot)
    expect(snapshot.imagePromptLoaded.resourceBase.path).toBe(imagePromptSkillRoot)
    expect(snapshot.imagePromptSearch.hits).toHaveLength(5)
    expect(snapshot.imagePromptSearch.hits.some(hit => hit.headings.includes('Game Item Icon'))).toBe(true)
    expect(snapshot.imagePromptSearch.hits.every(hit => hit.path === 'references/visual-recipes.md')).toBe(true)
    snapshot.summary.resourceBase.path = '{{bundledSkillRoot}}'
    snapshot.loaded.resourceBase.path = '{{bundledSkillRoot}}'
    snapshot.imagePromptSummary.resourceBase.path = '{{imagePromptSkillRoot}}'
    snapshot.imagePromptLoaded.resourceBase.path = '{{imagePromptSkillRoot}}'
    snapshot.search.hits = snapshot.search.hits.map(hit => ({
      ...hit,
      excerpt: hit.excerpt.split(/\r?\n/u, 1)[0] ?? '',
    }))
    snapshot.imagePromptSearch.hits = snapshot.imagePromptSearch.hits.map(hit => ({
      ...hit,
      excerpt: hit.excerpt.split(/\r?\n/u, 1)[0] ?? '',
    }))
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "catalogIncludesImagePromptSkill": true,
        "catalogIncludesSkill": true,
        "imagePromptLoaded": {
          "firstHeading": "# AI Image Prompt Refinement",
          "name": "ai-image-prompts",
          "provider": "filesystem",
          "resourceBase": {
            "kind": "directory",
            "path": "{{imagePromptSkillRoot}}",
          },
        },
        "imagePromptSearch": {
          "count": 5,
          "hits": [
            {
              "endLine": 47,
              "excerpt": "Define the communication goal, reading order, sections, diagram type, icon system, labels, units, and visual hierarchy. Reserve enough space for exact text and numeric values. Use a limited palette with semantic color assignments and strong contrast. Exclude invented data, illegible labels, decorative charts, inconsistent units, and unsupported conclusions.",
              "headings": [
                "Visual Recipes",
                "Infographic",
              ],
              "path": "references/visual-recipes.md",
              "rank": 1,
              "score": 0.03125,
              "startLine": 47,
            },
            {
              "endLine": 23,
              "excerpt": "Separate decorative art from interaction zones. Define the safe center, edge framing, panel hierarchy, corner treatment, material language, and contrast reserve for native text and controls. Keep ornament density higher near borders and lower behind content. Use lighting and texture that support legibility rather than imitating clickable controls. Exclude baked-in placeholder text, fake buttons, tiny labels, unreadable ornament, and noisy central detail.",
              "headings": [
                "Visual Recipes",
                "UI Background And Frame",
              ],
              "path": "references/visual-recipes.md",
              "rank": 2,
              "score": 0.014285714285714285,
              "startLine": 23,
            },
            {
              "endLine": 35,
              "excerpt": "Specify exact product geometry, material, finish, viewing angle, lens character, surface, background, shadow behavior, and brand palette. Use controlled studio key, fill, rim, and reflections that describe the form without hiding edges. Preserve logos and labels exactly when supplied. Exclude warped packaging, invented branding, unreadable labels, duplicate products, dirty highlights, and floating contact shadows.",
              "headings": [
                "Visual Recipes",
                "Product Hero Image",
              ],
              "path": "references/visual-recipes.md",
              "rank": 3,
              "score": 0.016129032258064516,
              "startLine": 35,
            },
            {
              "endLine": 15,
              "excerpt": "Anchor the design in a believable skeletal structure, weight distribution, locomotion, and ecological role. Describe head shape, limbs, hide or scales, distinctive silhouette features, and controlled fantasy exaggeration. Use environmental scale cues and lighting that separates the creature from the scene. Exclude random horns, repeated eyes, decorative noise, broken joints, and weightless poses.",
              "headings": [
                "Visual Recipes",
                "Creature And Beast",
              ],
              "path": "references/visual-recipes.md",
              "rank": 4,
              "score": 0.031054405392392875,
              "startLine": 15,
            },
            {
              "endLine": 7,
              "excerpt": "Design one unmistakable silhouette centered within a stable square composition. Use a slight three-quarter view when volume matters, controlled perspective, generous negative space, and separation between the object and background. Establish a bright focal edge, readable material cues, selective wear, and a restrained rarity accent. Keep the image legible at thumbnail size. Exclude extra objects, cropped edges, tiny labels, random symbols, clutter, and muddy shadows.",
              "headings": [
                "Visual Recipes",
                "Game Item Icon",
              ],
              "path": "references/visual-recipes.md",
              "rank": 5,
              "score": 0.03009207275993712,
              "startLine": 7,
            },
          ],
          "query": "Game Item Icon unmistakable silhouette thumbnail size",
          "skill": "ai-image-prompts",
        },
        "imagePromptSummary": {
          "description": "Refine brief image requests into detailed generation-ready prompts using local visual recipes. Use before image_generate for game assets, UI imagery, posters, portraits, products, environments, illustrations, or reference-image edits. Do not use for non-image tasks or as a replacement for the configured image model.",
          "invocation": {
            "modelInvocable": true,
            "userInvocable": true,
          },
          "name": "ai-image-prompts",
          "provider": "filesystem",
          "resourceBase": {
            "kind": "directory",
            "path": "{{imagePromptSkillRoot}}",
          },
          "source": "bundled",
        },
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
          {
            "arguments": "{"name":"ai-image-prompts","query":"Game Item Icon unmistakable silhouette thumbnail size","limit":5}",
            "callId": "desktop-image-prompts-search",
            "name": "skill_search",
            "step": 1,
            "turn": 1,
            "type": "tool/call",
          },
          {
            "callId": "desktop-image-prompts-search",
            "content": [
              {
                "text": "1. references/visual-recipes.md:47-47
      Headings: Visual Recipes > Infographic
      Define the communication goal, reading order, sections, diagram type, icon system, labels, units, and visual hierarchy. Reserve enough space for exact text and numeric values. Use a limited palette with semantic color assignments and strong contrast. Exclude invented data, illegible labels, decorative charts, inconsistent units, and unsupported conclusions.

      2. references/visual-recipes.md:23-23
      Headings: Visual Recipes > UI Background And Frame
      Separate decorative art from interaction zones. Define the safe center, edge framing, panel hierarchy, corner treatment, material language, and contrast reserve for native text and controls. Keep ornament density higher near borders and lower behind content. Use lighting and texture that support legibility rather than imitating clickable controls. Exclude baked-in placeholder text, fake buttons, tiny labels, unreadable ornament, and noisy central detail.

      3. references/visual-recipes.md:35-35
      Headings: Visual Recipes > Product Hero Image
      Specify exact product geometry, material, finish, viewing angle, lens character, surface, background, shadow behavior, and brand palette. Use controlled studio key, fill, rim, and reflections that describe the form without hiding edges. Preserve logos and labels exactly when supplied. Exclude warped packaging, invented branding, unreadable labels, duplicate products, dirty highlights, and floating contact shadows.

      4. references/visual-recipes.md:15-15
      Headings: Visual Recipes > Creature And Beast
      Anchor the design in a believable skeletal structure, weight distribution, locomotion, and ecological role. Describe head shape, limbs, hide or scales, distinctive silhouette features, and controlled fantasy exaggeration. Use environmental scale cues and lighting that separates the creature from the scene. Exclude random horns, repeated eyes, decorative noise, broken joints, and weightless poses.

      5. references/visual-recipes.md:7-7
      Headings: Visual Recipes > Game Item Icon
      Design one unmistakable silhouette centered within a stable square composition. Use a slight three-quarter view when volume matters, controlled perspective, generous negative space, and separation between the object and background. Establish a bright focal edge, readable material cues, selective wear, and a restrained rarity accent. Keep the image legible at thumbnail size. Exclude extra objects, cropped edges, tiny labels, random symbols, clutter, and muddy shadows.",
                "type": "text",
              },
            ],
            "isError": false,
            "meta": {
              "hits": [
                {
                  "excerpt": "Define the communication goal, reading order, sections, diagram type, icon system, labels, units, and visual hierarchy. Reserve enough space for exact text and numeric values. Use a limited palette with semantic color assignments and strong contrast. Exclude invented data, illegible labels, decorative charts, inconsistent units, and unsupported conclusions.",
                  "path": "references/visual-recipes.md",
                  "startLine": 47,
                },
                {
                  "excerpt": "Separate decorative art from interaction zones. Define the safe center, edge framing, panel hierarchy, corner treatment, material language, and contrast reserve for native text and controls. Keep ornament density higher near borders and lower behind content. Use lighting and texture that support legibility rather than imitating clickable controls. Exclude baked-in placeholder text, fake buttons, tiny labels, unreadable ornament, and noisy central detail.",
                  "path": "references/visual-recipes.md",
                  "startLine": 23,
                },
                {
                  "excerpt": "Specify exact product geometry, material, finish, viewing angle, lens character, surface, background, shadow behavior, and brand palette. Use controlled studio key, fill, rim, and reflections that describe the form without hiding edges. Preserve logos and labels exactly when supplied. Exclude warped packaging, invented branding, unreadable labels, duplicate products, dirty highlights, and floating contact shadows.",
                  "path": "references/visual-recipes.md",
                  "startLine": 35,
                },
                {
                  "excerpt": "Anchor the design in a believable skeletal structure, weight distribution, locomotion, and ecological role. Describe head shape, limbs, hide or scales, distinctive silhouette features, and controlled fantasy exaggeration. Use environmental scale cues and lighting that separates the creature from the scene. Exclude random horns, repeated eyes, decorative noise, broken joints, and weightless poses.",
                  "path": "references/visual-recipes.md",
                  "startLine": 15,
                },
                {
                  "excerpt": "Design one unmistakable silhouette centered within a stable square composition. Use a slight three-quarter view when volume matters, controlled perspective, generous negative space, and separation between the object and background. Establish a bright focal edge, readable material cues, selective wear, and a restrained rarity accent. Keep the image legible at thumbnail size. Exclude extra objects, cropped edges, tiny labels, random symbols, clutter, and muddy shadows.",
                  "path": "references/visual-recipes.md",
                  "startLine": 7,
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
