# Model and Relay Management Design

English | [中文](2026-08-26-model-relay-management-design.zh.md)

## Goal

DeepSeek Harness provides one dedicated Models and Relays page where a user can configure API providers, verify a provider and model, and choose the default route used by new tasks. The page manages Harness configuration only and does not read or write Codex, Claude Code, or another product's configuration files.

## Product Flow

The application navigation includes a Models and Relays button. Selecting it opens a full settings page rather than a modal or an external manager. The page shows the current default provider and model first, followed by the saved provider list and one editor panel.

A user can add a provider, enter its display name, Base URL, API protocol, API key, and model list, then save and test the configuration. The editor can request an OpenAI-compatible model listing from the draft endpoint and lets the user add models manually when discovery is unavailable. A saved provider can be edited, deleted, tested again, or selected as the default route.

The first release supports explicit manual switching between saved providers. It does not rotate providers, balance requests, or fail over automatically.

## Navigation and Page Layout

The client shell owns the navigation button and routes it to the existing settings composition. The Models settings plugin owns the page contents, preserving the plugin architecture and avoiding desktop-only configuration behavior.

The page contains three work areas:

- A compact default-route control showing the provider, model, and reasoning effort used when a new task is created.
- A provider list showing the display name, endpoint host, protocol, credential status, configured model count, and test status.
- A provider editor for connection fields, model discovery, manual model editing, saving, testing, default selection, and deletion.

Only one provider editor is open at a time. Provider rows use clear commands instead of implicit row-click behavior.

## Provider Configuration

The existing `llm-pi-ai` settings namespace remains the owner of custom provider profiles. Each profile keeps its route ID, display name, `baseURL`, API protocol, and model descriptors. The page uses the current settings mutation API, revision checks, and adapter validation instead of adding a second provider database.

API keys remain write-only credentials. The browser sends a new key through `credentials.set`; settings store only the credential reference. Reloaded forms show whether a credential is configured but never return or display its value. Editing connection metadata with an empty key field preserves the stored key.

Saving a valid profile updates the dynamic LLM adapter without restarting the desktop application. Saving does not make the profile the default automatically.

## Default and Current Task Switching

The shared `agent-default-model` settings namespace owns the default provider, model, and optional reasoning effort. Selecting Set as default writes that selection only after the provider and model resolve successfully.

New tasks read the updated default. Existing tasks retain their selected route because their request history and tool work may already depend on the current model. The existing model selector remains the explicit control for changing an existing task.

If the saved default disappears or stops resolving, the page reports the invalid selection and requires another default; it does not silently choose an unrelated provider.

## Model Discovery and Connection Test

Fetch models uses the existing provider discovery operation with the Base URL and unsaved credential currently shown in the editor. Discovery presents candidates for review and never overwrites manually corrected model metadata.

Test connection performs a real minimal request through the selected protocol and model. The Host owns the request so the browser does not implement provider protocols. The test uses the draft endpoint and key, applies a bounded timeout, requests a short deterministic text response, and returns structured stages for endpoint reachability, authentication, protocol compatibility, model availability, and response completion.

The test result is user-visible diagnostic data only. It is not appended to a task Session, does not alter the default route, and does not expose response headers, credentials, or raw provider bodies that may contain sensitive data. The UI states that a successful test may consume a small amount of provider quota.

## Failure Handling

Field validation identifies the provider, endpoint, protocol, or model that must be corrected before a settings write. Settings revision conflicts preserve the draft and ask the user to reload current values. Credential write failures distinguish a saved profile from an unsaved key so the user can retry without recreating the provider.

Discovery and test failures remain beside the editor and keep manual model entry available. Deleting a provider requires confirmation and cannot delete the active default until another default is selected. Transport errors are normalized into short diagnostics without storing secret values.

## Verification

Unit tests cover provider-form validation, secret preservation, default selection, deletion constraints, test-result normalization, and draft test requests. A real-composition test boots the shipped web profile, creates a provider through the settings and credential APIs, tests it against a local OpenAI-compatible server, sets it as default, and verifies that a new task resolves the selected route.

Browser tests cover navigation, provider creation, model discovery, connection-test success and failure, default switching, reload persistence, and narrow desktop layout. The user-visible workflow receives a keyless snapshot from the runnable test application. Release verification rebuilds the Windows desktop package and confirms the installed application can open the page, persist a provider, and restart with the selected default.

## Alternatives Considered

**Separate desktop manager.** A second Electron control plane would duplicate settings, credential handling, and runtime synchronization while leaving browser deployments with different behavior.

**Import the Codex++ provider manager.** Its implementation targets Codex configuration files and carries a different license and runtime architecture. DeepSeek Harness uses the same product concept through its own settings, credential, and LLM extension points.

**Automatic relay rotation.** Rotation requires request affinity, health policy, retry ownership, and durable diagnostics. Manual provider switching meets the immediate need without introducing routing behavior that the user did not request.
