# Agent Note: Oasisfish persistent seascape

Status: implemented

English | [中文](2026-08-29-oasisfish-persistent-seascape.zh.md)

## Problem

Oasisfish branding was limited to small logo replacements. The blank conversation, active transcript, sidebar tools, and settings panel still read as unrelated generic surfaces, while using the supplied reference screenshot as one background would bake controls and text into a fixed image.

## Decision

AppFrame owns one local raster seascape mounted below every application column. The blank Hero composes live localized copy, the existing brand-mark slot, and a transparent mascot asset extracted from the supplied Oasisfish artwork. Active conversations, the expanded sidebar, toolbox entries, details, and settings use translucent theme-token surfaces over the same scene. The settings layer is portaled to `document.body`, keeping its fixed mask and panel independent of sidebar backdrop filters.

The mascot and sidebar scene use CSS transforms only. `prefers-reduced-motion` disables their continuous motion. The reference screenshot remains a design reference rather than a shipped full-page background, so controls, text, responsive layout, and theme tokens remain native UI.

## Alternatives considered

**Use the supplied screenshot as the application background.** Its embedded sidebar, controls, labels, and window chrome would duplicate live UI and fail at other viewport sizes.

**Give every page its own ocean illustration.** Separate assets would create visible transitions between blank, conversation, toolbox, and settings states and add redundant downloads.

**Keep the ocean treatment only on the blank Hero.** The product would lose its identity as soon as a task starts or settings opens.

## Consequences

- One locally bundled scene persists across application states with no network dependency.
- The blank Hero can change localized text and workspace controls independently of the artwork.
- Active content retains a dedicated reading surface while allowing the scene to remain visible.
- Settings remain full-viewport when a column applies transforms or backdrop filters.
- Future visual replacements update the public mascot or seascape asset without changing slot contracts.
