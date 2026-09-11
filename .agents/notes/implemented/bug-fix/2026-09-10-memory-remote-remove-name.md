# Agent Note: Memory Remote removal name

Status: implemented

English | [中文](2026-09-10-memory-remote-remove-name.zh.md)

## Problem

The Client Remote gateway exposes each generated namespace as a Cordis service. A generated method named `remove` conflicts with the inherited service lifecycle method, so mounting the complete browser Remote assembly fails and prevents the Web client from starting.

## Decision

The memory Host Remote exports record deletion as `memory/removeRecord`. The provider-neutral `MemoryService.remove()`, provider operation, Settings controller method, and user-visible deletion action keep their domain names; only the generated browser transport method avoids the Cordis service lifecycle namespace.

The Client Remote assembly test mounts every selected generated contribution on the real gateway and asserts that `remote.memory.removeRecord` is available. This catches method collisions before a desktop or browser build is packaged.

## Alternatives considered

**Rename the memory capability operation everywhere.** The conflict exists only on the generated Client namespace service. Renaming provider and Settings APIs would spread transport-specific framework constraints into domain APIs.

**Allow generated methods to replace service prototype members.** Replacing Cordis lifecycle methods would make namespace disposal ambiguous and could break every generated Remote service that used the same name.

## Consequences

- The browser wire method is `memory/removeRecord`; internal memory deletion remains `remove`.
- The real Client assembly fails in tests if any selected Remote method collides with its namespace service.
- Remote method names must avoid inherited Cordis service members.
