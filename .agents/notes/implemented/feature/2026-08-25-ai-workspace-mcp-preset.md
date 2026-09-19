# Agent Note: Authenticated AI Workspace MCP in the standard preset

Status: implemented

English | [中文](2026-08-25-ai-workspace-mcp-preset.zh.md)

## Problem

The AI Workspace needs Harness conversations to read and change calendar, todo, note, document, and private knowledge data without exposing Supabase credentials or NAS paths to the agent. MCP tool annotations describe intent but are remote metadata, so treating `readOnlyHint` or `destructiveHint` as execution authority would let a missing or incorrect annotation bypass user approval.

## Decision

The shipped `standard` preset conditionally mounts one authenticated `@deepseek-ai/dsh-mcp-client` instance under the stable `workbench` namespace when `AI_WORKSPACE_MCP_URL` is configured. It sends `HARNESS_TOOL_SECRET` as a bearer credential and uses `failOnStartupError: true`, so a configured Workbench deployment fails activation when discovery or authentication is unavailable instead of silently starting without business tools.

The deployment keeps data ownership outside Harness. The gateway exposes the private MCP endpoint, forwards authenticated requests to the AI Workspace tool API, and never gives Harness Supabase service credentials or knowledge-storage paths. The Web app resolver manifest owns the MCP client dependency because shipped preset compositions resolve bare plugin names through that assembled deployment.

Write authority is enforced locally. `approvalRequiredTools` contains every calendar, todo, note, and document mutation exposed by the Workbench server. The MCP client maps those raw names to their public server-qualified names and installs a scoped `tools/pre-execute` policy. A downstream deny or ask remains authoritative; an otherwise allowed matching call becomes an approval request before `tools/call` sends any network request. MCP annotations remain presentation hints only.

## Alternatives considered

**Trust MCP annotations to decide approval.** Rejected because annotations arrive from the remote server and are optional hints rather than a Harness enforcement decision.

**Put Supabase and NAS credentials directly in Harness.** Rejected because the agent process does not need database or filesystem authority; the owner-scoped Workspace API already provides the narrower capability.

**Ship a separate reduced Workbench preset.** Rejected because the embedded assistant replaces the native assistant with the complete Harness surface, and the existing standard preset already owns the full interaction, approval, and tool stack needed by the deployment.

## Consequences

One embedded Harness surface can use the complete coding-agent experience plus owner-scoped Workbench tools. Read tools execute normally, while mutations create the existing user approval interaction and fail closed when no approval channel is available. Deployments without `AI_WORKSPACE_MCP_URL` retain the ordinary standard preset without an external dependency. The explicit mutation list must be updated whenever the Workspace server adds another write tool; this maintenance cost is accepted in exchange for local, reviewable authority.
