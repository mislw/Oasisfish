# Agent Note: Nonblocking model setup

Status: implemented

English | [中文](2026-08-29-nonblocking-model-setup.zh.md)

## Problem

The first-run credential dialog took over the application before the user could inspect a workspace or understand where model routing belonged. It also duplicated the provider editor already owned by Models and Relays, so model configuration had two entry paths with different surrounding context.

## Decision

Provider, relay, model, and credential configuration remains in Models and Relays. The product registers no startup step for missing credentials or general testing-stage copy; the [product-notice removal](../simplification/2026-09-06-remove-product-internal-testing-notice.md) owns that product rule.

When an ordinary session's model directory finishes loading with no choices, the composer model trigger identifies the unconfigured state. Its Model pane directs the user to Models and Relays without making the application root inert. The existing `session.models.routable` rule remains the independent authority for whether the composer input itself can submit a request.

## Alternatives considered

**Keep the credential dialog and add a link to Settings.** This still blocks first use and preserves two configuration paths.

**Open Models and Relays automatically at startup.** Automatic navigation still interrupts the user's chosen workflow and makes a missing credential look like an application failure.

**Treat every unroutable session as unconfigured.** A configured route can become temporarily unavailable, while an empty catalog is the specific state that lacks a model choice. The existing routability block retains its separate failure message.

## Consequences

- A missing API key does not create a startup takeover.
- The composer exposes a localized, persistent route to the model settings page when the directory is empty.
- Provider secrets continue to use the settings page's write-only credential flow.
- Startup remains interactive without a product notice or credential takeover.
