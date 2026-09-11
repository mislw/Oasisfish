# Agent Note: Custom provider image-input default

Status: implemented

English | [中文](2026-09-11-custom-provider-image-input-default.zh.md)

## Problem

The custom-provider form recorded model ids without input modalities. The pi-ai adapter correctly resolved an undeclared route to its conservative `[text]` fallback, so an image-capable relay appeared selectable but rejected image attachments before sending. Enabling the relay required a manual `settings.yaml` edit that the configuration page neither exposed nor explained at the point of creation.

## Decision

The custom-provider form enables **Support image input** by default and writes `defaultInput: [text, image]` into the new profile. Clearing the option writes `[text]`. The pi-ai provider editor exposes the same option for existing routes and persists either value through the settings path-operation API.

The adapter's own fallback remains `[text]`. Hand-written profiles and deployments outside this configuration page therefore retain the conservative behavior, while the product creation flow makes the common multimodal relay choice explicit and reversible.

## Alternatives considered

**Change the adapter-wide default to `[text, image]`.** This would grant image capability to every hand-written or programmatic route, including text-only endpoints that never passed through the product form. A failed provider request after attachment admission is harder to recover from than a pre-send refusal.

**Infer image support from model ids.** Relay model names are provider-owned and may be aliases, prefixes, or private releases. Name matching would silently misclassify both directions and would not give a text-only route an explicit opt-out.

## Consequences

New custom providers accept image attachments without a manual YAML edit, and text-only routes can opt out before creation. Existing profiles keep their stored meaning until a user changes the option. Unit coverage pins both values, and the Web configuration scenario pins the default control, persisted YAML, and reopened editor.
