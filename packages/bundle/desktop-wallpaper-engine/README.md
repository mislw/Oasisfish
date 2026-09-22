---
description: "Desktop-only Wallpaper Engine bundle that activates the pinned upstream integration and DSH-owned first-run onboarding as one profile layer."
kind: "package-bundle"
---

# `@deepseek-ai/dsh-desktop-wallpaper-engine`

English | [中文](README.zh.md)

## Summary

This bundle activates Wallpaper Engine backgrounds and their localized first-run onboarding as one profile choice. It inserts the exact `dsh-plugin-wallpaper-engine@0.7.5` Host and Client package plus `@deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding`; disabling the bundle removes both rows together. It is an optional layer for a Web-backed Desktop profile and does not change the ordinary `web` profile.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Add `@deepseek-ai/dsh-desktop-wallpaper-engine` after the ordinary Web bundles in a Desktop-owned profile. The layer inserts the upstream wallpaper package first and the onboarding package second. Profile, home, and invocation patches can disable or replace either stable row id: `desktop-wallpaper-engine` and `ui-wallpaper-engine-onboarding`.

The upstream package owns Wallpaper Engine discovery, HTTP routes, background rendering, settings, persistence, uploads, and media processing. The first-party onboarding package only detects whether an upstream settings object exists and directs an unconfigured user to the upstream settings section.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals - click to expand</summary>

The bundle is a static patch carrier. Its single insert adds exactly two rows and owns no service, event, mutable state, or runtime invariant beyond that composition. Each inserted package owns its own lifecycle and cleanup.

### Source map

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Inserts the pinned upstream row and the first-party onboarding row |
| [`src/index.ts`](src/index.ts) | Package entry with no runtime API |
| - | No runtime invariant companion is published; the package is a static patch-list carrier and the inserted packages own their runtime relationships. |
| [`tests/desktop-wallpaper-engine.spec.ts`](tests/desktop-wallpaper-engine.spec.ts) | Dependency pin, patch composition, order, ordinary-Web isolation, and Loader disposal checks |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Bundle package map](../README.md) - profile layers shipped by the repository.
- [Wallpaper onboarding](../../client/ui-wallpaper-engine-onboarding/README.md) - the localized first-run decision owned by DSH.
- [app-boot profiles](../../boot/app-boot/README.md) - bundle resolution and ordered patch composition.

-----

<a id="model-experience"></a>
## Model Experience

### Desktop wallpaper composition

#### What the model sees

No model request receives content from `@deepseek-ai/dsh-desktop-wallpaper-engine`. The inserted packages add browser and Host behavior without registering model prompts, tools, or model-visible Session events.

#### Token effect

Zero direct tokens.

#### KV Cache effect

The bundle adds no request content and does not invalidate an otherwise reusable model-request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Compatibility follows the exact upstream release** - updating `dsh-plugin-wallpaper-engine` requires reviewing its Host routes, Client registrations, global styling, and cleanup against the current Desktop Web application before changing the pin.
- **The layer requires a Web-backed profile** - adding it to Headless, SDK, SDK Minimal, or ACP composition is unsupported and does not create a browser surface.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers - click to expand</summary>

None.

</details>
