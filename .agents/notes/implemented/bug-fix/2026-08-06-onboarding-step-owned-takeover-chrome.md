# Agent Note: onboarding takeover chrome moves into the step

Status: implemented

English | [中文](2026-08-06-onboarding-step-owned-takeover-chrome.zh.md)

## Problem

The settings shell mounted onboarding takeover chrome as soon as a `settings.onboarding` entry was selected. A registrant may need private facts before deciding whether it has visible content and render `null` while those facts load. Shell-owned chrome could therefore display an opaque stage, set `#root` inert, and block the application even though the selected step ultimately rendered nothing.

## Decision

The takeover chrome belongs to the registrant, not the settings shell. The zero-Cordis `OnboardingSurface` primitive in ui-primitives renders the body-portaled mask and stage and holds `#root` inert for exactly its own mount lifetime. A registrant wraps only its visible branch in this primitive; a `null` branch paints and blocks nothing because the chrome participates in the same render decision as the content.

`SettingsRoot` projects the ordered onboarding ledger and renders only the selected entry without adding a portal, stage, or inert effect. The `settings.onboarding` slot contract requires registrants to own readiness, copy, dialog behavior, and visible chrome.

## Alternatives considered

**Register entries only after private readiness resolves.** Rejected because every feature would need reactive registration and disposal plumbing merely to keep undecided content invisible.

**Make the shell detect an empty rendered slot.** Rejected because `renderSlot` returns an outlet independently of the registrant's eventual React output; DOM probing would require a visible commit before the shell could retract its chrome.

**Keep shell-owned chrome and add a loading state.** Rejected because a private read does not prove that a step will need user action, so loading chrome would still block the application for an entry that resolves to no content.

## Consequences

A mounted but undecided step leaves the application visible and interactive. A future registrant that wants a blocking flow must render `OnboardingSurface` around its visible content; without that wrapper it renders without a mask or inert ownership. `packages/client/ui-primitives/tests/onboarding-surface.client.spec.tsx` pins the primitive lifetime, and `packages/client/ui-settings-general/tests/settings-root.client.spec.tsx` pins the shell's chrome-free rendering behavior.
