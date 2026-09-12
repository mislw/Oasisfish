import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  validateDesktopReleaseVersion,
  validateReleaseTag,
  windowsVersionFor,
} from '../scripts/validate-release-tag.mjs'

describe('Oasisfish release contract', () => {
  it('maps the canonical date revision to Windows-compatible metadata', async () => {
    const desktopPackage = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      version?: string
      shortVersion?: string
      shortVersionWindows?: string
      scripts?: Record<string, string>
    }

    expect(desktopPackage.version).toBe('1.20260912.4')
    expect(desktopPackage.shortVersion).toBe('1.2026.912.4')
    expect(desktopPackage.shortVersionWindows).toBe('1.2026.912.4')
    expect(desktopPackage.scripts?.['package:publish:prepared'])
      .toBe('electron-builder --win nsis --x64 --publish always')
    expect(validateDesktopReleaseVersion(
      desktopPackage.version ?? '',
      desktopPackage.shortVersion ?? '',
      desktopPackage.shortVersionWindows ?? '',
    )).toBe('1.20260912.4')
  })

  it.each([
    ['1.20260912.4', '1.2026.912.4'],
    ['2.20260102.1', '2.2026.102.1'],
  ])('maps release version %s to Windows metadata %s', (version, windowsVersion) => {
    expect(windowsVersionFor(version)).toBe(windowsVersion)
  })

  it.each(['1.260912.4', '1.20260230.1', '0.20260912.1', '1.20260912.0'])('rejects invalid release version %s', (version) => {
    expect(() => windowsVersionFor(version)).toThrow()
  })

  it('rejects inconsistent Windows version metadata', () => {
    expect(() => validateDesktopReleaseVersion('1.20260912.4', '1.2026.912.3', '1.2026.912.4'))
      .toThrow('requires shortVersion and shortVersionWindows 1.2026.912.4')
  })

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
    expect(workflow).toContain('$shortVersionWindows')
    expect(workflow).toContain('apps/desktop/tests')
    expect(workflow).toContain('packages/client/ui-desktop-update/tests')
    expect(workflow).toContain('apps/web/tests/desktop-update.snapshot.ts')
    expect(workflow).toContain('pnpm run verify-cordis-config')
    expect(workflow).toContain('pnpm run doc-sync')
    const assembleIndex = workflow.indexOf('run package:dir')
    const verifyIndex = workflow.indexOf('- name: Verify desktop update paths')
    const publishIndex = workflow.indexOf('run package:publish:prepared')
    expect(assembleIndex).toBeGreaterThan(-1)
    expect(verifyIndex).toBeGreaterThan(assembleIndex)
    expect(publishIndex).toBeGreaterThan(verifyIndex)
    expect(workflow).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}')
    expect(workflow).toContain('Oasisfish-*.exe')
    expect(workflow).toContain('Oasisfish-*.exe.blockmap')
    expect(workflow).toContain('latest.yml')
    expect(workflow).not.toMatch(/\.env|DEEPSEEK_API_KEY|OPENAI_API_KEY|IMAGE_API_KEY/)
    expect(workflow.match(/secrets\.[A-Z0-9_]+/g)).toEqual(['secrets.GITHUB_TOKEN'])
  })
})
