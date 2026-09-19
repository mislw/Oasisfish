---
description: "The LLM capability group: a provider-neutral model-call service, provider adapters, provider-route circuit breaking, request-retry execution, and replay-aware token measurement."
kind: "package-group"
---

# llm/ — LLM capability family

English | [中文](README.zh.md)

## Summary

The llm group combines a provider-neutral streaming service with adapters, request metadata, route health, recovery, and measurement. `llm` defines the shared message, content-block, and `StreamChunk` vocabulary. Provider adapters translate wire protocols; DeepSeek extensions add lifecycle-owned request metadata; `llm-circuit-breaker` rejects temporarily unhealthy routes before provider I/O; `llm-retry` re-runs failed requests at durable agent-step boundaries; and `token-meter` measures request and context pressure from the durable log. This page maps the group; each package README owns its package contract.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`llm/`](llm/README.md) | Streams one model call through a registered provider adapter and shares the harness message, block, and chunk vocabulary | `ctx.llm` |
| [`llm-deepseek/`](llm-deepseek/README.md) | Serves the `deepseek-official` route with direct DeepSeek chat-completions, thinking, and image input | registers on `ctx.llm` |
| [`llm-pi-ai/`](llm-pi-ai/README.md) | Serves configured provider routes through pi-ai catalogs and wire protocols, including hand-declared gateways | registers on `ctx.llm` |
| [`deepseek-llm-api-extensions/`](deepseek-llm-api-extensions/README.md) | Registers lifecycle-owned top-level fields on official DeepSeek requests | `ctx.deepseekLlmApiExtensions` |
| [`plugin-package-inventory-deepseek/`](plugin-package-inventory-deepseek/README.md) | Contributes the active Loader package inventory to official DeepSeek requests | contributes `dsh_plugin_packages` |
| [`llm-circuit-breaker/`](llm-circuit-breaker/README.md) | Rejects calls to an unhealthy provider route before provider I/O and admits one recovery probe | listens to `llm/stream` |
| [`llm-retry/`](llm-retry/README.md) | Retries failed model requests under each provider's policy at durable agent-step boundaries | listens to `agent/request-error` |
| [`token-meter/`](token-meter/README.md) | Measures request and context pressure from the durable session log with a fixed heuristic | `ctx.tokenMeter` |

-----

<a id="related-documentation"></a>
## Related documentation

- [LLM streaming subsystem](../../docs/subsystems/llm-streaming.md) — the message and block types, the assembled model request, the `StreamChunk` protocol, and the adapter contract.
- [Token meter subsystem](../../docs/subsystems/token-meter.md) — the measurement semantics behind `ctx.tokenMeter`.
- [Twin LLM adapters](../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.md) — why the DeepSeek route ships two structurally different adapters.
- [Routed model context](../../.agents/notes/implemented/architecture/2026-07-20-routed-model-context-and-compaction-policy.md) — how the loop routes model requests and compacts context.

<a id="dev-note"></a>
## Dev Note

None.
