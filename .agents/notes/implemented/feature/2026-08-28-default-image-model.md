# Agent Note: Default image model

Status: implemented

English | [中文](2026-08-28-default-image-model.zh.md)

## Problem

A conversation model can understand an image request but cannot create an image unless the assembled Agent has a callable generation capability. Switching the whole Session to an image model would also discard the selected coding/chat route and mix two independent provider concerns.

## Decision

Image generation is an auxiliary capability, not a conversation-model switch. The Host owns one `imageGeneration` service whose live settings select a provider route, model id, and relative Images API path. Agent presets opt into the `image_generate` Consumer, and the generated image is committed through the existing attachment service before the tool result enters the session log.

The OpenAI-compatible provider reuses `llm-pi-ai` route configuration and credential references. API keys remain in the credential service, and one custom relay can serve chat and image requests without duplicating secrets. The route must expose an explicit Base URL because the image provider does not depend on pi-ai's private catalog endpoint resolution.

When an Images API request fails, the provider includes a bounded standard JSON error message when available. It normalizes whitespace and redacts the resolved API key before the detail enters the tool result; arbitrary response bodies remain hidden.

## Alternatives considered

**Switch the Session model when image intent is detected.** This couples image generation to conversation routing, makes subsequent coding turns use the wrong model, and requires intent interception in the Agent Loop.

**Store a second Base URL and API key in image settings.** This duplicates provider configuration and risks stale endpoints or credentials. Reusing the existing provider route keeps one source for connection and authentication facts.

**Treat a loaded Skill as the image implementation.** A Skill can describe when and how to generate an image, but it cannot produce bytes without a registered callable tool and provider.

## Consequences

- New tasks keep their selected chat model while image requests use the independently configured default image model.
- Model intent dispatch stays on the normal tool-selection path; no keyword interceptor or Agent Loop change is required.
- Tool results carry durable image attachment references, so replay and the existing image renderer can retrieve the same bytes.
- The provider supports one OpenAI-compatible generation or reference-aware edit response, including Base64 and HTTP(S) URL forms. [Reference-aware image edits](2026-09-06-reference-aware-image-edits.md) own how direct user images reach the edit request; masks and variations remain separate future capabilities.
