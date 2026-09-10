/** Local storage-domain provider for durable user and project memory. */

import { createHash, randomUUID } from 'node:crypto'
import { basename, normalize, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { MemoryError, MemoryId } from '@deepseek-ai/dsh-memory'
import type {
  MemoryAddRequest,
  MemoryContext,
  MemoryProvider,
  MemoryRecord,
  MemoryRemoveRequest,
  MemoryRemoveResult,
  MemorySnapshot,
  MemoryUpdateRequest,
} from '@deepseek-ai/dsh-memory'
import type { DomainGlobal } from '@deepseek-ai/dsh-storage-domain'
import { memoryDomainSpec } from './spec.ts'
import type { MemoryState } from './spec.ts'

export { memoryDomainSpec, memoryRecordSchema, memoryStateSchema } from './spec.ts'

export const name = 'memory-local'
export const inject = ['memory', 'storageDomain']

/** Deployment-owned memory capacity limits. */
export interface Config {
  /** Maximum global user records. */
  maxUserItems?: number
  /** Maximum records for one project identity. */
  maxProjectItems?: number
  /** Maximum Unicode code points in one record. */
  maxItemChars?: number
  /** Maximum Unicode code points across user records. */
  maxUserChars?: number
  /** Maximum Unicode code points across one project's records. */
  maxProjectChars?: number
}

export const Config: z<Config> = z.object({
  maxUserItems: z.number().step(1).min(1).default(80),
  maxProjectItems: z.number().step(1).min(1).default(120),
  maxItemChars: z.number().step(1).min(1).default(1200),
  maxUserChars: z.number().step(1).min(1).default(12000),
  maxProjectChars: z.number().step(1).min(1).default(18000),
})

interface Limits {
  maxUserItems: number
  maxProjectItems: number
  maxItemChars: number
  maxUserChars: number
  maxProjectChars: number
}

interface ProjectIdentity {
  key: string
  label: string
}

function countChars(value: string): number {
  return Array.from(value).length
}

function immutableRecord(record: MemoryRecord): MemoryRecord {
  return Object.freeze({ ...record })
}

function immutableSnapshot(state: MemoryState, project?: ProjectIdentity): MemorySnapshot {
  const visible = state.records.filter(record => record.scope === 'user' || record.projectKey === project?.key)
  return Object.freeze({ enabled: state.enabled, records: Object.freeze(visible.map(immutableRecord)) })
}

/**
 * Derive the stable identity of one project cwd.
 * @param cwd - Absolute or resolvable Session working directory.
 * @returns The normalized project's digest key and display label.
 */
export function projectIdentity(cwd: string | undefined): ProjectIdentity {
  if (cwd === undefined) {
    throw new MemoryError('MEMORY_PROJECT_UNAVAILABLE', 'project memory requires a Session working directory')
  }
  const path = normalize(resolve(cwd))
  /* v8 ignore next -- Windows coverage exercises case-insensitive project identity; POSIX CI covers the other path. */
  const digestInput = process.platform === 'win32' ? path.toLowerCase() : path
  return {
    key: createHash('sha256').update(digestInput).digest('hex'),
    label: basename(path),
  }
}

function rejectSensitive(content: string): void {
  const rules: ReadonlyArray<[string, RegExp]> = [
    ['private-key material', /-----BEGIN [A-Z ]*PRIVATE KEY-----/iu],
    ['bearer token', /\bbearer\s+[a-z0-9._~+/=-]{16,}/iu],
    ['API key assignment', /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*\S{8,}/iu],
    ['password assignment', /\b(?:password|passwd|pwd)\s*[:=]\s*\S+/iu],
    ['temporary path', /(?:[a-z]:\\(?:windows\\temp|users\\[^\\]+\\appdata\\local\\temp)\\|\/tmp\/)/iu],
    ['raw log dump', /^\s*\[?\d{4}-\d{2}-\d{2}[ t]\d{2}:\d{2}:\d{2}[^\n]*(?:error|warn|debug|trace)/iu],
  ]
  const hit = rules.find(([, pattern]) => pattern.test(content))
  if (hit !== undefined) {
    throw new MemoryError('MEMORY_CONTENT_REJECTED', `memory content was rejected as ${hit[0]}`)
  }
}

class LocalMemoryProvider implements MemoryProvider {
  private tail: Promise<void> = Promise.resolve()

  constructor(private readonly state: DomainGlobal<MemoryState>, private readonly limits: Limits) {}

  list(context: MemoryContext): Promise<MemorySnapshot> {
    const project = context.cwd === undefined ? undefined : projectIdentity(context.cwd)
    return Promise.resolve(immutableSnapshot(this.state.get(), project))
  }

  add(request: MemoryAddRequest, context: MemoryContext): Promise<MemoryRecord> {
    return this.mutate((state) => {
      const content = this.validateContent(request.content)
      const project = request.scope === 'project' ? projectIdentity(context.cwd) : undefined
      const scoped = this.scoped(state.records, request.scope, project)
      if (scoped.some(record => record.content === content)) {
        throw new MemoryError('MEMORY_DUPLICATE', 'the effective memory scope already contains this content')
      }
      this.validateCapacity(scoped, content, request.scope)
      const now = Date.now()
      const record = immutableRecord({
        id: MemoryId(`memory-${randomUUID()}`),
        scope: request.scope,
        ...(project === undefined ? {} : { projectKey: project.key, projectLabel: project.label }),
        content,
        ...(context.sourceSessionId === undefined ? {} : { sourceSessionId: context.sourceSessionId }),
        createdAt: now,
        updatedAt: now,
      })
      return { state: { ...state, records: [...state.records, record] }, result: record }
    })
  }

  update(request: MemoryUpdateRequest, context: MemoryContext): Promise<MemoryRecord> {
    return this.mutate((state) => {
      const index = this.visibleIndex(state.records, request.id, context)
      if (index < 0) throw new MemoryError('MEMORY_NOT_FOUND', 'memory record is not visible to this context')
      const current = state.records[index]
      if (current === undefined) throw new MemoryError('MEMORY_NOT_FOUND', 'memory record is not visible to this context')
      const content = this.validateContent(request.content)
      const project = current.scope === 'project' ? projectIdentity(context.cwd) : undefined
      const scoped = this.scoped(state.records, current.scope, project).filter(record => record.id !== current.id)
      if (scoped.some(record => record.content === content)) {
        throw new MemoryError('MEMORY_DUPLICATE', 'the effective memory scope already contains this content')
      }
      this.validateCapacity(scoped, content, current.scope)
      const record = immutableRecord({
        ...current,
        content,
        updatedAt: Math.max(Date.now(), current.updatedAt + 1),
        ...(context.sourceSessionId === undefined ? {} : { sourceSessionId: context.sourceSessionId }),
      })
      const records = [...state.records]
      records[index] = record
      return { state: { ...state, records }, result: record }
    })
  }

  remove(request: MemoryRemoveRequest, context: MemoryContext): Promise<MemoryRemoveResult> {
    return this.mutate((state) => {
      const index = this.visibleIndex(state.records, request.id, context)
      if (index < 0) return { state, result: Object.freeze({ id: request.id, absent: true as const }) }
      return {
        state: { ...state, records: state.records.filter((_, recordIndex) => recordIndex !== index) },
        result: Object.freeze({ id: request.id, absent: true as const }),
      }
    })
  }

  setEnabled(enabled: boolean, _context: MemoryContext): Promise<boolean> {
    return this.mutate(state => ({ state: state.enabled === enabled ? state : { ...state, enabled }, result: enabled }))
  }

  private mutate<T>(operation: (state: MemoryState) => { state: MemoryState; result: T }): Promise<T> {
    const result = this.tail.then(async () => {
      const current = this.state.get()
      const next = operation(current)
      if (next.state !== current) await this.state.set(next.state)
      return next.result
    })
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }

  private validateContent(raw: string): string {
    const content = raw.trim()
    rejectSensitive(content)
    const chars = countChars(content)
    if (chars === 0 || chars > this.limits.maxItemChars) {
      throw new MemoryError('MEMORY_CHAR_LIMIT', `memory content must contain 1-${this.limits.maxItemChars} characters`)
    }
    return content
  }

  private validateCapacity(records: readonly MemoryRecord[], content: string, scope: MemoryRecord['scope']): void {
    const itemLimit = scope === 'user' ? this.limits.maxUserItems : this.limits.maxProjectItems
    if (records.length >= itemLimit) {
      throw new MemoryError('MEMORY_ITEM_LIMIT', `${scope} memory reached its ${itemLimit}-item limit`)
    }
    const charLimit = scope === 'user' ? this.limits.maxUserChars : this.limits.maxProjectChars
    const chars = records.reduce((sum, record) => sum + countChars(record.content), countChars(content))
    if (chars > charLimit) {
      throw new MemoryError('MEMORY_CHAR_LIMIT', `${scope} memory exceeds its ${charLimit}-character limit`)
    }
  }

  private scoped(records: readonly MemoryRecord[], scope: MemoryRecord['scope'], project?: ProjectIdentity): MemoryRecord[] {
    return records.filter(record => record.scope === scope && (scope === 'user' || record.projectKey === project?.key))
  }

  private visibleIndex(records: readonly MemoryRecord[], id: MemoryRecord['id'], context: MemoryContext): number {
    const project = context.cwd === undefined ? undefined : projectIdentity(context.cwd)
    return records.findIndex(record => record.id === id && (record.scope === 'user' || record.projectKey === project?.key))
  }
}

function positive(field: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`memory-local: ${field} must be a positive safe integer`)
  return value
}

/** Open the local domain and register its Provider. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const limits: Limits = {
    maxUserItems: positive('maxUserItems', config.maxUserItems ?? 80),
    maxProjectItems: positive('maxProjectItems', config.maxProjectItems ?? 120),
    maxItemChars: positive('maxItemChars', config.maxItemChars ?? 1200),
    maxUserChars: positive('maxUserChars', config.maxUserChars ?? 12000),
    maxProjectChars: positive('maxProjectChars', config.maxProjectChars ?? 18000),
  }
  const domain = await ctx.storageDomain.open(memoryDomainSpec)
  ctx.memory.registerProvider(new LocalMemoryProvider(domain.global, limits))
  ctx.effect(() => async () => { await domain.close() }, 'memory-local.domainClose')
}
