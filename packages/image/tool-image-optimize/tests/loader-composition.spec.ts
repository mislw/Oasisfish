/** REAL-composition proof for current-input capture and `image_optimize`. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AgentRegistry, { agentEvents } from '@deepseek-ai/dsh-agent'
import ImageOptimizer, { type ImageOptimizationProvider } from '@deepseek-ai/dsh-image-optimizer'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as toolImageOptimize from '../src/index.ts'
import { imageMessage, imageRef, request, stubAgent } from './harness.ts'

const fixtureProvider: ImageOptimizationProvider = {
  name: 'fixture',
  rank: 1,
  async resolve() { return [] },
  async match() {
    return [{
      kind: 'case', id: 'fixture-case', category: 'general', score: 1,
      composition: ['centered'], visualStyle: ['editorial'], scene: ['studio'],
      preserve: [], avoid: [], requiredCapabilities: [], visualStyleTags: ['editorial'], sceneTags: ['studio'],
      source: { title: 'Fixture', url: 'https://example.test/fixture', license: 'CC0-1.0', redistributablePrompt: true },
    }]
  },
}

const providerPlugin = {
  name: 'fixture-image-optimization-provider',
  inject: ['imageOptimizer'],
  apply(ctx: Context) {
    ctx.imageOptimizer.registerProvider(fixtureProvider)
  },
}

describe('real Loader composition', () => {
  it('loads the tool, returns a durable result, and clears input after Agent disposal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-tool-image-optimize-loader-'))
    const ctx = new Context()
    try {
      await writeFile(join(root, 'cordis.yml'), [
        "- name: '@deepseek-ai/dsh-system-prompt'",
        "- name: '@deepseek-ai/dsh-tools'",
        "- name: '@deepseek-ai/dsh-agent'",
        "- name: '@deepseek-ai/dsh-image-optimizer'",
        "- name: 'fixture-provider'",
        "- name: '@deepseek-ai/dsh-tool-image-optimize'",
        '',
      ].join('\n'))
      ctx.baseUrl = `${pathToFileURL(root).href}/`
      await ctx.plugin(Loader)
      ctx.loader.builtins.include = Include
      const modules = new Map<string, unknown>([
        ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
        ['@deepseek-ai/dsh-tools', ToolRuntime],
        ['@deepseek-ai/dsh-agent', AgentRegistry],
        ['@deepseek-ai/dsh-image-optimizer', ImageOptimizer],
        ['fixture-provider', providerPlugin],
        ['@deepseek-ai/dsh-tool-image-optimize', toolImageOptimize],
      ])
      ctx.loader.internal = {
        version: 'v2',
        async import(specifier: string) {
          if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
          return modules.get(specifier)
        },
      } as unknown as NonNullable<typeof ctx.loader.internal>
      await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(join(root, 'cordis.yml')).href } })
      await ctx.loader.await()
      const unloaded = [...ctx.loader.entries()]
        .filter(entry => entry.fiber === undefined && !entry.disabled)
        .map(entry => entry.options.name)
      expect(unloaded).toEqual([])

      const agent = stubAgent('loader-owner', ctx)
      const disposeAgent = await ctx.agents.register(agent)
      const attachment = imageRef('loader-image')
      const message = imageMessage([attachment])
      await agentEvents(ctx, agent).waterfall('agent/pre-step', {
        messages: [message], turn: 1, step: 1, signal: new AbortController().signal,
      }, () => Promise.resolve({ kind: 'enter' as const, messages: [message] }))
      const args = request({ operation: 'edit', references: [{ inputIndex: 1, role: 'edit-target', priority: 1 }] })
      const result = await ctx.tools.execute({
        callId: ToolCallId('loader-optimize'), name: 'image_optimize', arguments: args,
        agent, signal: new AbortController().signal,
      })
      expect(result.isError).toBe(false)
      expect(result.value).toMatchObject({ status: 'prepared', spec: { references: [{ attachment }] } })
      expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.value) }])

      await disposeAgent()
      const disposedResult = await ctx.tools.execute({
        callId: ToolCallId('loader-after-dispose'), name: 'image_optimize', arguments: args,
        agent, signal: new AbortController().signal,
      })
      expect(disposedResult.isError).toBe(true)
      expect(disposedResult.error?.message).toContain('current user input')
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
})
