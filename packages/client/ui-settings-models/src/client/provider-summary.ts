import type { ModelProviderGroup, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import type { SettingsSchemaOperations } from './schema-operations.ts'

/** Safe provider facts displayed outside an editor. */
export interface ProviderSummary {
  /** Endpoint host only; paths, queries, user info, and fragments are discarded. */
  endpointHost: string | undefined
  /** Configured wire protocol, when present. */
  protocol: string | undefined
  /** Effective model count from the profile override or live catalog. */
  modelCount: number
}

/** Derive row-safe provider facts without retaining the complete endpoint. */
export function providerSummary(
  namespace: SettingsNamespaceView | undefined,
  path: readonly string[],
  schema: SettingsSchemaOperations,
  group: ModelProviderGroup | undefined,
): ProviderSummary {
  const profile = namespace === undefined ? undefined : schema.getPath(namespace.value, path)
  const record = typeof profile === 'object' && profile !== null
    ? profile as Record<string, unknown>
    : undefined
  const baseURL = typeof record?.['baseURL'] === 'string' ? record['baseURL'] : undefined
  let endpointHost: string | undefined
  if (baseURL !== undefined) {
    try {
      endpointHost = new URL(baseURL).host || undefined
    } catch {
      endpointHost = undefined
    }
  }
  const protocol = typeof record?.['api'] === 'string' && record['api'].length > 0
    ? record['api']
    : undefined
  const models = record?.['models']
  return {
    endpointHost,
    protocol,
    modelCount: Array.isArray(models) ? models.length : group?.models.length ?? 0,
  }
}
