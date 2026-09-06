import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { validateReleaseTag } from '../scripts/validate-release-tag.mjs'

describe('Oasisfish release contract', () => {
  it.each([
    ['v1.2.3', '1.2.3'],
    ['v1.2.3-rc.4', '1.2.3-rc.4'],
  ])('accepts matching tag %s for version %s', (tag, version) => {
    expect(validateReleaseTag(tag, version)).toBe(tag)
  })

  it.each([
    ['', '1.2.3'],
    ['1.2.3', '1.2.3'],
    ['v1.2.4', '1.2.3'],
  ])('rejects invalid tag %j for version %s', (tag, version) => {
    expect(() => validateReleaseTag(tag, version)).toThrow(`v${version}`)
  })

  it('publishes only matching Windows desktop tags with the GitHub repository token', async () => {
    const workflow = await readFile(new URL('../../../.github/workflows/oasisfish-release.yml', import.meta.url), 'utf8')

    expect(workflow).toContain('tags:')
    expect(workflow).toContain("- 'v*'")
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('contents: write')
    expect(workflow).toContain('runs-on: windows-latest')
    expect(workflow).toContain('pnpm/action-setup@v4')
    expect(workflow).toContain('actions/setup-node@v6')
    expect(workflow).toContain("node-version: '24'")
    expect(workflow).toContain('pnpm install --frozen-lockfile')
    expect(workflow).toContain('validate-release-tag.mjs')
    expect(workflow).toContain('apps/desktop/tests')
    expect(workflow).toContain('packages/client/ui-desktop-update/tests')
    expect(workflow).toContain('apps/web/tests/desktop-update.snapshot.ts')
    expect(workflow).toContain('pnpm run verify-cordis-config')
    expect(workflow).toContain('pnpm run doc-sync')
    expect(workflow).toContain('package:publish')
    expect(workflow).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}')
    expect(workflow).toContain('Oasisfish-*.exe')
    expect(workflow).toContain('Oasisfish-*.exe.blockmap')
    expect(workflow).toContain('latest.yml')
    expect(workflow).not.toMatch(/\.env|DEEPSEEK_API_KEY|OPENAI_API_KEY|IMAGE_API_KEY/)
    expect(workflow.match(/secrets\.[A-Z0-9_]+/g)).toEqual(['secrets.GITHUB_TOKEN'])
  })
})
