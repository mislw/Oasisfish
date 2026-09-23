---
description: "The skill group map: reusable agent instructions discovered from providers and loaded through the session catalog and skill tool, for users and maintainers navigating the group."
kind: "package-group"
---

# skill/ — skill capability family

English | [中文](README.zh.md)

## Summary

The skill family lets agents and users discover, load, and search reusable task instructions only when needed. Use `skill/` to combine catalogs; choose filesystem or packaged providers for instruction bodies, then add `tool-skill` for model loading. For references too large to keep in a Skill body, `skill-search` declares provider-neutral corpora, `skill-search-local` indexes directory resources locally, and `tool-skill-search` exposes cited retrieval. Discovery and retrieval remain separate capabilities, so deployments can enable either or both.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`skill/`](skill/README.md) | Registry that merges skill catalogs from any provider and resolves the winning skill for a name | `ctx.skills` |
| [`skill-filesystem/`](skill-filesystem/README.md) | Discovers skills from project, custom, and user directories and watches them for changes | registers on `ctx.skills` |
| [`skill-badge/`](skill-badge/README.md) | Bundles the official "powered by dsh" badge skill, disabled by default | registers on `ctx.skills` |
| [`skill-office/`](skill-office/README.md) | Bundles Word, PowerPoint, and Excel workflows with structural file checks | registers on `ctx.skills` |
| [`tool-skill/`](tool-skill/README.md) | Publishes the session skill catalog and the model-facing `skill` loader tool | registers on `ctx.tools` |
| [`skill-search/`](skill-search/README.md) | Declares searchable Skill corpora and routes scoped searches to provider-neutral backends | `ctx.skillSearch` |
| [`skill-search-local/`](skill-search-local/README.md) | Indexes declared directory resources with local SQLite, lexical search, and embeddings | registers on `ctx.skillSearch` |
| [`tool-skill-search/`](tool-skill-search/README.md) | Publishes the model-facing `skill_search` tool and cited search results | registers on `ctx.tools` |

-----

<a id="related-documentation"></a>
## Related documentation

Start with the subsystem reference for the shared vocabulary, then read the Agent Notes for the design rationale.

- [Skill subsystem reference](../../docs/subsystems/skills.md) — the registry, provider contract, local discovery priority, and the catalog and tool.
- [Skill invocation policy Agent Note](../../.agents/notes/implemented/feature/2026-07-28-skill-invocation-policy.md) — the model and user invocation controls.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
