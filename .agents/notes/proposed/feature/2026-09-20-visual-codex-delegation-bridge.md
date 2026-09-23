# Agent Note: Visual Codex-to-Harness delegation bridge

Status: proposed

English | [中文](2026-09-20-visual-codex-delegation-bridge.zh.md)

## Problem

Users want Codex to retain responsibility for complex work while delegating bounded, lower-cost work to a Harness agent. The repository already supports the opposite direction through the [Codex subagent provider](../../../../packages/subagent/subagent-codex/README.md): a Harness agent can start a fresh Codex task. Codex cannot currently discover, invoke, monitor, or cancel a Harness task through a supported Codex integration.

A command-line-only adapter would not meet the product need. Users need to establish the connection in the Oasisfish interface, select which Workspaces and permissions the connection receives, observe delegated work in the normal Session UI, answer interactions, cancel a run, and revoke access without editing protocol configuration by hand.

The connection is an authorization path into filesystem, shell, model, and credential-bearing capabilities. A local endpoint without explicit authentication, Workspace admission, and server-owned permission policy would allow an unrelated process or browser page to start work with the user's Harness authority.

## Proposal

Ship an optional Codex Bridge bundle that turns a running Oasisfish Web or Desktop Host into a loopback-only Streamable HTTP MCP server. Codex connects as an MCP client and receives one synchronous delegation tool. Each accepted tool call creates an ordinary root Session in an admitted Workspace, drives one Harness turn, and returns a bounded final result. The existing Session and conversation interfaces remain the detailed visual record.

The bridge is not a second agent loop and does not translate Codex protocol messages into internal loop calls. It admits an external request, creates a normal Harness Agent through the existing registry, and observes the resulting Session. The [Codex product provider decision](../../implemented/feature/2026-08-04-claude-code-and-codex-subagent-backends.md) remains the authority for Harness-to-Codex delegation; this proposal adds the independent Codex-to-Harness direction and does not change that provider.

```text
Codex
  -> Streamable HTTP MCP
  -> Codex Bridge service
  -> ordinary Harness root Session
  -> AgentLoop, tools, persistence, and Web presentation
```

### Product flow

The optional bundle contributes a **Codex connection** Settings section. An unpaired installation shows the local endpoint, availability checks, and one primary **Connect Codex** action. The Host uses Codex's supported MCP registration operation when an installed Codex exposes it; otherwise the UI shows the exact registration values and leaves product-owned configuration to the user. The bridge does not parse or rewrite Codex configuration with a repository-owned TOML editor.

Connection setup uses an authorization flow rather than placing the user's Harness credentials in Codex configuration. Oasisfish displays the requested connection identity and admitted Workspaces before approval, issues a revocable bridge credential after approval, and stores only the server-side credential record in the Harness credential provider. The Codex-side integration owns its client credential according to the supported MCP authentication flow. Pairing failure leaves neither an admitted connection nor a reusable one-time grant.

The connected view shows connection health, admitted Workspaces, the selected Agent Preset, permission policy, model route, active-run count, and credential revocation. It also lists active bridge runs with **Open Session** and **Cancel** actions. Completed delegated Sessions remain in their normal Workspace history and carry a localized Codex-origin badge derived from durable Session data.

The companion Codex plugin is optional. Its Skill describes when to delegate bounded searches, documentation changes, focused edits, and narrow checks, and when Codex must retain architectural, security-sensitive, cross-package, or ambiguous work. The transport remains usable without the companion plugin through an explicit MCP tool call. Oasisfish cannot guarantee that Codex delegates a task; Codex owns that routing decision.

### MCP interface

The first version exposes one tool with a stable, product-neutral operation and a Codex-facing display name:

```ts
interface DelegateTaskInput {
  requestId: string
  task: string
  workspacePath: string
  intent: 'analyze' | 'edit'
}

interface DelegateTaskResult {
  requestId: string
  runId: string
  sessionId: string
  status: 'completed' | 'cancelled' | 'failed'
  finalText?: string
  diagnostic?: string
}
```

`requestId` is an opaque client-generated id used to reject duplicate active or completed requests within the connection's bounded deduplication window. `task` is the complete standalone instruction passed as the Session's user input. `workspacePath` must resolve to an admitted registered Workspace; the server canonicalizes it and rejects unknown paths, aliases that escape an admitted root, and deleted registrations. `intent` describes the requested operation but never raises authority: an `edit` request fails when the connection is read-only.

The result carries the final non-empty assistant text when the turn completes. It does not copy reasoning, transient assistant chunks, tool traffic, raw errors, credentials, or the complete Session log into Codex. `diagnostic` uses bridge-owned safe categories and actionable text. Codex receives the Session id so its final response can direct the user to the visual record without duplicating that record into its context.

The first version has no continuation, background mode, resource catalog, prompt catalog, arbitrary model selector, arbitrary Agent Preset selector, or generic tool proxy. Cancellation of the MCP request cancels the owned turn. Cancellation from the Oasisfish UI settles the same run and returns `cancelled` when the HTTP request remains connected. A lost transport does not silently continue work; the bridge cancels the live turn and retains the interrupted Session record.

### Runtime ownership

A new Host service owns connection admission, MCP transport sessions, request deduplication, and live run handles. Its controller package exposes typed browser operations for status, connect, revoke, list active runs, open-run identity, and cancel. A client plugin contributes the Settings section and Codex-origin presentation. An optional bundle composes the Host, controller, client, locale, and configuration rows without adding another executable or package binary.

The expected package placement is:

| Package | Responsibility |
|---|---|
| `packages/mcp/codex-bridge` | MCP server, authentication adapter, connection policy, run lifecycle, and delegation service |
| `packages/api/codex-bridge-controller` | Typed Host-to-browser operations and live status notifications |
| `packages/client/ui-codex-bridge` | Settings section, pairing state, run controls, and Session-origin presentation |
| `packages/bundle/codex-bridge` | Optional Profile composition for the complete integration |

The service registers through Cordis effects and removes its HTTP route, authorization handlers, notifications, and run observers on disposal. Disposal rejects new requests, cancels live bridge-owned turns, waits for their settlement, and then closes transport state. It does not delete Sessions or roll back filesystem changes already made by tools.

The bridge creates an ordinary root Session because Codex is an external initiator, not a Harness parent Agent. It appends an ignorable integration-owned `codex/delegation` Session event before the delegated user message. The event records the bridge run id, stable connection id, external request id, requested intent, and admitted Workspace identity; it contains no credential. A plugin-owned projection supplies list badges and active-run discovery without changing subagent lineage or hiding the Session from Workspace navigation.

Adding that event requires the declared persistence-type acknowledgement, TypeScript and Python SDK expected-output updates, current Session-format validation, and an `ignorable: true` envelope so a build that does not consume the integration event may still read the log. The proposal does not change Session framing or require a format-version bump unless implementation changes the common event envelope.

### Security and permissions

The bridge activates only when the Host Web server binds to `127.0.0.1`. A composition using `0.0.0.0` fails the bridge row at load with an actionable error; a configuration flag cannot waive this rule in the first version. Remote access, reverse proxies, and TLS termination require a separate proposal with a network threat model.

Every MCP request requires the exact admitted connection credential, an accepted MCP content type and method, and an allowed Origin state. Browser-originated cross-site requests are rejected even when they reach loopback. Responses never include bearer material. Authentication failures use uniform responses that do not reveal whether a connection id exists.

Each connection stores an allowlist of Workspace ids, one Agent Preset, one resolved model route or the Preset default, one permission preset, a maximum concurrent-run count, a maximum task size, a per-turn output limit, and an interaction timeout. These deployment-varying limits are validated settings, not constants hidden in the plugin. A call cannot select another Preset, model, permission mode, Workspace, or limit.

The default connection is read-only. Enabling Workspace writes requires an explicit UI confirmation that names the admitted Workspaces. Shell and other permission decisions continue through the selected Harness permission preset and approval service. A request waiting for approval or a user answer appears in the Oasisfish Session UI; timeout or connection revocation cancels the run instead of granting authority or inventing an answer.

The server never forwards ambient Codex environment variables, Codex account credentials, or Codex configuration to the Harness Agent. The Harness route resolves its own credentials through existing providers. Logs and diagnostics redact connection credentials and authorization headers.

### Workspace concurrency

The first version executes synchronously and tells Codex to wait for the tool result before editing overlapping files. Oasisfish cannot technically stop Codex or another local process from changing the same Workspace, so the UI describes same-Workspace write delegation as cooperative rather than isolated.

Read-only delegation is safe from bridge-authored file races. Write delegation records the Workspace's initial repository status when available and warns when the final status contains changes that cannot be attributed from Harness tool records. It does not claim transactional isolation, automatic merge, rollback, or complete file attribution. Isolated worktrees and patch handoff remain a possible later mode for Git Workspaces, not a hidden fallback for the first version.

### Failure behavior

An unavailable model route, invalid Preset, missing Workspace, expired credential, duplicate request, concurrency limit, oversized task, or unsupported permission state fails before Agent publication. An error after Session publication leaves the durable Session available with the settled or interrupted turn facts that were actually recorded.

If Codex disconnects, Oasisfish restarts, the bundle unloads, or the MCP transport fails during a run, the bridge requests cancellation and does not report completion. A restarted bridge does not resume the old HTTP request. The user may open the retained Session and continue it as an ordinary Oasisfish conversation, but that continuation is not returned to the original Codex call.

Credential revocation rejects new requests immediately and cancels live requests owned by that connection after the UI confirms the consequence. Removing the optional bundle closes the endpoint and retains connection records only if the credential provider's normal deletion contract says so; bundle removal documentation must state the exact retained state.

### Verification and documentation

Protocol tests cover initialize, tool discovery, tool calls, abort, malformed input, unsupported methods and content types, duplicate request ids, and transport disposal through the real MCP server adapter. Security tests cover missing and wrong credentials, Origin rejection, loopback enforcement, path canonicalization, Workspace removal, read-only downgrade, authorization timeout, revocation, log redaction, and concurrent limit races.

Lifecycle tests cover failure before and after Session publication, cancellation from Codex and the UI, Host disposal, connection revocation, interrupted persistence, and one run waiting for user interaction. Session tests verify the ignorable event, projections, current-format reading, and both SDK expected outputs. UI component tests cover every connection and run state; built Web tests cover pairing, delegation, opening the Session, approval, cancellation, revocation, reconnection, and localized output.

A keyless recorded-session snapshot covers the complete delegated Session as seen by the user and model. A keyless real-Codex compatibility test uses the supported Codex MCP client against a loopback fixture to establish handshake and tool-call behavior without model credentials. The product-visible implementation PR includes a GIF recorded from the real Web server and model flow. Package READMEs, subsystem documentation, configuration JSDoc, tool presentation, locale dictionaries, and user setup guidance update with the code.

## Alternatives considered

**Let Codex spawn a standalone stdio adapter.** This is simpler for Codex configuration but makes the visual Oasisfish process a separate observer. Live cancellation, interactions, connection status, and run ownership would need cross-process coordination, and users would still manage a command outside the interface. The embedded HTTP endpoint keeps the running Host as the authority and presentation source.

**Use ACP or the existing SDK protocol directly.** Those protocols can drive Harness agents, but Codex already consumes MCP tools. Requiring a Codex-specific ACP or SDK client would add another Codex integration and would not provide MCP discovery or the companion Skill path.

**Reuse `subagent-codex` by reversing its wire.** That provider launches Codex as a one-shot child and returns Codex's final answer to a Harness parent. It does not make a running Harness Host callable by Codex, and reversing its private app-server client would conflate two independent lifecycle and authorization owners.

**Write Codex configuration files directly.** A repository-owned TOML mutation path would follow product-private layout, merging, locking, and version rules. The bridge uses supported Codex registration and authentication operations and falls back to displaying values rather than inventing another configuration owner.

**Expose a generic remote tool proxy.** Forwarding arbitrary Harness tools would bypass Session logging, Agent policy, model mediation, and the existing interaction UI. One delegation tool keeps model-visible input logged and lets the normal loop own tools and approvals.

**Allow network binding in the first version.** A remotely reachable agent endpoint requires TLS identity, deployment authentication, proxy trust, rate limiting, network-origin policy, and a different credential recovery model. Loopback pairing serves the requested local Codex and Oasisfish workflow without claiming those guarantees.

**Start with background and continuable runs.** Persistent continuation needs Codex-visible run collection, follow-up ordering, reconnection semantics, and notification policy. Synchronous one-turn calls establish the authorization, lifecycle, logging, and UI ownership first.

## Acceptance criteria

- A user enables the optional bundle, connects a supported local Codex installation from the Oasisfish Settings interface, verifies connection health, and revokes it without manually editing Harness configuration.
- Codex discovers one delegation tool, calls it for an admitted Workspace, waits for the final result, and receives the exact durable Session id plus a bounded final answer or safe failure.
- Every accepted request creates one visible ordinary root Session whose durable origin record contains no credential. The user can open it, observe tools and messages, answer supported interactions, and cancel the active run.
- Connection policy, not tool arguments, determines Workspaces, Preset, model route, permission preset, limits, and write authority. Invalid authentication, Origin, Workspace, path alias, duplicate id, or elevation attempt starts no Agent.
- The endpoint cannot activate on a non-loopback Web server. Revocation and disposal reject new calls, settle live calls, remove routes and observers, and retain truthful Session history.
- Focused protocol, security, lifecycle, persistence, SDK, UI, Web, snapshot, and real-Codex compatibility evidence passes. Bilingual documentation and the required GUI GIF accompany implementation.

## Risks

Codex product registration and authentication behavior can change independently of this repository. The bridge therefore depends on a qualified Codex version range and must fail with actionable setup guidance when that integration is unavailable; it must not fall back to editing unknown configuration formats.

Same-Workspace write delegation is cooperative and can conflict with Codex, editors, build tools, or other agents. Read-only default, synchronous routing guidance, visible run state, and explicit write admission reduce the risk but do not provide isolation or rollback.

An embedded MCP endpoint increases the Host's security responsibilities. Authentication mistakes, Origin mistakes, overly broad Workspace admission, unsafe diagnostics, or a permission-policy mismatch could expose local execution. Loopback-only activation, revocable credentials, fail-closed validation, focused hostile-input tests, and no argument-driven elevation are acceptance requirements rather than optional hardening.

The new durable event and UI projections add persistence and SDK work to what could otherwise be a transport-only feature. Omitting that record would make completed delegated Sessions indistinguishable after restart and would violate the requested visual ownership, so the proposal accepts that coordinated cost.
