// @vitest-environment jsdom
import { join } from 'node:path'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { installAssembledBootEnv, mountAssembledApp } from './assembled-boot.ts'

const EXPECTED = join(process.cwd(), 'apps/web/tests/snapshots/remote-method-names/assembled-boot.txt')

installAssembledBootEnv()

describe('assembled Remote method names', () => {
  it('boots when a business Remote namespace includes remove', async () => {
    mountAssembledApp()
    const settings = await screen.findByRole('button', { name: 'Settings' }, { timeout: 10_000 })

    await expect(`boot=ready\nsettings=${settings.textContent}\n`).toMatchFileSnapshot(EXPECTED)
  })
})
