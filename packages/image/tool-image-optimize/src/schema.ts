/** Model-facing request and canonical result schemas for `image_optimize`. @module @deepseek-ai/dsh-tool-image-optimize/schema */

import type { ParameterSchemaSpec, ValueSchemaSpec } from '@deepseek-ai/dsh-tools'

const stringArray = (description: string) => ({
  type: 'array' as const,
  required: true as const,
  description,
  items: { type: 'string' as const },
})

/** Strict model-facing image optimization arguments. */
export const imageOptimizeParameters = {
  operation: {
    type: 'string', required: true,
    enum: ['generate', 'edit', 'variation'],
    description: 'Image task kind.',
  },
  intent: { type: 'string', required: true, description: 'Concrete visual outcome to prepare.' },
  references: {
    type: 'array', required: true,
    description: 'Current direct-user image positions and their semantic roles.',
    items: {
      type: 'object', additionalProperties: false,
      properties: {
        inputIndex: { type: 'integer', required: true, description: 'One-based current-input image position.' },
        role: { type: 'string', required: true, enum: ['style', 'layout', 'content', 'edit-target'] },
        priority: { type: 'integer', required: true, description: 'Positive priority; larger values are more important.' },
      },
    },
  },
  exactText: {
    type: 'array', required: true,
    description: 'Text that the prepared image must reproduce exactly.',
    items: {
      type: 'object', additionalProperties: false,
      properties: {
        text: { type: 'string', required: true },
        placement: { type: 'string' },
        preserveCase: { type: 'boolean', required: true },
      },
    },
  },
  output: {
    type: 'object', required: true, additionalProperties: false,
    properties: {
      aspectRatio: { type: 'string' },
      width: { type: 'integer' },
      height: { type: 'integer' },
      transparentBackground: { type: 'boolean', required: true },
      count: { type: 'integer', required: true },
    },
  },
  preserve: stringArray('Visual facts that must remain unchanged.'),
  avoid: stringArray('Prohibited visual outcomes.'),
  locale: { type: 'string', required: true },
  category: { type: 'string' },
  styleHints: stringArray('Requested visual-style hints.'),
  sceneHints: stringArray('Requested scene and composition hints.'),
  templateId: { type: 'string' },
  caseIds: stringArray('Explicit optimization-library case identifiers.'),
} as const satisfies ParameterSchemaSpec

const imageAttachmentSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    attachmentId: { type: 'string', required: true },
    mediaType: { type: 'string', required: true, enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] },
    bytes: { type: 'integer', required: true },
    width: { type: 'integer', required: true },
    height: { type: 'integer', required: true },
    name: { type: 'string' },
    originalDimensions: {
      type: 'object', additionalProperties: false,
      properties: {
        width: { type: 'integer', required: true },
        height: { type: 'integer', required: true },
      },
    },
  },
} as const

const outputRequirementSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    aspectRatio: { type: 'string' },
    width: { type: 'integer' },
    height: { type: 'integer' },
    transparentBackground: { type: 'boolean', required: true },
    count: { type: 'integer', required: true },
  },
} as const

const generationSpecSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    schemaVersion: { type: 'integer', required: true, const: 1 },
    operation: { type: 'string', required: true, enum: ['generate', 'edit', 'variation'] },
    canonicalPrompt: { type: 'string', required: true },
    references: {
      type: 'array', required: true,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          inputIndex: { type: 'integer', required: true },
          role: { type: 'string', required: true, enum: ['style', 'layout', 'content', 'edit-target'] },
          priority: { type: 'integer', required: true },
          attachment: { ...imageAttachmentSchema, required: true },
        },
      },
    },
    composition: { type: 'array', required: true, items: { type: 'string' } },
    visualStyle: { type: 'array', required: true, items: { type: 'string' } },
    scene: { type: 'array', required: true, items: { type: 'string' } },
    exactText: {
      type: 'array', required: true,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          text: { type: 'string', required: true }, placement: { type: 'string' }, preserveCase: { type: 'boolean', required: true },
        },
      },
    },
    output: { ...outputRequirementSchema, required: true },
    preserve: { type: 'array', required: true, items: { type: 'string' } },
    negativeConstraints: { type: 'array', required: true, items: { type: 'string' } },
    requiredCapabilities: { type: 'array', required: true, items: { type: 'string' } },
    evidence: {
      type: 'array', required: true,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          provider: { type: 'string', required: true }, templateId: { type: 'string' },
          caseIds: { type: 'array', required: true, items: { type: 'string' } },
          visualStyleTags: { type: 'array', required: true, items: { type: 'string' } },
          sceneTags: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
    },
    warnings: { type: 'array', required: true, items: { type: 'string' } },
  },
} as const

/** Complete canonical optimizer result schema returned to the model and PTC callers. */
export const imageOptimizationResultSchema = {
  oneOf: [
    {
      type: 'object', additionalProperties: false,
      properties: {
        status: { type: 'string', required: true, const: 'prepared' },
        spec: { ...generationSpecSchema, required: true },
      },
    },
    {
      type: 'object', additionalProperties: false,
      properties: {
        status: { type: 'string', required: true, const: 'needs_clarification' },
        issues: {
          type: 'array', required: true,
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              code: { type: 'string', required: true, const: 'IMAGE_EXACT_TEXT_CONFLICT' },
              path: { type: 'string', required: true },
              message: { type: 'string', required: true },
            },
          },
        },
      },
    },
  ],
} as const satisfies ValueSchemaSpec
