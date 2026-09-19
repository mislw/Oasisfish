---
description: "Configure process-local provider-route circuit breaking for model requests, including transient failure thresholds, open intervals, and recovery probes."
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-circuit-breaker

English | [中文](README.zh.md)

## Summary

Mount `@deepseek-ai/dsh-llm-circuit-breaker` to stop repeated provider traffic while one route is failing. Six consecutive configured transient failures open that route for 30 seconds by default; one later request probes recovery while concurrent requests receive `CIRCUIT_OPEN` without provider I/O. State is shared by calls in one Host process and resets on plugin reload or process restart. Retry and timeout remain separate policies.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin beside `dsh-llm`; the `base` and `sdk-minimal` bundles already enable it.

### When to choose it

Choose it when repeated physical attempts against an unavailable provider route should stop across Sessions and Agents in one Host. Remove the row when a composition needs no circuit policy. `dsh-llm-retry` still owns agent-step retries, and provider stream timeout settings still own stalled requests.

### Minimal configuration

```yaml
- id: llm-circuit-breaker
  name: '@deepseek-ai/dsh-llm-circuit-breaker'
  config:
    failureThreshold: 6
    openDurationMs: 30000
    failureCodes: [EMPTY_RESPONSE, RATE_LIMIT, SERVER, TIMEOUT, TRANSPORT]
```

| Field | Default | Meaning |
|---|---|---|
| `failureThreshold` | `6` | Consecutive configured failures that open one provider route |
| `openDurationMs` | `30000` | Delay before one request may probe the route |
| `failureCodes` | five codes above | Provider failures counted as transient route failures |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-llm-circuit-breaker) is the exhaustive source for accepted fields. `ABORTED` and `CIRCUIT_OPEN` cannot be counted as provider-health failures.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin wraps `llm/stream`, so direct streams and agent-loop requests use the same route state. Closed routes count terminal transient failures; success resets the consecutive count. Open routes short-circuit with one error finish. After the interval, one synchronous reservation becomes the half-open probe; its success or definitive error closes the route, its transient failure reopens it, and an unresolved probe becomes immediately eligible again. Generation and probe identities prevent late terminal completions from changing newer state.

The package logs transitions to open, half-open, and closed. It has no `./invariant` export because the same plugin owns both the private state and every observation that changes it.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Configuration validation, admission, stream observation, and route transitions |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-llm service](../llm/README.md) — provider routing and the raw stream extension point.
- [LLM retry](../llm-retry/README.md) — durable agent-step request recovery.
- [LLM streaming subsystem](../../../docs/subsystems/llm-streaming.md) — stream protocol and adapter behavior.
- [Provider-route circuit-breaker decision](../../../.agents/notes/implemented/architecture/2026-09-19-provider-route-circuit-breaker.md) — state ownership and recovery rationale.

-----

<a id="model-experience"></a>
## Model Experience

### Open-circuit rejection

#### What the model sees

The rejected attempt produces no model input or output. Existing error rendering reports `CIRCUIT_OPEN` to the user, and agent Sessions retain the terminal attempt and turn error through their normal events.

#### Token effect

An open-circuit rejection performs no provider I/O and consumes no provider tokens. Admitted probes and ordinary retries remain physical provider requests.

#### KV Cache effect

The plugin changes no prompt content or request prefix. Rejected calls do not access provider caches.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These constraints bound the first package version.

- State is process-local and resets on Host restart or plugin reload.
- Routes do not share state across processes or machines.
- One policy applies to every provider route; there are no per-provider overrides.
- The package exposes no status service, settings UI, command, or manual reset.
- The package does not fail over to another provider or model.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
