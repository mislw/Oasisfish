# Agent Note: Provider probe minimum output

Status: implemented

English | [中文](2026-09-07-provider-probe-minimum-output.zh.md)

## Problem

The provider connection probe requested at most eight output tokens. Some OpenAI-compatible gateways reject requests below a sixteen-token minimum before running the selected model, so every text model on an otherwise valid route appeared to return an unusable response. The same text probe also offered explicit `gpt-image-*` models even though those models use the Images API rather than a text-generation endpoint.

## Decision

The pi-ai provider probe requests at most sixteen output tokens. The request remains a minimal `Reply with exactly OK.` generation, but it satisfies gateways that enforce a sixteen-token minimum.

The Models settings page omits explicit `gpt-image-*` image-only model ids from the text-probe selector. It explains that those models are verified through the separately configured image-generation route. Other models remain available because a model that can generate images may also support text, and the catalog does not expose a provider-neutral image-only capability flag.

## Verification

The pi-ai probe test asserts the OpenAI-compatible request carries a sixteen-token output cap. The Models settings component test asserts plain and bracket-prefixed `gpt-image-*` ids are absent from the text selector while a text model remains selectable and the explanation is visible.

## Alternatives considered

**Retry after an eight-token rejection.** Rejected because a known-invalid first request wastes latency and quota accounting, and provider errors do not expose one stable minimum-value code across gateways.

**Test image models by generating an image.** Rejected because the connection button would create a billable asset and needs image-specific request fields that belong to the image-generation route.

**Exclude every model id containing `image`.** Rejected because multimodal models can support both text and images. Only the explicit `gpt-image-*` family is treated as image-only without a catalog capability declaration.

## Consequences

- Text connection tests work with gateways that enforce a sixteen-token minimum.
- The test remains a small provider request and does not change settings or Session history.
- Pure image models are not falsely rejected by a text endpoint probe.
- Image-route availability remains verified by image generation rather than the text connection button.
