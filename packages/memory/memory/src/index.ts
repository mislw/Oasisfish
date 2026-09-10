/** Provider-neutral durable memory Service Definition. @module @deepseek-ai/dsh-memory */

import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  MemoryAddRequest,
  MemoryContext,
  MemoryId as MemoryIdBrand,
  MemoryProvider,
  MemoryRecord,
  MemoryRemoteAddRequest,
  MemoryRemoteListRequest,
  MemoryRemoteRemoveRequest,
  MemoryRemoteSetEnabledRequest,
  MemoryRemoteUpdateRequest,
  MemoryRemoveRequest,
  MemoryRemoveResult,
  MemorySnapshot,
  MemoryUpdateRequest,
} from './types.ts'
import { MemoryError } from './types.ts'

export type * from './types.ts'
export { MemoryError } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    memory: MemoryService
  }
}

/**
 * Brand a raw string as a memory id.
 * @param value - Durable record id received from storage or Remote data.
 * @returns The opaque memory id used by public operations.
 */
export function MemoryId(value: string): MemoryIdBrand {
  return value as MemoryIdBrand
}

/** Build a provider context without an explicit `undefined` optional field. */
function remoteContext(cwd: string | undefined): MemoryContext {
  return cwd === undefined ? {} : { cwd }
}

/** Routes memory operations to the one active provider. */
export class MemoryService extends TypertRemoteService {
  private provider: MemoryProvider | undefined

  constructor(ctx: Context) {
    super(ctx, 'memory')
  }

  /**
   * Register the sole provider for this service instance.
   * @param provider - Backend that owns persistence and validation.
   * @returns An async disposer that removes this provider registration.
   */
  registerProvider(provider: MemoryProvider): () => Promise<void> {
    if (this.provider !== undefined) {
      throw new MemoryError('MEMORY_DUPLICATE_PROVIDER', 'a memory provider is already registered')
    }
    return this.ctx.effect(function* (this: MemoryService) {
      this.provider = provider
      yield () => { this.provider = undefined }
    }.bind(this), 'memory.registerProvider()')
  }

  /**
   * List records visible to one caller context.
   * @param context - Project and provenance context used to select records.
   * @returns The effective enable state and visible immutable records.
   */
  async list(context: MemoryContext): Promise<MemorySnapshot> {
    return await this.requireProvider().list(context)
  }

  /**
   * Add one record through the active provider.
   * @param request - Scope and durable content to store.
   * @param context - Project and provenance context for the write.
   * @returns The committed immutable record.
   */
  async add(request: MemoryAddRequest, context: MemoryContext): Promise<MemoryRecord> {
    return await this.requireProvider().add(request, context)
  }

  /**
   * Update one visible record through the active provider.
   * @param request - Visible record id and replacement content.
   * @param context - Project and provenance context for the write.
   * @returns The committed immutable record.
   */
  async update(request: MemoryUpdateRequest, context: MemoryContext): Promise<MemoryRecord> {
    return await this.requireProvider().update(request, context)
  }

  /**
   * Remove one visible record through the active provider.
   * @param request - Visible record id to remove.
   * @param context - Project and provenance context for the write.
   * @returns The idempotent removal result.
   */
  async remove(request: MemoryRemoveRequest, context: MemoryContext): Promise<MemoryRemoveResult> {
    return await this.requireProvider().remove(request, context)
  }

  /**
   * Change whether memory affects model requests.
   * @param enabled - Whether later turns receive memory context snapshots.
   * @param context - Project context associated with this preference update.
   * @returns The committed enable state.
   */
  async setEnabled(enabled: boolean, context: MemoryContext): Promise<boolean> {
    return await this.requireProvider().setEnabled(enabled, context)
  }

  /**
   * List records visible to the Session selected by the Settings page.
   * @param request - Optional selected Session working directory.
   * @returns The effective enable state and visible immutable records.
   */
  @Remote('list')
  async listRemote(request: MemoryRemoteListRequest): Promise<MemorySnapshot> {
    return await this.list(remoteContext(request.cwd))
  }

  /**
   * Add one record from the Settings page without model provenance.
   * @param request - Scope, content, and optional selected Session directory.
   * @returns The committed immutable record.
   */
  @Remote('add')
  async addRemote(request: MemoryRemoteAddRequest): Promise<MemoryRecord> {
    return await this.add(
      { scope: request.scope, content: request.content },
      remoteContext(request.cwd),
    )
  }

  /**
   * Update one visible record from the Settings page.
   * @param request - Record id, replacement content, and optional Session directory.
   * @returns The committed immutable record.
   */
  @Remote('update')
  async updateRemote(request: MemoryRemoteUpdateRequest): Promise<MemoryRecord> {
    return await this.update(
      { id: request.id, content: request.content },
      remoteContext(request.cwd),
    )
  }

  /**
   * Remove one visible record from the Settings page.
   * @param request - Record id and optional selected Session directory.
   * @returns The idempotent removal result.
   */
  @Remote('remove')
  async removeRemote(request: MemoryRemoteRemoveRequest): Promise<MemoryRemoveResult> {
    return await this.remove({ id: request.id }, remoteContext(request.cwd))
  }

  /**
   * Enable or disable memory context injection from the Settings page.
   * @param request - Enable state and optional selected Session directory.
   * @returns The committed enable state.
   */
  @Remote('setEnabled')
  async setEnabledRemote(request: MemoryRemoteSetEnabledRequest): Promise<boolean> {
    return await this.setEnabled(request.enabled, remoteContext(request.cwd))
  }

  private requireProvider(): MemoryProvider {
    if (this.provider === undefined) {
      throw new MemoryError('MEMORY_PROVIDER_UNAVAILABLE', 'no memory provider is registered')
    }
    return this.provider
  }
}

export default MemoryService
