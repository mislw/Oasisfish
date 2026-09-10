/** Durable storage-domain declaration for native memory. */

import { z } from 'zod'
import { defineDomain } from '@deepseek-ai/dsh-storage-domain'
import type { MemoryId, MemoryRecord } from '@deepseek-ai/dsh-memory/types'

const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

/** Stored memory record schema. */
export const memoryRecordSchema = z.object({
  id: z.string().min(1).transform(value => value as MemoryId),
  scope: z.union([z.literal('user'), z.literal('project')]),
  projectKey: z.string().min(1).optional(),
  projectLabel: z.string().min(1).optional(),
  content: z.string().min(1),
  sourceSessionId: z.string().min(1).optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
}).superRefine((record, ctx) => {
  if (record.updatedAt < record.createdAt) {
    ctx.addIssue({ code: 'custom', path: ['updatedAt'], message: 'updatedAt precedes createdAt' })
  }
  const project = record.scope === 'project'
  if (project !== (record.projectKey !== undefined && record.projectLabel !== undefined)) {
    ctx.addIssue({ code: 'custom', path: ['scope'], message: 'project fields must match project scope' })
  }
}) as unknown as z.ZodType<MemoryRecord>

/** Whole local-memory document committed atomically. */
export const memoryStateSchema = z.object({
  enabled: z.boolean(),
  records: z.array(memoryRecordSchema),
})

/** Parsed document stored in the native-memory domain. */
export type MemoryState = z.infer<typeof memoryStateSchema>

/** One global value keeps enablement and records at the same commit point. */
export const memoryDomainSpec = defineDomain({
  name: 'native_memory',
  version: 0,
  global: { schema: memoryStateSchema, initial: { enabled: true, records: [] } },
  tables: {},
})
