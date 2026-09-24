import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { Context } from '@deepseek-ai/cordis'
import { ImageOptimizer } from '@deepseek-ai/dsh-image-optimizer'
import type {
  Config,
  ImageOptimizationCandidate,
  ImageOptimizationProvider,
} from '@deepseek-ai/dsh-image-optimizer'
import { afterEach, describe, expect, it } from 'vitest'
import {
  candidateFixture,
  content,
  editRequest,
  ids,
  prepared,
  requestFixture,
  resolved,
  target,
  variationRequest,
} from './fixtures.ts'

function attachment(id: string): ImageAttachmentRef {
  return {
    attachmentId: AttachmentId(id),
    mediaType: 'image/png',
    bytes: 16,
    width: 4,
    height: 4,
  }
}

function source(
  resolveCandidates: readonly ImageOptimizationCandidate[],
  matchCandidates: readonly ImageOptimizationCandidate[] = resolveCandidates,
  name = 'library',
  rank = 1,
): ImageOptimizationProvider {
  return {
    name,
    rank,
    async resolve() {
      return resolveCandidates
    },
    async match() {
      return matchCandidates
    },
  }
}

async function setup(
  config: Config = {},
  providers: readonly ImageOptimizationProvider[] = [],
): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(ImageOptimizer, config)
  for (const provider of providers) ctx.imageOptimizer.registerProvider(provider)
  return ctx
}

describe('image optimization compiler', () => {
  const contexts: Context[] = []

  afterEach(async () => {
    await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  })

  async function tracked(
    config: Config = {},
    providers: readonly ImageOptimizationProvider[] = [],
  ): Promise<Context> {
    const ctx = await setup(config, providers)
    contexts.push(ctx)
    return ctx
  }

  it.each([
    ['edit without target', editRequest([]), 'IMAGE_EDIT_TARGET_REQUIRED'],
    ['edit with two targets', editRequest([target(1), target(2)]), 'IMAGE_EDIT_TARGET_AMBIGUOUS'],
    ['variation without content', variationRequest([]), 'IMAGE_VARIATION_SOURCE_REQUIRED'],
    ['variation with target', variationRequest([target(1), content(2)]), 'IMAGE_VARIATION_TARGET_UNSUPPORTED'],
  ])('%s', async (_label, request, code) => {
    const ctx = await tracked()

    await expect(ctx.imageOptimizer.optimize(request, resolved())).rejects.toMatchObject({ code })
  })

  it('joins resolved references and rejects a missing input ordinal', async () => {
    const ctx = await tracked()
    const ref = attachment('one')
    const request = editRequest([target(1)])

    expect(prepared(await ctx.imageOptimizer.optimize(request, resolved({ inputIndex: 1, attachment: ref }))).references)
      .toEqual([{ ...target(1), attachment: ref }])
    await expect(ctx.imageOptimizer.optimize(request, resolved())).rejects.toMatchObject({
      code: 'IMAGE_REFERENCE_NOT_FOUND',
      path: 'references[0].inputIndex',
    })
  })

  it.each([
    ['blank intent', requestFixture({ intent: ' ' }), 'intent'],
    ['zero input index', requestFixture({ references: [{ inputIndex: 0, role: 'style', priority: 1 }] }), 'references[0].inputIndex'],
    ['zero priority', requestFixture({ references: [{ inputIndex: 1, role: 'style', priority: 0 }] }), 'references[0].priority'],
    ['duplicate cases', requestFixture({ caseIds: ['same', 'same'] }), 'caseIds[1]'],
    ['half dimensions', requestFixture({ output: { width: 10, transparentBackground: false, count: 1 } }), 'output'],
    ['zero count', requestFixture({ output: { transparentBackground: false, count: 0 } }), 'output.count'],
    ['mismatched ratio', requestFixture({ output: { width: 8, height: 4, aspectRatio: '1:1', transparentBackground: false, count: 1 } }), 'output.aspectRatio'],
    ['non-reduced ratio', requestFixture({ output: { aspectRatio: '4:2', transparentBackground: false, count: 1 } }), 'output.aspectRatio'],
  ])('rejects structural input: %s', async (_label, request, path) => {
    const ctx = await tracked()

    await expect(ctx.imageOptimizer.optimize(request, resolved())).rejects.toMatchObject({
      name: 'ImageOptimizationInputError',
      path,
    })
  })

  it('accepts exact configured limits and rejects the next exact-text entry', async () => {
    const ctx = await tracked({ maxExactTextEntries: 1 })

    await expect(ctx.imageOptimizer.optimize(requestFixture(), resolved())).resolves.toMatchObject({ status: 'prepared' })
    await expect(ctx.imageOptimizer.optimize(requestFixture({
      exactText: [
        { text: 'ONE', preserveCase: true },
        { text: 'TWO', preserveCase: true },
      ],
    }), resolved())).rejects.toMatchObject({
      name: 'ImageOptimizationInputError',
      path: 'exactText',
    })
  })

  it('deduplicates identical exact text and returns one issue for each conflicting pair', async () => {
    const ctx = await tracked()
    const duplicate = { text: 'PLAY', placement: 'Center', preserveCase: true } as const
    const deduplicated = prepared(await ctx.imageOptimizer.optimize(requestFixture({
      exactText: [duplicate, duplicate],
    }), resolved()))
    expect(deduplicated.exactText).toEqual([duplicate])

    const placementConflict = await ctx.imageOptimizer.optimize(requestFixture({
      exactText: [
        { text: 'PLAY', placement: 'Center', preserveCase: true },
        { text: 'READY', placement: ' center ', preserveCase: true },
      ],
    }), resolved())
    expect(placementConflict).toMatchObject({
      status: 'needs_clarification',
      issues: [{
        code: 'IMAGE_EXACT_TEXT_CONFLICT',
        path: 'exactText[0], exactText[1]',
      }],
    })
    if (placementConflict.status !== 'needs_clarification') throw new Error('expected clarification')
    expect(placementConflict.issues[0]?.message).toContain('exactText[0]')

    const caseConflict = await ctx.imageOptimizer.optimize(requestFixture({
      exactText: [
        { text: 'PLAY', placement: 'center', preserveCase: true },
        { text: 'PLAY', placement: 'CENTER', preserveCase: false },
      ],
    }), resolved())
    expect(caseConflict).toMatchObject({
      status: 'needs_clarification',
      issues: [{ code: 'IMAGE_EXACT_TEXT_CONFLICT', path: 'exactText[0], exactText[1]' }],
    })

    const placementFreeConflict = await ctx.imageOptimizer.optimize(requestFixture({
      exactText: [
        { text: 'PLAY', preserveCase: true },
        { text: 'PLAY', preserveCase: false },
      ],
    }), resolved())
    expect(placementFreeConflict).toMatchObject({
      status: 'needs_clarification',
      issues: [{ code: 'IMAGE_EXACT_TEXT_CONFLICT', path: 'exactText[0], exactText[1]' }],
    })
  })

  it('reports the first missing explicit template or case id', async () => {
    const available = candidateFixture({ kind: 'case', id: 'available' })
    const ctx = await tracked({}, [source([available], [])])

    await expect(ctx.imageOptimizer.optimize(requestFixture({ templateId: 'missing' }), resolved()))
      .rejects.toMatchObject({ code: 'IMAGE_OPTIMIZATION_SOURCE_NOT_FOUND', path: 'templateId' })
    await expect(ctx.imageOptimizer.optimize(requestFixture({ caseIds: ['available', 'missing'] }), resolved()))
      .rejects.toMatchObject({ code: 'IMAGE_OPTIMIZATION_SOURCE_NOT_FOUND', path: 'caseIds[1]' })
  })

  it('selects a category template, limits automatic cases, and warns only for an actual fallback', async () => {
    const globalTemplate = candidateFixture({ kind: 'template', id: 'global', score: 1 })
    delete globalTemplate.category
    const candidates = [
      globalTemplate,
      candidateFixture({ kind: 'template', id: 'category', category: 'general', score: 0 }),
      candidateFixture({ id: 'case-a', score: 0.9 }),
      candidateFixture({ id: 'case-b', score: 0.8 }),
    ]
    const ctx = await tracked({ maxCases: 1 }, [source([], candidates)])
    const result = await ctx.imageOptimizer.optimize(requestFixture(), resolved())

    expect(ids(result)).toEqual(['library:category', 'library:case-a'])
    expect(prepared(result).warnings).toEqual([])

    const templateOnly = await tracked({}, [source([], candidates.slice(0, 2))])
    const fallback = prepared(await templateOnly.imageOptimizer.optimize(requestFixture(), resolved()))
    expect(fallback.evidence).toMatchObject([{ provider: 'library', templateId: 'category', caseIds: [] }])
    expect(fallback.warnings).toHaveLength(1)

    const explicitTemplate = await tracked({}, [source([candidates[1]!], [])])
    const explicit = prepared(await explicitTemplate.imageOptimizer.optimize(requestFixture({
      templateId: 'category',
    }), resolved()))
    expect(explicit.evidence).toMatchObject([{ provider: 'library', templateId: 'category', caseIds: [] }])
    expect(explicit.warnings).toEqual([])

    const noTemplate = await tracked()
    expect(prepared(await noTemplate.imageOptimizer.optimize(requestFixture(), resolved())).warnings).toEqual([])
  })

  it('keeps user requirements above Provider defaults and derives capabilities', async () => {
    const defaults = candidateFixture({
      composition: ['centered subject', 'centered subject'],
      visualStyle: ['provider style', 'editorial'],
      scene: ['provider scene', 'studio'],
      preserve: ['provider detail', 'logo geometry'],
      avoid: ['provider artifact', 'watermark'],
      requiredCapabilities: ['provider-capability', 'text'],
    })
    const ctx = await tracked({}, [source([], [defaults])])
    const first = attachment('one')
    const second = attachment('two')
    const result = prepared(await ctx.imageOptimizer.optimize(requestFixture({
      operation: 'edit',
      references: [target(1), content(2)],
      output: {
        width: 1024,
        height: 1024,
        transparentBackground: true,
        count: 1,
      },
    }), resolved(
      { inputIndex: 1, attachment: first },
      { inputIndex: 2, attachment: second },
    )))

    expect(result).toMatchObject({
      exactText: [{ text: 'PLAY', placement: 'center', preserveCase: true }],
      output: { width: 1024, height: 1024, transparentBackground: true, count: 1 },
      preserve: ['logo geometry', 'provider detail'],
      negativeConstraints: ['watermark', 'provider artifact'],
      visualStyle: ['editorial', 'provider style'],
      scene: ['studio', 'provider scene'],
    })
    expect(result.requiredCapabilities).toEqual([
      'multiple-references',
      'local-editing',
      'transparent-background',
      'exact-text',
      'aspect-ratio:1:1',
      'provider-capability',
      'text',
    ])
    expect(result.canonicalPrompt).toMatch(/^## Task\n/)
    expect(result.canonicalPrompt).toContain('\n## References\n')
    expect(result.canonicalPrompt).toContain('\n## Composition\n')
    expect(result.canonicalPrompt).toContain('\n## Visual style\n')
    expect(result.canonicalPrompt).toContain('\n## Scene\n')
    expect(result.canonicalPrompt).toContain('\n## Exact text\n')
    expect(result.canonicalPrompt).toContain('\n## Output\n')
    expect(result.canonicalPrompt).toContain('\n## Preserve\n')
    expect(result.canonicalPrompt).toContain('\n## Avoid\n')
  })

  it('enforces complete prepared-result UTF-8 bytes at the exact edge', async () => {
    const provider = source([], [candidateFixture({
      requiredCapabilities: ['provider-capability-海'],
      visualStyleTags: ['样式'],
      sceneTags: ['场景'],
    })], '图库')
    const baseline = await tracked({}, [provider])
    const request = requestFixture()
    const result = await baseline.imageOptimizer.optimize(request, resolved())
    const serialized = JSON.stringify(result)
    const bytes = Buffer.byteLength(serialized, 'utf8')
    expect(bytes).toBeGreaterThan(serialized.length)
    expect(bytes).toBeGreaterThan(Buffer.byteLength(prepared(result).canonicalPrompt, 'utf8'))

    const exact = await tracked({ maxPromptBytes: bytes }, [provider])
    await expect(exact.imageOptimizer.optimize(request, resolved())).resolves.toMatchObject({ status: 'prepared' })

    const overflow = await tracked({ maxPromptBytes: bytes - 1 }, [provider])
    await expect(overflow.imageOptimizer.optimize(request, resolved())).rejects.toMatchObject({
      name: 'ImageOptimizationInputError',
      path: 'canonicalPrompt',
    })
  })

  it('rejects one oversized prompt field', async () => {
    const ctx = await tracked({ maxPromptBytes: 128 })

    await expect(ctx.imageOptimizer.optimize(requestFixture({ intent: 'x'.repeat(256) }), resolved()))
      .rejects.toMatchObject({ name: 'ImageOptimizationInputError', path: 'canonicalPrompt' })
  })

  it('rejects aggregate prompt overflow and produces byte-identical repeated output', async () => {
    const provider = source([], [candidateFixture()])
    const ctx = await tracked({}, [provider])
    const request = requestFixture({
      intent: 'short',
      preserve: Array.from({ length: 20 }, (_, index) => `preserve-${index}`),
      avoid: Array.from({ length: 20 }, (_, index) => `avoid-${index}`),
    })
    const first = await ctx.imageOptimizer.optimize(request, resolved())
    const second = await ctx.imageOptimizer.optimize(request, resolved())
    expect(Buffer.from(JSON.stringify(first))).toEqual(Buffer.from(JSON.stringify(second)))

    const bytes = Buffer.byteLength(JSON.stringify(first), 'utf8')
    const limited = await tracked({ maxPromptBytes: bytes - 1 }, [provider])
    await expect(limited.imageOptimizer.optimize(request, resolved())).rejects.toMatchObject({
      name: 'ImageOptimizationInputError',
      path: 'canonicalPrompt',
    })
  })

  it('stops before Provider work when cancellation is already requested', async () => {
    const controller = new AbortController()
    controller.abort()
    const ctx = await tracked({}, [source([], [candidateFixture()])])

    await expect(ctx.imageOptimizer.optimize(requestFixture(), {
      signal: controller.signal,
      resolvedReferences: [],
    })).rejects.toMatchObject({ name: 'AbortError' })
  })
})
