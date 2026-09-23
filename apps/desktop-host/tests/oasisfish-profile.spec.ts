import { basename } from 'node:path'
import { describe, expect, it } from 'vitest'
import { desktopPatchFiles } from '../src/index.ts'

describe('Oasisfish Desktop profile', () => {
  it('loads the application overlay only for the Oasisfish client build', () => {
    expect(desktopPatchFiles('official')).toEqual([])
    expect(desktopPatchFiles(undefined)).toEqual([])
    expect(desktopPatchFiles('oasisfish').map(path => basename(path))).toEqual(['oasisfish.cordis.patch.yml'])
  })
})
