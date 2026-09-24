/** Current-input `image_optimize` Tool Consumer. @module @deepseek-ai/dsh-tool-image-optimize */

import type { Context } from '@deepseek-ai/cordis'
import {
  ImageOptimizationError,
  ImageOptimizationInputError,
  type ImageOptimizationResult,
  type ImageOperation,
} from '@deepseek-ai/dsh-image-optimizer'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { defineTool, type InferValue, type ToolCallView, type ToolResult, type ToolResultView } from '@deepseek-ai/dsh-tools'
import { createCurrentInputImages } from './input-images.ts'
import { imageOptimizationResultSchema, imageOptimizeParameters } from './schema.ts'

export const name = 'tool-image-optimize'
export const inject = ['tools', 'imageOptimizer']

type PresentationMeta = {
  status: ImageOptimizationResult['status']
  operation: ImageOperation
  evidenceIds: string[]
  warnings: string[]
  issueCodes: string[]
}

type ImageOptimizeValue = InferValue<typeof imageOptimizationResultSchema>

function presentationMeta(operation: ImageOperation, result: ImageOptimizationResult): PresentationMeta {
  if (result.status === 'needs_clarification') {
    return {
      status: result.status,
      operation,
      evidenceIds: [],
      warnings: [],
      issueCodes: result.issues.map(issue => issue.code),
    }
  }
  return {
    status: result.status,
    operation,
    evidenceIds: result.spec.evidence.flatMap(evidence => [
      ...(evidence.templateId === undefined ? [] : [evidence.templateId]),
      ...evidence.caseIds,
    ]),
    warnings: [...result.spec.warnings],
    issueCodes: [],
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function parsePresentationMeta(value: unknown): PresentationMeta | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  if (Object.keys(value).some(key => !['status', 'operation', 'evidenceIds', 'warnings', 'issueCodes'].includes(key))) return undefined
  const record = value as Record<string, unknown>
  if (record.status !== 'prepared' && record.status !== 'needs_clarification') return undefined
  if (record.operation !== 'generate' && record.operation !== 'edit' && record.operation !== 'variation') return undefined
  if (!isStringArray(record.evidenceIds) || !isStringArray(record.warnings) || !isStringArray(record.issueCodes)) return undefined
  return {
    status: record.status,
    operation: record.operation,
    evidenceIds: record.evidenceIds,
    warnings: record.warnings,
    issueCodes: record.issueCodes,
  }
}

function presentCall(args: { operation: ImageOperation }): ToolCallView {
  return { card: 'generic', title: `Optimize image: ${args.operation}`, kind: 'other', rawInput: args }
}

function presentResult(_args: unknown, result: ToolResult): ToolResultView | undefined {
  if (result.isError) return undefined
  const meta = parsePresentationMeta(result.meta)
  if (meta === undefined) return undefined
  return {
    card: 'generic',
    title: meta.status === 'prepared' ? 'Image optimization prepared' : 'Image optimization needs clarification',
  }
}

function throwToolError(error: unknown): never {
  if (error instanceof ImageOptimizationInputError) {
    throw new HarnessError(error.message, 'INVALID_ARGUMENTS', { cause: error })
  }
  if (error instanceof ImageOptimizationError) {
    throw new HarnessError(error.message, error.code, { cause: error })
  }
  throw error
}

/** Register `image_optimize` and its current-input image capture. */
export function apply(ctx: Context): void {
  const currentInputImages = createCurrentInputImages(ctx)
  ctx.provide('imageInputImages', currentInputImages)
  const tool = defineTool({
    name: 'image_optimize',
    description: 'Prepare a provider-neutral image generation, edit, or variation specification from the current direct-user image inputs.',
    parameters: imageOptimizeParameters,
    output: {
      schema: imageOptimizationResultSchema,
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      presentationMeta: (args, value) => presentationMeta(args.operation, value as unknown as ImageOptimizationResult),
    },
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error('image_optimize requires an owning Agent')
      exec.signal.throwIfAborted()
      try {
        const available = currentInputImages.references(exec.agent)
        const resolvedReferences = args.references.map((reference, position) => {
          const path = `references[${position}].inputIndex`
          if (!Number.isSafeInteger(reference.inputIndex) || reference.inputIndex <= 0) {
            throw new ImageOptimizationInputError(
              `Invalid image optimization input at ${path}: expected a positive safe integer`,
              path,
            )
          }
          const attachment = available[reference.inputIndex - 1]
          if (attachment === undefined) {
            throw new ImageOptimizationError(
              `Image ${reference.inputIndex} is not present in the current user input.`,
              'IMAGE_REFERENCE_NOT_FOUND',
              path,
            )
          }
          return { inputIndex: reference.inputIndex, attachment }
        })
        const result = await ctx.imageOptimizer.optimize(args, { signal: exec.signal, resolvedReferences })
        return result as unknown as ImageOptimizeValue
      } catch (error: unknown) {
        throwToolError(error)
      }
    },
    presentCall,
    presentResult,
  })
  tool.parameters.additionalProperties = false
  ctx.tools.register(tool)
}
