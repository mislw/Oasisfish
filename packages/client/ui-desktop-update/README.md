# @deepseek-ai/dsh-client-ui-desktop-update

English | [中文](README.zh.md)

This package defines the JSON-compatible desktop update state and command bridge shared by the Oasisfish Electron preload and its Settings page. The protocol contains only application versions, update phases, bounded download counters, and user-safe messages; provider configuration, request metadata, filesystem paths, credentials, and raw errors are outside the renderer interface.

The browser plugin registers an **App Updates** Settings section only when `window.oasisfishUpdate` exists. Mounting the section reads the current state and subscribes to changes; checking, downloading, and installation require separate user clicks. Ordinary browser clients contribute no update UI.

The package's Host plugin has no behavior. Electron owns GitHub Release access, installer validation, installation, portable cleanup, and user-data preservation.

## Model Experience

None, as the plugin renders browser settings UI and its update state and commands do not enter model requests or session logs.

#### KV Cache effect

None. The package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- The update page supports the Windows desktop bridge only. It does not provide an updater for browser deployments or other operating systems.
