import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CLI_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = join(CLI_ROOT, '..', '..')

describe('shipped Workbench MCP integration', () => {
  it('mounts the authenticated Workbench MCP client in the standard preset', async () => {
    const preset = await readFile(
      join(REPO_ROOT, 'packages', 'preset', 'agent-presets', 'presets', 'standard', 'agent.cordis.yml'),
      'utf8',
    )

    expect(preset).toContain('@deepseek-ai/dsh-mcp-client')
    expect(preset).toContain('AI_WORKSPACE_MCP_URL')
    expect(preset).toContain('HARNESS_TOOL_SECRET')
    expect(preset).toContain('serverName: workbench')
    expect(preset).toContain('approvalRequiredTools:')
    expect(preset).toContain('calendar_create')
    expect(preset).toContain('document_delete')
  })

  it('declares the MCP client in the Web app resolver manifest', async () => {
    const manifest = JSON.parse(
      await readFile(join(REPO_ROOT, 'packages', 'bundle', 'web-app', 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> }

    expect(manifest.dependencies?.['@deepseek-ai/dsh-mcp-client']).toBe('workspace:^')
  })
})
