import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import ImageOptimizer, { type ImageGenerationSpec, type ImageOptimizationErrorCode } from '@deepseek-ai/dsh-image-optimizer'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { snapshotJsonValue, type JsonValue } from '@deepseek-ai/dsh-util-values'
import * as toolImageOptimize from '../src/index.ts'
import { emitPreStep, execContext, imageMessage, imageRef, request, stubAgent } from './harness.ts'

const spec: ImageGenerationSpec = {
  schemaVersion: 1,
  operation: 'edit',
  canonicalPrompt: 'Task\nreplace the title',
  references: [], composition: [], visualStyle: [], scene: [], exactText: [],
  output: { transparentBackground: false, count: 1 }, preserve: [], negativeConstraints: [],
  requiredCapabilities: [],
  evidence: [{ provider: 'fixture', templateId: 'template-a', caseIds: ['case-b'], visualStyleTags: [], sceneTags: [] }],
  warnings: ['Review exact typography.'],
}

async function setup() {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(ImageOptimizer, {})
  const fiber = await ctx.plugin(toolImageOptimize)
  return { ctx, agent: stubAgent('tool-owner', ctx), fiber }
}

let callNumber = 0

function execute(ctx: Context, args: unknown, agent?: Agent, signal = new AbortController().signal) {
  return ctx.tools.execute({
    callId: ToolCallId(`image-optimize-${++callNumber}`),
    name: 'image_optimize', arguments: args, signal,
    ...agent === undefined ? {} : { agent },
  })
}

function expectClosedSchema(node: unknown): void {
  expect(node).toBeTypeOf('object')
  expect(node).not.toBeNull()
  const schema = node as { type?: unknown; additionalProperties?: unknown; properties?: unknown; items?: unknown }
  if (schema.type === 'object') {
    expect(schema.additionalProperties).toBe(false)
    if (schema.properties !== undefined) {
      for (const property of Object.values(schema.properties as Record<string, unknown>)) expectClosedSchema(property)
    }
  }
  if (schema.type === 'array') {
    expect(schema.items).toBeDefined()
    expectClosedSchema(schema.items)
  }
}

function jsonValue(value: unknown): JsonValue {
  const snapshot = snapshotJsonValue(value)
  if (snapshot === undefined) throw new TypeError('test value must be lossless JSON')
  return snapshot as JsonValue
}

describe('image_optimize', () => {
  it('publishes the strict nested schema', async () => {
    const { ctx } = await setup()
    const parameters = ctx.tools.get('image_optimize')?.parameters
    expectClosedSchema(parameters)
    expect(parameters).toMatchObject({
      additionalProperties: false,
      properties: {
        operation: { enum: ['generate', 'edit', 'variation'] },
        references: {
          items: {
            additionalProperties: false,
            properties: { role: { enum: ['style', 'layout', 'content', 'edit-target'] } },
          },
        },
        exactText: { items: { additionalProperties: false } },
        output: { additionalProperties: false },
      },
    })
  })

  it.each([
    ['top-level', { ...request(), unexpected: true }],
    ['reference', request({ references: [{ inputIndex: 1, role: 'style', priority: 1, unexpected: true } as never] })],
    ['exact-text', request({ exactText: [{ text: 'READY', preserveCase: true, unexpected: true } as never] })],
    ['output', request({ output: { transparentBackground: false, count: 1, unexpected: true } as never })],
  ])('rejects undeclared %s properties through the Tool runtime', async (_location, args) => {
    const { ctx, agent } = await setup()
    const optimize = vi.spyOn(ctx.imageOptimizer, 'optimize')
    const result = await execute(ctx, args, agent)
    expect(result).toMatchObject({
      isError: true,
      error: { info: { name: 'ToolArgsError', code: 'INVALID_ARGS' } },
    })
    expect(optimize).not.toHaveBeenCalled()
  })

  it('resolves one-based positions, preserves duplicates, and forwards the execution signal', async () => {
    const { ctx, agent } = await setup()
    const first = imageRef('first')
    const second = imageRef('second')
    await emitPreStep(ctx, agent, 1, 1, [imageMessage([first, second])])
    const optimize = vi.spyOn(ctx.imageOptimizer, 'optimize').mockResolvedValue({ status: 'prepared', spec })
    const controller = new AbortController()
    const args = request({
      operation: 'edit', intent: 'replace the title',
      references: [
        { inputIndex: 2, role: 'edit-target', priority: 100 },
        { inputIndex: 2, role: 'style', priority: 50 },
      ],
      exactText: [{ text: 'READY', preserveCase: true }],
    })
    const result = await ctx.tools.get('image_optimize')!.execute(args, execContext(agent, controller.signal))
    expect(optimize).toHaveBeenCalledWith(args, {
      signal: controller.signal,
      resolvedReferences: [
        { inputIndex: 2, attachment: second },
        { inputIndex: 2, attachment: second },
      ],
    })
    expect(result).toEqual({ status: 'prepared', spec })
  })

  it('requires an owning Agent before invoking the service', async () => {
    const { ctx } = await setup()
    const optimize = vi.spyOn(ctx.imageOptimizer, 'optimize')
    await expect(ctx.tools.get('image_optimize')!.execute(request(), execContext(undefined)))
      .rejects.toThrow('owning Agent')
    expect(optimize).not.toHaveBeenCalled()
  })

  it('keeps needs_clarification as a normal lossless structured result', async () => {
    const { ctx, agent } = await setup()
    const value = { status: 'needs_clarification' as const, issues: [{ code: 'IMAGE_EXACT_TEXT_CONFLICT' as const, path: 'exactText[1]', message: 'conflict' }] }
    vi.spyOn(ctx.imageOptimizer, 'optimize').mockResolvedValue(value)
    const definition = ctx.tools.get('image_optimize')!
    expect(await definition.execute(request(), execContext(agent))).toEqual(value)
    expect(definition.output.render(request(), value)).toEqual([{ type: 'text', text: JSON.stringify(value) }])
    expect(definition.output.presentationMeta!(request(), value)).toEqual({
      status: 'needs_clarification', operation: 'generate', evidenceIds: [], warnings: [], issueCodes: ['IMAGE_EXACT_TEXT_CONFLICT'],
    })
  })

  it('projects bounded presentation metadata and stable titles without reading runtime state', async () => {
    const { ctx } = await setup()
    const definition = ctx.tools.get('image_optimize')!
    const args = request({ operation: 'edit' })
    const value = { status: 'prepared' as const, spec }
    const meta = definition.output.presentationMeta!(args, jsonValue(value))
    expect(meta).toEqual({
      status: 'prepared', operation: 'edit', evidenceIds: ['template-a', 'case-b'],
      warnings: ['Review exact typography.'], issueCodes: [],
    })
    expect(definition.presentCall!(args)).toMatchObject({ card: 'generic', title: 'Optimize image: edit' })
    expect(definition.presentResult!(args, { content: [], isError: false, meta })).toMatchObject({ card: 'generic', title: 'Image optimization prepared' })
    expect(definition.presentResult!(args, {
      content: [], isError: false,
      meta: { status: 'needs_clarification', operation: 'variation', evidenceIds: [], warnings: [], issueCodes: ['IMAGE_EXACT_TEXT_CONFLICT'] },
    })).toMatchObject({ card: 'generic', title: 'Image optimization needs clarification' })
    expect(definition.presentResult!(args, { content: [], isError: true, meta })).toBeUndefined()

    const malformed = [
      null,
      'not metadata',
      [],
      { localPath: 'C:/secret.png' },
      { status: 'unknown', operation: 'generate', evidenceIds: [], warnings: [], issueCodes: [] },
      { status: 'prepared', operation: 'unknown', evidenceIds: [], warnings: [], issueCodes: [] },
      { status: 'prepared', operation: 'generate', evidenceIds: 'case', warnings: [], issueCodes: [] },
      { status: 'prepared', operation: 'generate', evidenceIds: [], warnings: 'warning', issueCodes: [] },
      { status: 'prepared', operation: 'generate', evidenceIds: [], warnings: [], issueCodes: [1] },
    ]
    for (const badMeta of malformed) {
      expect(definition.presentResult!(args, { content: [], isError: false, meta: badMeta })).toBeUndefined()
    }

    const noTemplate = {
      status: 'prepared' as const,
      spec: { ...spec, evidence: [{ provider: 'fixture', caseIds: [], visualStyleTags: [], sceneTags: [] }] },
    }
    expect(definition.output.presentationMeta!(args, jsonValue(noTemplate))).toMatchObject({ evidenceIds: [] })
  })

  it('preserves all stable optimizer domain codes through the tool body', async () => {
    const cases: Array<[ImageOptimizationErrorCode, ReturnType<typeof request>, readonly ReturnType<typeof imageRef>[]]> = [
      ['IMAGE_REFERENCE_NOT_FOUND', request({ operation: 'edit', references: [{ inputIndex: 1, role: 'edit-target', priority: 1 }] }), []],
      ['IMAGE_EDIT_TARGET_REQUIRED', request({ operation: 'edit' }), []],
      ['IMAGE_EDIT_TARGET_AMBIGUOUS', request({ operation: 'edit', references: [
        { inputIndex: 1, role: 'edit-target', priority: 1 }, { inputIndex: 2, role: 'edit-target', priority: 2 },
      ] }), [imageRef('one'), imageRef('two')]],
      ['IMAGE_VARIATION_SOURCE_REQUIRED', request({ operation: 'variation' }), []],
      ['IMAGE_VARIATION_TARGET_UNSUPPORTED', request({ operation: 'variation', references: [{ inputIndex: 1, role: 'edit-target', priority: 1 }] }), [imageRef('one')]],
      ['IMAGE_OPTIMIZATION_SOURCE_NOT_FOUND', request({ templateId: 'missing-template' }), []],
    ]
    for (const [code, args, refs] of cases) {
      const { ctx, agent } = await setup()
      if (refs.length > 0) await emitPreStep(ctx, agent, 1, 1, [imageMessage(refs)])
      const result = await execute(ctx, args, agent)
      expect(result).toMatchObject({
        isError: true,
        error: { info: { name: 'HarnessError', code } },
      })
    }
  })

  it.each([0, -1, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid input image index %s as INVALID_ARGUMENTS before ordinal lookup',
    async (inputIndex) => {
      const { ctx, agent } = await setup()
      const optimize = vi.spyOn(ctx.imageOptimizer, 'optimize')
      const result = await execute(ctx, request({
        references: [{ inputIndex, role: 'style', priority: 1 }],
      }), agent)
      expect(result).toMatchObject({
        isError: true,
        error: { info: { name: 'HarnessError', code: 'INVALID_ARGUMENTS' } },
      })
      expect(result.error?.message).toContain('positive safe integer')
      expect(result.error?.message).not.toContain('current user input')
      expect(optimize).not.toHaveBeenCalled()
    },
  )

  it('maps optimizer input failures to INVALID_ARGUMENTS and forwards cancellation', async () => {
    const { ctx, agent } = await setup()
    const invalid = await execute(ctx, request({
      output: { transparentBackground: false, count: Number.MAX_SAFE_INTEGER + 1 },
    }), agent)
    expect(invalid).toMatchObject({
      isError: true,
      error: { info: { name: 'HarnessError', code: 'INVALID_ARGUMENTS' } },
    })
    expect(invalid.error?.message).toContain('positive safe integer')
    const controller = new AbortController()
    controller.abort(new DOMException('cancelled', 'AbortError'))
    await expect(ctx.tools.get('image_optimize')!.execute(request(), execContext(agent, controller.signal)))
      .rejects.toHaveProperty('name', 'AbortError')
  })

  it('does not assign a domain code to unrelated optimizer failures', async () => {
    const { ctx, agent } = await setup()
    vi.spyOn(ctx.imageOptimizer, 'optimize').mockRejectedValue(new Error('provider defect'))
    const result = await execute(ctx, request(), agent)
    expect(result).toMatchObject({ isError: true, error: { message: 'provider defect' } })
    expect(result.error?.info).toBeUndefined()
  })

  it('removes image_optimize when its plugin fiber is disposed', async () => {
    const { ctx, fiber } = await setup()
    expect(ctx.tools.get('image_optimize')).toBeDefined()
    await fiber.dispose()
    expect(ctx.tools.get('image_optimize')).toBeUndefined()
  })
})
