import { describe, expect, it } from 'vitest'
import { makeWindowsPythonLauncherPortable } from '../scripts/portable-launcher.mjs'

describe('makeWindowsPythonLauncherPortable', () => {
  it('resolves the bundled interpreter relative to the Scripts launcher directory', () => {
    const launcher = Buffer.from('stub#!embedded\0#!C:\\temporary\\python.exe\nzip-data')

    expect(makeWindowsPythonLauncherPortable(launcher)).toEqual(
      Buffer.from('stub#!embedded\0#!<launcher_dir>\\..\\python.exe\nzip-data'),
    )
  })
})
