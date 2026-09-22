import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initProfile, PROFILE_TEMPLATES, readProfileManifest } from '@deepseek-ai/dsh-app-boot'
import {
  DESKTOP_PROFILE_DEFAULT_BUNDLES,
  DESKTOP_WALLPAPER_BUNDLE,
  createDevelopmentProjectMetadata,
  createRuntimeProjectMetadata,
} from '../src/project-manager.ts'
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../src/host-protocol.ts'
import type { DesktopRelease } from '../src/release.ts'

const roots: string[] = []

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-metadata-test-'))
  roots.push(root)
  return root
}

function release(): DesktopRelease {
  return {
    schemaVersion: 1,
    version: '1.2.3',
    hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
    nodeVersion: '24.17.0',
    pnpmVersion: '11.7.0',
  }
}

function seedPackageSet(projectDir: string): void {
  const packageDir = join(projectDir, 'desktop-packages')
  mkdirSync(packageDir, { recursive: true })
  const packages = ['@deepseek-ai/dsh', '@deepseek-ai/dsh-desktop-host']
    .map((name, index) => {
      const file = `package-${String(index)}.tgz`
      const content = Buffer.from(name)
      writeFileSync(join(packageDir, file), content)
      return {
        name,
        version: '1.2.3',
        file,
        bytes: content.byteLength,
        integrity: `sha512-${createHash('sha512').update(content).digest('base64')}`,
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))
  writeFileSync(join(projectDir, 'desktop-packages.json'), `${JSON.stringify({ schemaVersion: 1, packages }, undefined, 2)}\n`)
}

function bundles(projectDir: string): readonly string[] {
  return readProfileManifest('test', projectDir).dsh?.profile?.bundles ?? []
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Desktop project metadata', () => {
  it('uses the Desktop defaults for development metadata', () => {
    const projectDir = temporaryRoot()
    createDevelopmentProjectMetadata(projectDir, release())
    expect(bundles(projectDir)).toEqual(DESKTOP_PROFILE_DEFAULT_BUNDLES)
  })

  it('uses the Desktop defaults for runtime metadata', () => {
    const projectDir = temporaryRoot()
    seedPackageSet(projectDir)
    createRuntimeProjectMetadata(projectDir, release())
    expect(bundles(projectDir)).toEqual(DESKTOP_PROFILE_DEFAULT_BUNDLES)
  })

  it('keeps the ordinary Web template and CLI profile free of Desktop defaults', () => {
    expect(PROFILE_TEMPLATES.web!.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
    ])
    expect(PROFILE_TEMPLATES.web!.bundles).not.toContain(DESKTOP_WALLPAPER_BUNDLE)
    const profileDir = join(temporaryRoot(), 'profiles', 'web')
    initProfile(profileDir, PROFILE_TEMPLATES.web!.bundles)
    expect(bundles(profileDir)).toEqual(PROFILE_TEMPLATES.web!.bundles)
    expect(readFileSync(join(profileDir, 'package.json'), 'utf8')).not.toContain(DESKTOP_WALLPAPER_BUNDLE)
  })
})
