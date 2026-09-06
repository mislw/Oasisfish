# Agent Note: Remove the product internal-testing notice

Status: implemented

English | [中文](2026-09-06-remove-product-internal-testing-notice.zh.md)

## Problem

The mandatory internal-testing notice blocks every fresh desktop or loopback profile before the user can reach the workspace. Its testing-stage copy no longer communicates an action or choice that the application requires, while the versioned acknowledgement adds a settings read, a write, modal state, and browser-only fallback behavior solely to dismiss that copy.

## Decision

The assembled product registers no internal-testing notice in `settings.onboarding`. `ui-settings-models` owns only the Models and Relays settings page; it does not own product-onboarding copy, acknowledgement state, or modal presentation. Missing provider credentials remain nonblocking and route users through the composer model menu to Models and Relays.

The Host continues to accept `ui-onboarding.welcomeNoticeVersion` in user settings so an existing `settings.yaml` remains valid after upgrade. No shipped client reads, writes, or branches on that retained field. The generic `settings.onboarding` slot and coordinator remain available for future steps with an independently justified user action.

## Alternatives considered

**Hide the dialog while retaining its registration and acknowledgement implementation.** Rejected because hidden product policy would still perform private state work and preserve dead code, tests, and copy that could accidentally reappear.

**Automatically acknowledge the current notice version.** Rejected because an automatic write changes user settings without providing product value and still couples startup to the obsolete field.

**Remove the `ui-onboarding` namespace and field immediately.** Rejected because existing user documents may contain `welcomeNoticeVersion`; retaining schema acceptance avoids an upgrade-time validation failure without restoring any runtime behavior.

## Consequences

Fresh and existing profiles enter the application without the internal-testing dialog or an acknowledgement write. Model configuration, stored credentials, user workspaces, automatic updates, and the generic onboarding extension point are unchanged. Package tests pin the absence of a `ui-settings-models` onboarding registration, and the keyless Chromium scenario verifies an interactive startup before model configuration.
