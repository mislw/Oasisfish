# Agent Note: Model and relay management in the settings page

Status: implemented

English | [中文](2026-08-26-model-relay-management.zh.md)

## Problem

DeepSeek Harness could declare and edit provider profiles from the Models page, but choosing a shared default still depended on another surface and a draft gateway could not prove that its URL, protocol, credential, and model worked together before the profile was saved. Users configuring an OpenAI-compatible relay needed one place that distinguished provider configuration, the default for future sessions, and the route already recorded by an existing Session.

## Decision

The existing settings navigation opens one Models and Relays page owned by `dsh-client-ui-settings-models`. The page joins the provider directory, model catalog, shared default, redacted provider settings, and value-free credential status. Provider profiles remain in the adapter-owned `llm-pi-ai` namespace, and credential values remain write-only in `ctx.credentials`; the page does not introduce a second configuration file or a desktop-only source of truth. This extends the [provider declaration decision](../architecture/2026-08-04-declaring-a-provider-from-the-models-page.md) rather than replacing it.

The shared default is an explicit provider/model pair selected through `llm.defaultModel` and `llm.selectDefaultModel`. Selection resolves the requested route before persisting it, and an unavailable configured default stays unavailable rather than silently falling back. The value supplies only sessions that do not yet have a logged route. Existing Sessions continue to derive their route from `request/header` and use the [session model selector](2026-07-24-web-session-model-selector.md) for session-local changes. A provider that owns the shared default cannot be deleted through either the button or the command until another default is selected.

Draft connection testing is owned by the Host and the adapter family. `llm.testProvider` accepts the form's unsaved endpoint, protocol, optional credential, and model, then asks the registered provider probe to send one minimal request. The result contains a success sample or a classified endpoint, authentication, protocol, model, or response failure with elapsed time; provider response bodies and credentials never return to the client. The probe writes no settings, changes no default, and appends no Session event. Because the method accepts a caller-selected URL and draft credential, the browser carrier permits it only for loopback same-origin requests.

Switching is manual. The page does not rotate providers, balance traffic, retry a turn on another route, or change an existing Session when the default changes. A provider/model change therefore remains an explicit configuration decision whose first model-visible use is reconstructed from the Session log.

## Verification

LLM registry and pi-ai tests pin probe registration, request classification, abort handling, typed-key precedence, and secret-free failures. ApiProxy carrier tests pin exact schemas, default resolution, loopback denial, and signal propagation. Client state and component tests pin the joined snapshot, default deletion protection, safe summaries, unsaved-draft probes, responsive controls, and bilingual copy. Keyless browser scenarios run a local OpenAI-compatible relay through model discovery, rejected and accepted credentials, connection testing, provider creation, default selection, reload persistence, and preservation of a previously logged Session route. Windows release acceptance builds the shipped Host and Web artifacts, packages and installs the Electron application, exercises the page after restart, and confirms the Harness child exits with the window.

## Alternatives considered

**Build a separate desktop relay manager.** Rejected because it would duplicate provider ownership, credential storage, validation, and invalidation outside the plugin configuration system. The desktop application ships the same Web composition, so the existing settings page is the common surface for browser and packaged use.

**Make default selection switch the current Session.** Rejected because a default is creation-time policy, while an existing Session may already have a logged route and model-visible history. The session selector remains the explicit control for that Session.

**Test the endpoint directly from the browser.** Rejected because browser CORS and proxy policy are not the provider protocol, the browser would need to own credential handling, and adapters would duplicate request construction and error classification in UI code.

**Add provider rotation or automatic failover.** Rejected because retrying a turn on another route changes cost, capabilities, cache behavior, and model output without an explicit logged selection decision. Rotation can be designed separately if it gains durable policy and request-level observability.

## Consequences

A packaged Windows installation and the ordinary Web application expose the same one-button path for provider profiles, relay testing, model discovery, and future-session defaults. The page can validate an unsaved gateway without persisting its key, and a successful test may consume a small amount of provider quota. Existing Sessions remain stable, invalid defaults fail visibly, and deleting the active default requires an explicit replacement. The first release gains convenience without adding automatic routing policy or another configuration owner.
