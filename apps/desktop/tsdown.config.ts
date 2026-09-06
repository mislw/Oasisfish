import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['src/main.ts'],
    format: 'esm',
    platform: 'node',
    target: 'node22',
    clean: true,
    dts: false,
    deps: {
      neverBundle: ['electron', 'electron-updater'],
    },
  },
  {
    entry: { preload: 'src/preload.ts' },
    outDir: 'dist',
    format: 'cjs',
    platform: 'node',
    target: 'node22',
    fixedExtension: false,
    clean: false,
    dts: false,
    deps: {
      neverBundle: ['electron'],
    },
  },
])
