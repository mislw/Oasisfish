# @deepseek-ai/dsh-client-ui-desktop-update

English | [中文](README.zh.md)

This package defines the JSON-compatible desktop update state and command bridge shared by the Oasisfish Electron preload and its browser presentation. The protocol contains only application versions, update phases, bounded download counters, and user-safe messages; provider configuration, request metadata, filesystem paths, credentials, and raw errors are outside the renderer interface.

The package's Host plugin has no behavior. Electron owns update checks, downloads, installation, and user-data preservation.

## Model Experience

None. Desktop update state and commands do not enter model requests or session logs.

#### KV Cache effect

None. The package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- The protocol describes Windows desktop updates only; ordinary browser clients have no update bridge.
