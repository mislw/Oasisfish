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
  it('advertises and loads the desktop-bundled skill through the shipped app', async () => {
    const result = await runLoaderSmoke({
      label: 'desktop Oasis Wiki skill snapshot',
      tempDirPrefix: 'desktop-oasis-wiki-snapshot-',
      binScript,
      libBinScript: binScript,
      configPath,
      tsconfigPath,
      env: { DSH_BUNDLED_SKILL_DIR: bundledSkillDir },
    })
    const snapshot = JSON.parse(result.stdout) as {
      summary: { resourceBase: { path: string } }
      loaded: { resourceBase: { path: string } }
    }

    expect(result.stderr).toBe('')
    expect(snapshot.summary.resourceBase.path).toBe(bundledSkillRoot)
    expect(snapshot.loaded.resourceBase.path).toBe(bundledSkillRoot)
    snapshot.summary.resourceBase.path = '{{bundledSkillRoot}}'
    snapshot.loaded.resourceBase.path = '{{bundledSkillRoot}}'
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
      }
    `)
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
