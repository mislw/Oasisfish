# Agent Note: Provider-route circuit breaker

Status: implemented

English | [中文](2026-09-19-provider-route-circuit-breaker.zh.md)

## Problem

Provider retry recovers individual agent steps, but repeated transient failures can keep sending physical requests to the same unavailable provider route. An unbounded retry policy makes that pressure indefinite, and direct `ctx.llm.stream()` callers do not pass through the agent-step recovery boundary. The harness needs one admission policy that protects every physical request to an exact provider route without moving provider health into the agent loop or durable Session data.

The policy must remain correct when requests overlap. A request admitted while a route is closed may finish after another request has opened or recovered the circuit, and concurrent requests arriving after the open interval must not all become recovery probes.

## Decision

`@deepseek-ai/dsh-llm-circuit-breaker` is an `llm/stream` function plugin with process-local state keyed by the exact `GenerateOptions.provider` value. The `base` and `sdk-minimal` bundles enable it before `llm-retry`. State is shared by Sessions and Agents in one Host process, then discarded on plugin reload or process restart; it is not written to the Session log or coordinated across processes.

Each admitted physical provider call contributes one terminal outcome. A configured transient failure increments the closed circuit's consecutive count, a successful finish resets it, and reaching the threshold opens only that route. Open calls return one synthetic terminal failure with code `CIRCUIT_OPEN` and perform no provider I/O. `CIRCUIT_OPEN` is an admission decision rather than provider-health evidence, so `dsh-llm-retry` treats it as terminal in both normal and always modes. Timeout and retry retain their separate ownership.

After the open interval, admission synchronously reserves one half-open probe before calling downstream. Concurrent requests see the reservation and remain rejected. A successful or definitive-error probe closes the circuit; a configured transient failure opens it for another interval. An aborted, thrown, or incomplete probe releases the reservation so a later request may probe again.

Every closed generation and half-open probe has an opaque identity. A terminal result changes state only while its captured identity still owns the route, so late completions from requests admitted under older state cannot close, extend, or reopen the current circuit. One plugin owns the state and every observation that changes it, so the package does not publish an `./invariant` companion.

## Verification

State-machine tests cover configuration rejection, route isolation, consecutive-failure reset, open rejection, one-probe concurrency, probe outcomes, aborted and incomplete streams, synchronous throws, stale closed generations, stale probe completions, logs, and disposal. The package source reaches 100 percent statement, branch, function, and line coverage.

Loader composition tests mount the real `LlmRuntime`, prove the package export form, and verify that disposing the plugin removes both its listener and state. Bundle tests and the built `sdk-minimal` roster pin default composition. A keyless recorded Session fixture contains two physical `SERVER` attempts followed by a synthetic `CIRCUIT_OPEN` settlement without a third provider response; its focused runner is currently blocked by the same pre-existing built-plane activation warnings that affect adjacent snapshot scenarios.

## Alternatives considered

**Put circuit state in `LlmRuntime`.** Rejected because provider health is an optional deployment policy, not part of the provider-neutral service definition. A plugin can cover agent and direct-stream callers through the existing `llm/stream` extension point.

**Count logical turns or retry chains.** Rejected because the protected resource is provider traffic. Every physical attempt has an independent outcome, including attempts created by retry policy.

**Persist or distribute circuit state.** Rejected because the first implementation needs no schema migration, external coordination, or stale distributed-health reconciliation. Host restart and plugin reload intentionally reset the policy.

**Allow every request after the interval to probe.** Rejected because a synchronized recovery surge defeats the open interval. One synchronous reservation limits provider traffic while recovery is uncertain.

**Let always retry handle `CIRCUIT_OPEN`.** Rejected because it would create a local retry loop around an admission decision and could repeatedly consume agent-step recovery without provider I/O.

## Consequences

- Repeated transient failures stop provider traffic across all Sessions and Agents in one Host, and direct `ctx.llm.stream()` callers receive the same protection.
- Routes remain isolated by exact provider id; one unhealthy route does not block another.
- Open rejections consume no provider tokens and add no model input, but users and Session history still receive the stable terminal failure through existing settlement paths.
- Process restart, plugin reload, and multi-process deployments lose or partition health history. Deployments that require coordinated circuit state need a separate service and a new decision.
- One global policy applies to all routes in the plugin instance. Per-route thresholds, manual reset, status inspection, and failover are not provided.
