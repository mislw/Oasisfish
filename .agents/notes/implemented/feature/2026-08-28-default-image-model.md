# Agent Note: Default image model

Status: implemented

English | [中文](2026-08-28-default-image-model.zh.md)

## Problem

A conversation model can understand an image request but cannot create an image unless the assembled Agent has a callable generation capability. Switching the whole Session to an image model would also discard the selected coding/chat route and mix two independent provider concerns.

## Decision

Image generation is an auxiliary capability, not a conversation-model switch. The Host owns one `imageGeneration` service whose live settings select a primary provider route and an optional fallback route, each with a model id and relative image endpoints. Agent presets opt into the `image_generate` Consumer, and the generated image is committed through the existing attachment service before the tool result enters the session log.

The OpenAI-compatible provider reuses `llm-pi-ai` route configuration and credential references. API keys remain in the credential service, and one custom relay can serve chat and image requests without duplicating secrets. The route must expose an explicit Base URL because the image provider does not depend on pi-ai's private catalog endpoint resolution.

The provider supports OpenAI-compatible Images API responses and chat-completions responses containing a Markdown image Data URL. Chat-completions routes request text and image modalities and serve text-only generation; reference-image editing remains on the Images API route.

When a provider request fails, the provider includes a bounded standard JSON error message when available. It normalizes whitespace and redacts the resolved API key before the detail enters the tool result; arbitrary response bodies remain hidden.

A non-cancellation primary failure triggers one fallback attempt when configured. The first successful route owns the returned provider/model identity and the image is persisted once. If both routes fail, the fallback error is reported because it describes the final attempted route. A successful `image_generate` result contains `已生成。` and the durable image, then concludes the turn without another conversation-model request.

## Alternatives considered

**Switch the Session model when image intent is detected.** This couples image generation to conversation routing, makes subsequent coding turns use the wrong model, and requires intent interception in the Agent Loop.

**Store a second Base URL and API key in image settings.** This duplicates provider configuration and risks stale endpoints or credentials. Reusing the existing provider route keeps one source for connection and authentication facts.

**Retry the same route or select any advertised image model automatically.** This obscures which credentials and quota are consumed. One explicit fallback route keeps routing deterministic and user-configurable.

**Treat a loaded Skill as the image implementation.** A Skill can describe when and how to generate an image, but it cannot produce bytes without a registered callable tool and provider.

## Consequences

- New tasks keep their selected chat model while image requests use the independently configured default image model.
- Model intent dispatch stays on the normal tool-selection path; no keyword interceptor or Agent Loop change is required.
- Tool results carry durable image attachment references, so replay and the existing image renderer can retrieve the same bytes.
- Deployments can select one deterministic fallback without changing the conversation model or duplicating credentials; cancelled requests never start it.
- Successful image generation ends at the tool result, avoiding a second model request that can fail after the image has already been stored.
- The provider supports one OpenAI-compatible generation response as Images API Base64, an HTTP(S) URL, or a chat-completions Markdown image Data URL. [Reference-aware image edits](2026-09-06-reference-aware-image-edits.md) own how direct user images reach the Images API edit request; chat-completions reference editing, masks, and variations remain separate future capabilities.
