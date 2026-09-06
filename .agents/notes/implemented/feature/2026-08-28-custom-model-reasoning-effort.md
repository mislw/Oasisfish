# Agent Note: Custom model reasoning effort

Status: implemented

English | [中文](2026-08-28-custom-model-reasoning-effort.zh.md)

## Problem

An OpenAI-compatible model listing normally returns model identifiers without declaring which reasoning-effort values each model accepts. The conversation selector therefore cannot offer a reasoning control for relay models even though the request and adapter layers already support per-session reasoning effort.

## Decision

The Models and Relays editor exposes reasoning capability on each pi-ai model row. A user checks the standard `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max` identifiers that the exact model and relay accept. The editor stores those choices in that model's `reasoningEfforts` map; a newly selected level uses its identifier as the wire value, while `off` stores a valueless entry.

The conversation model menu remains capability-driven. It shows the Reasoning effort row only when the selected model advertises levels, then persists the chosen identifier as session request configuration. Leaving every level unchecked preserves an undeclared capability and hides the row instead of guessing from a model name or provider protocol.

Existing hand-written wire aliases remain intact while their level stays selected. The checkbox editor removes an alias only when the user unchecks that level; custom alias creation remains in `settings.yaml`.

## Alternatives considered

**Configure one reasoning level set for the whole provider.** Relay providers commonly mix GPT, Claude, Gemini, image, and non-reasoning models. A provider-wide declaration would advertise invalid choices on some models or hide valid choices on others.

**Show every standard level for every relay model.** The model-list endpoint does not prove support, and sending an invented effort would turn a configuration omission into a provider request failure.

**Infer capability from model identifiers.** Relay prefixes and renamed models are deployment-specific, so name matching would become stale and could not prove the accepted wire spelling.

## Consequences

- The composer presents the two-row Model and Reasoning effort menu for explicitly configured relay models.
- Different models under one provider may publish different level sets.
- Fetching models from upstream still adopts only facts the endpoint reports; users add reasoning levels in the model's advanced settings.
- The adapter continues to reject a selected level outside the exact model's declared set before provider I/O; a relay may still reject a declared wire value it does not actually implement.
