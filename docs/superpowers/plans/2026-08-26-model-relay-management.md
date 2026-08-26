# Model and Relay Management Implementation Plan

English | [中文](2026-08-26-model-relay-management.zh.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Models settings section into a dedicated Models and Relays page with provider summaries, real connection testing, default-model switching, and default-provider deletion protection.

**Architecture:** Extend the existing `ctx.llm` configuration operations with a settings-namespace-keyed draft provider probe, expose the probe and default-model operations through ApiProxy, and keep all provider profiles in `llm-pi-ai` plus all keys in `ctx.credentials`. The existing Models client plugin remains the only UI owner; it joins provider settings, credentials, the live model catalog, and the shared `agent-default-model` selection into one page.

**Tech Stack:** TypeScript, Cordis services and effects, Schemastery RPC schemas, React, CSS modules, Vitest, Playwright, Electron packaging.

**Spec:** `docs/superpowers/specs/2026-08-26-model-relay-management-design.md`

## Global Constraints

- Manage DeepSeek Harness configuration only; never read or write Codex, Claude Code, or another product's configuration files.
- API keys remain write-only through `credentials.set`; no settings, logs, diagnostics, snapshots, or UI text may contain the value.
- New defaults affect new tasks; existing tasks retain their session-specific route.
- The first release supports manual switching only, with no provider rotation, load balancing, or automatic failover.
- `llm.testProvider` is loopback-only because it accepts a caller-selected URL and a draft credential.
- Every user-visible string is maintained in English and Simplified Chinese.

---

### Task 1: Draft Provider Probe Capability

**Files:**
- Modify: `packages/llm/llm/src/types.ts`
- Modify: `packages/llm/llm/src/index.ts`
- Test: `packages/llm/llm/tests/topology.spec.ts`
- Modify: `packages/llm/llm/README.md`
- Modify: `packages/llm/llm/README.zh.md`

**Interfaces:**
- Produces: `LlmProviderProbeRequest`, `LlmProviderProbeStage`, `LlmProviderProbeResult`.
- Produces: `LlmRuntime.registerProviderProbe(settingsNs, handler)` and `LlmRuntime.testProvider(settingsNs, request)`.
- Consumes: existing settings-namespace ownership used by `registerModelDiscovery`.

- [ ] **Step 1: Write failing registry tests**

Add tests that register one probe for `llm-pi-ai`, reject a duplicate registration, forward a detached draft request and signal, reject an unknown namespace with `NO_PROVIDER_PROBE`, and stop serving after disposal.

```ts
const dispose = runtime.registerProviderProbe('llm-pi-ai', async request => ({
  ok: true,
  stage: 'response',
  model: request.model,
  text: 'OK',
  elapsedMs: 12,
}))
expect(await runtime.testProvider('llm-pi-ai', request)).toMatchObject({ ok: true, text: 'OK' })
dispose()
await expect(runtime.testProvider('llm-pi-ai', request)).rejects.toMatchObject({ code: 'NO_PROVIDER_PROBE' })
```

- [ ] **Step 2: Run the focused test and confirm the missing API failure**

Run: `pnpm vitest run packages/llm/llm/tests/topology.spec.ts`

Expected: FAIL because `registerProviderProbe` and `testProvider` do not exist.

- [ ] **Step 3: Add the request and result types**

```ts
export type LlmProviderProbeStage = 'endpoint' | 'authentication' | 'protocol' | 'model' | 'response'

export interface LlmProviderProbeRequest {
  provider?: string
  baseURL?: string
  api?: string
  apiKey?: string
  model: string
  signal?: AbortSignal
}

export type LlmProviderProbeResult =
  | { ok: true; stage: 'response'; model: string; text: string; elapsedMs: number }
  | { ok: false; stage: LlmProviderProbeStage; code: string; message: string; elapsedMs: number }
```

- [ ] **Step 4: Implement the settings-namespace probe registry**

Mirror `registerModelDiscovery`: validate non-empty namespace names, register through `ctx.effect()`, copy draft fields before dispatch, pass the caller signal, and reject duplicate or missing handlers with `LlmError`.

- [ ] **Step 5: Run focused tests and update the bilingual package contract**

Run: `pnpm vitest run packages/llm/llm/tests/topology.spec.ts`

Expected: PASS. Document that probes are configuration-time operations, do not write settings, and never enter a Session log.

- [ ] **Step 6: Commit the capability**

```powershell
git add packages/llm/llm
git commit -m "feat(llm): add draft provider probes"
```

### Task 2: Pi-AI Connection Test Implementation

**Files:**
- Create: `packages/llm/llm-pi-ai/src/probe.ts`
- Modify: `packages/llm/llm-pi-ai/src/index.ts`
- Test: `packages/llm/llm-pi-ai/tests/probe.spec.ts`
- Modify: `packages/llm/llm-pi-ai/README.md`
- Modify: `packages/llm/llm-pi-ai/README.zh.md`

**Interfaces:**
- Consumes: `LlmProviderProbeRequest` and `LlmProviderProbeResult` from Task 1.
- Consumes: `resolveProfiles`, `PiAiAdapter`, existing auth injection, and the stored-key fallback used by discovery.
- Produces: `testProvider(request, options)` and the `llm-pi-ai` probe registration.

- [ ] **Step 1: Write failing probe tests against the local scripted server**

Cover an OpenAI Chat Completions success returning `OK`, a Responses success, 401/403 as `authentication`, 404 model rejection as `model`, invalid JSON or malformed stream as `response`, unsupported protocol as `protocol`, unreachable endpoint as `endpoint`, caller abort as `ABORTED`, and typed-key precedence over the stored key.

```ts
const result = await testProvider({
  provider: 'probe-route',
  baseURL: server.url,
  api: 'openai-completions',
  apiKey: 'sk-draft',
  model: 'probe-model',
}, options)
expect(result).toMatchObject({ ok: true, stage: 'response', model: 'probe-model', text: 'OK' })
expect(server.headers[0]?.authorization).toBe('Bearer sk-draft')
```

- [ ] **Step 2: Run the new test and confirm the missing module failure**

Run: `pnpm vitest run packages/llm/llm-pi-ai/tests/probe.spec.ts`

Expected: FAIL because `src/probe.ts` does not exist.

- [ ] **Step 3: Build one transient resolved route and adapter**

Resolve a one-route profile under `provider ?? '__probe__'`, force one model entry with the requested `model`, reuse the draft `baseURL` and `api`, and resolve the credential from `request.apiKey` before the stored route key. Create a `PiAiAdapter` over that immutable profile and existing auth injection without registering it into `ctx.llm`.

- [ ] **Step 4: Send and classify the minimal request**

Use one user message containing `Reply with exactly OK.` and collect only assistant text until `finish`. Set `maxTokens: 8`, disable adapter retries, and bound the whole operation with `AbortSignal.timeout(15_000)` combined with the caller signal. Return at most 200 response characters. Map status/authentication failures, unsupported protocol, unknown model, transport failure, and malformed completion to the stage union without returning raw provider bodies.

- [ ] **Step 5: Register the probe beside model discovery**

```ts
ctx.llm.registerProviderProbe(NS, request => testProvider(request, {
  auth: { credentials: credentialStore, authContext },
  storedApiKey: () => storedApiKey(request.provider),
}))
```

- [ ] **Step 6: Run focused tests and update the bilingual package contract**

Run: `pnpm vitest run packages/llm/llm-pi-ai/tests/probe.spec.ts packages/llm/llm-pi-ai/tests/discovery.spec.ts`

Expected: PASS with no secret value in assertion messages or snapshots.

- [ ] **Step 7: Commit the provider implementation**

```powershell
git add packages/llm/llm-pi-ai
git commit -m "feat(llm-pi-ai): test draft provider connections"
```

### Task 3: ApiProxy Operations and Loopback Security

**Files:**
- Modify: `packages/host/apiproxy/src/api/llm.ts`
- Modify: `packages/host/apiproxy/src/api/rpc.ts`
- Modify: `packages/host/apiproxy/src/api-proxy.ts`
- Modify: `packages/host/apiproxy/src/fetch/client.ts`
- Modify: `packages/host/apiproxy/tests/client-handler.spec.ts`
- Modify: `packages/host/apiproxy/tests/fetch-carrier.spec.ts`
- Modify: `packages/client/connection/src/index.ts`
- Modify: `packages/client/connection/src/client/fixture.ts`
- Modify: `packages/client/connection/tests/fake-api.client.ts`
- Modify: `packages/client/connection/tests/node-half.host.spec.ts`

**Interfaces:**
- Produces: `llm.defaultModel`, `llm.selectDefaultModel`, and `llm.testProvider` RPC methods.
- Consumes: `ApiProxyDefaults.defaultModelSelection`, `saveDefaultModelSelection`, `ctx.llm.resolveModelInfo`, and `ctx.llm.testProvider`.
- Produces client value `ProviderProbeView` with the secret-free result fields from Task 1.

- [ ] **Step 1: Write failing API carrier tests**

Assert exact request/response parsing for all three methods, verify `selectDefaultModel` refuses an unavailable provider/model before saving, and verify `testProvider` forwards the AbortSignal but never echoes `apiKey` in errors.

```ts
const selected = await client.llm.selectDefaultModel({ provider: 'acme', model: 'large' })
expect(selected.result).toEqual({ ok: true, value: { selected: { provider: 'acme', model: 'large' } } })
```

- [ ] **Step 2: Run focused host and carrier tests**

Run: `pnpm vitest run packages/host/apiproxy/tests/client-handler.spec.ts packages/host/apiproxy/tests/fetch-carrier.spec.ts packages/client/connection/tests/node-half.host.spec.ts`

Expected: FAIL because the RPC method map and clients lack the new methods.

- [ ] **Step 3: Add schemas and ApiProxy implementations**

`defaultModel` returns the current shared default. `selectDefaultModel` calls `ctx.llm.resolveModelInfo(provider, model)` first, then `saveDefaultModelSelection`, and returns the complete stored selection. `testProvider` validates `settingsNs`, endpoint, protocol, model, and optional credential, invokes the Task 1 operation, and converts thrown `LlmError` values to secret-free RPC errors.

- [ ] **Step 4: Mark the probe as loopback-only**

Add `llm.testProvider` to `PRIVILEGED_METHODS` and both trusted-host denial test lists. Leave `defaultModel` and `selectDefaultModel` outside that set because they carry model IDs only, matching the existing session model-selection authority.

- [ ] **Step 5: Update fixture and fake clients**

The fixture returns the existing fixture default, accepts a selected default in process-local state, and returns a deterministic successful probe. Add dispatch cases so built-client tests exercise the same method map.

- [ ] **Step 6: Run focused tests**

Run the command from Step 2 plus `pnpm vitest run packages/client/connection/tests/fixture.client.spec.ts`.

Expected: PASS.

- [ ] **Step 7: Commit the API operations**

```powershell
git add packages/host/apiproxy packages/client/connection
git commit -m "feat(api): expose relay testing and default model selection"
```

### Task 4: Models Page State and Commands

**Files:**
- Modify: `packages/client/ui-settings-models/src/client/store.ts`
- Create: `packages/client/ui-settings-models/src/client/provider-summary.ts`
- Create: `packages/client/ui-settings-models/src/client/ProviderProbe.tsx`
- Create: `packages/client/ui-settings-models/src/client/ProviderProbe.module.css`
- Modify: `packages/client/ui-settings-models/src/client/ProviderEditor.tsx`
- Modify: `packages/client/ui-settings-models/src/client/CustomProviderCard.tsx`
- Test: `packages/client/ui-settings-models/tests/store.client.spec.ts`
- Test: `packages/client/ui-settings-models/tests/provider-form.client.spec.tsx`

**Interfaces:**
- Produces: `ProviderRow.summary` containing endpoint host, protocol, and model count.
- Produces: `ModelsSettingsState.defaultSelection`, `groups`, and `catalogFailures`.
- Produces: `ModelsSettingsStore.selectDefault(selection)`.
- Consumes: the three RPC methods from Task 3.

- [ ] **Step 1: Write failing state and component tests**

Test that load joins providers, settings, credentials, catalog, and default selection; an older load cannot overwrite a newer one; a default save refreshes the snapshot; summaries never include query strings or credentials; and ProviderProbe submits the current unsaved Base URL, protocol, key, and model.

- [ ] **Step 2: Run the focused client tests**

Run: `pnpm vitest run packages/client/ui-settings-models/tests/store.client.spec.ts packages/client/ui-settings-models/tests/provider-form.client.spec.tsx`

Expected: FAIL because the new state and component do not exist.

- [ ] **Step 3: Extend the joined store**

Load `llm.providers`, `llm.models`, and `llm.defaultModel` in parallel with the settings mirror, keep credential enrichment non-fatal, and expose a `selectDefault()` method that preserves the prior snapshot on failure and reloads after success.

- [ ] **Step 4: Derive safe provider summaries**

Read resolved profile values through `SettingsSchemaOperations`, render only `new URL(baseURL).host`, protocol, and effective model count, and return localized unknown markers for absent or invalid data. Never place the full URL in row text.

- [ ] **Step 5: Implement the reusable probe control**

ProviderProbe owns idle/testing/success/failure state, requires a selected model, calls `llm.testProvider`, displays elapsed time plus the completed stage, warns that success may use a small amount of quota, and clears stale results when any draft field changes.

- [ ] **Step 6: Mount the probe in both editor paths**

Pass the exact draft fields from ProviderEditor and CustomProviderCard. A stored provider with a blank key lets Host resolution use its stored credential; a typed replacement key takes precedence.

- [ ] **Step 7: Run focused tests and commit**

Run the command from Step 2.

```powershell
git add packages/client/ui-settings-models
git commit -m "feat(ui): add relay summaries and connection tests"
```

### Task 5: Dedicated Models and Relays Page

**Files:**
- Modify: `packages/client/ui-settings-models/src/client/ModelsSection.tsx`
- Modify: `packages/client/ui-settings-models/src/client/ModelsSection.module.css`
- Modify: `packages/client/ui-settings-models/src/client/locales.ts`
- Modify: `packages/client/ui-settings-models/src/client/index.ts`
- Test: `packages/client/ui-settings-models/tests/components.client.spec.tsx`
- Test: `packages/client/ui-settings-models/tests/apply.client.spec.ts`
- Test: `packages/client/ui-settings-general/tests/settings-root.client.spec.tsx`

**Interfaces:**
- Consumes: joined store and probe component from Task 4.
- Produces: the navigation label `模型与中转站`, the default-route selector, provider summary rows, and deletion protection.

- [ ] **Step 1: Write failing UI tests**

Assert the section label and title, default provider/model controls, Set as default action, current-default badge, endpoint/protocol/model-count summary, connection-test affordance, and disabled deletion when a row owns the current default.

- [ ] **Step 2: Run focused UI tests**

Run: `pnpm vitest run packages/client/ui-settings-models/tests/components.client.spec.tsx packages/client/ui-settings-models/tests/apply.client.spec.ts packages/client/ui-settings-general/tests/settings-root.client.spec.tsx`

Expected: FAIL on the old Models copy and missing controls.

- [ ] **Step 3: Rename and reorganize the page**

Keep section id `models` for compatibility, change visible copy to Models and Relays / 模型与中转站, place the compact default-route control before the provider list, and keep one open editor at a time. Use existing primitives and the current settings modal navigation button instead of adding a second application or desktop-only window.

- [ ] **Step 4: Add explicit default selection**

The provider control lists live catalog groups, the model control follows the selected provider, and the action calls `controller.selectDefault`. Do not alter the current Session. Disable the action when the selection already matches the default or the route has a catalog failure.

- [ ] **Step 5: Protect default-provider deletion**

Disable Delete for the provider named by `defaultSelection`, give it the tooltip and accessible name `先切换默认模型再删除`, and add the same guard to `removeProviderProfile` so a programmatic click cannot bypass it.

- [ ] **Step 6: Finish responsive styling**

Use a two-column provider summary only when the content column has room, keep buttons and text within the existing 700px settings panel, and collapse to one column at narrow desktop widths without nested cards.

- [ ] **Step 7: Run focused tests and commit**

Run the command from Step 2.

```powershell
git add packages/client/ui-settings-models packages/client/ui-settings-general/tests/settings-root.client.spec.tsx
git commit -m "feat(ui): add models and relays management page"
```

### Task 6: Real Composition, Snapshots, and Documentation

**Files:**
- Modify: `apps/web/tests/models-settings.e2e.ts`
- Modify: `apps/web/tests/default-model.e2e.ts`
- Add or update: `apps/web/tests/snapshots/models-settings/*.expected.md`
- Create: `.agents/notes/implemented/feature/2026-08-26-model-relay-management.md`
- Modify: `packages/client/ui-settings-models/README.md`
- Modify: `packages/client/ui-settings-models/README.zh.md`
- Modify: `packages/host/apiproxy/README.md`
- Modify: `packages/host/apiproxy/README.zh.md`

**Interfaces:**
- Consumes: the complete Host and UI workflow.
- Produces: keyless user-visible snapshots and the required decision record.

- [ ] **Step 1: Extend the real web scaffold scenario**

Use a local OpenAI-compatible server to create a custom relay, fetch models, run a successful connection test, set its model as default, reload the page, and verify the default persists. Add a failure case whose 401 result names authentication without rendering the key.

- [ ] **Step 2: Update the default-model scenario**

Set the default from the Models and Relays page, create a later Session and verify it starts on the selected route, then prove a Session with a logged request header remains on its own route.

- [ ] **Step 3: Record and verify UI snapshots**

Run: `pnpm run test:snapshot:record -- -t "Models settings page"`

Then run: `pnpm run test:snapshot -- -t "Models settings page"`

Expected: updated Chinese snapshots show the dedicated navigation label, default control, provider summaries, and probe result with no credential value.

- [ ] **Step 4: Write the implemented Agent Note and package contracts**

Record why provider profiles stay in `llm-pi-ai`, why default switching is separate from current-session switching, why probes are Host-owned and loopback-only, the rejected desktop-manager and automatic-rotation alternatives, and the exact verification tiers.

- [ ] **Step 5: Re-record documentation pairs**

Run the targeted `verify-translation-pairing --write` command for every changed README and the Agent Note, followed by targeted pairing checks.

- [ ] **Step 6: Run relevant checks and commit**

Run: `pnpm vitest run apps/web/tests/models-settings.e2e.ts apps/web/tests/default-model.e2e.ts`

Run: `pnpm run typecheck`

Run: `pnpm run lint`

Run: `pnpm run doc-sync`

Run: `git diff --check`

```powershell
git add apps/web/tests packages/client/ui-settings-models packages/host/apiproxy .agents/notes/implemented/feature
git commit -m "test: verify model and relay management"
```

### Task 7: Windows Desktop Release Verification

**Files:**
- Modify only if required by verified failure: `apps/desktop/**`
- Generated output: `apps/desktop/release/**` remains untracked release output.

**Interfaces:**
- Consumes: the shipped web profile and self-contained desktop runtime.
- Produces: a newly packaged and installed Windows build containing the feature.

- [ ] **Step 1: Run the scoped pre-push selection**

Use `.agents/skills/dsh-pre-push-checks/SKILL.md` to select the smallest outgoing checks. Do not repeat passing checks unless the selected check covers a broader assembled path.

- [ ] **Step 2: Build the Harness and desktop application**

Run the repository build, desktop runtime preparation, Electron build, and NSIS packaging commands from `apps/desktop/README.md`.

- [ ] **Step 3: Run unpacked smoke verification**

Launch the unpacked application, verify HTTP 200, open Models and Relays, create a fixture provider without exposing a real key, and confirm the bundled `dsh` and toolchain still execute.

- [ ] **Step 4: Install and verify the packaged application**

Close the previous installed process, install the new x64 package, launch it, verify the page and persisted default after restart, then confirm the Harness child process exits when the window closes.

- [ ] **Step 5: Inspect final Git and release state**

Run: `git status --short --branch`

Report commits, commands actually run, installer path and SHA-256, installed path, runtime verification, and any unrelated pre-existing failure separately. Do not push unless the user asks.
