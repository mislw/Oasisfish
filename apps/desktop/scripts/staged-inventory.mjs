import { access } from 'node:fs/promises'
import { join } from 'node:path'

export const STAGED_REQUIRED_FILES = Object.freeze([
  'harness/package.json',
  'harness/node_modules/@deepseek-ai/dsh/lib/bin.js',
  'harness/node_modules/@deepseek-ai/dsh/config/agent-presets/standard/preset.yml',
  'harness/node_modules/@deepseek-ai/dsh-app-boot/package.json',
  'harness/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html',
  'harness/node_modules/@deepseek-ai/dsh-web-app/cordis.patch.yml',
  'runtime/manifest.json',
  'runtime/node/node.exe',
  'runtime/node-global/pnpm.exe',
  'runtime/python/python.exe',
  'runtime/python/Scripts/pip.exe',
  'runtime/git/cmd/git.exe',
  'runtime/git/bin/bash.exe',
  'runtime/git/mingw64/bin/curl.exe',
  'runtime/git/usr/bin/ssh.exe',
  'runtime/powershell/pwsh.exe',
  'runtime/tools/ripgrep/rg.exe',
  'runtime/tools/fd/fd.exe',
  'runtime/tools/jq/jq.exe',
  'runtime/tools/sevenzip/x64/7za.exe',
])

export const PACKAGED_REQUIRED_FILES = Object.freeze([
  ...STAGED_REQUIRED_FILES,
  'RUNTIME_NOTICES.md',
  'oasisfish-portable-inventory.json',
  'cleanup/portable-cleanup.mjs',
  'cleanup/portable-inventory.mjs',
  'skills/oasis-wiki/SKILL.md',
  'skills/oasis-wiki/VERSION',
  'skills/oasis-wiki.provenance.json',
  'models/bge-small-zh-v1.5/model-manifest.json',
  'models/bge-small-zh-v1.5/LICENSE',
  'models/bge-small-zh-v1.5/config.json',
  'models/bge-small-zh-v1.5/onnx/model_quantized.onnx',
  'models/bge-small-zh-v1.5/special_tokens_map.json',
  'models/bge-small-zh-v1.5/tokenizer_config.json',
  'models/bge-small-zh-v1.5/tokenizer.json',
  'models/bge-small-zh-v1.5/vocab.txt',
])

export const RELEASE_REQUIRED_FILES = Object.freeze([
  ...PACKAGED_REQUIRED_FILES,
  'app-update.yml',
])

/** Verify that every file required by the packaged desktop product exists. */
export async function verifyStagedProduct(resourcesRoot, requiredFiles = STAGED_REQUIRED_FILES) {
  const missing = []
  for (const relativePath of requiredFiles) {
    try {
      await access(join(resourcesRoot, relativePath))
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      missing.push(relativePath)
    }
  }
  if (missing.length > 0) {
    throw new Error(`Desktop staging is incomplete:\n${missing.map(path => `- ${path}`).join('\n')}`)
  }
}
