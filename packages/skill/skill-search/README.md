# @deepseek-ai/dsh-skill-search

English | [中文](README.zh.md)

Provider-neutral registry for searching explicitly declared Skill corpora.

This package owns `ctx.skillSearch`. It resolves the winning Skill through `ctx.skills`, enforces model invocation policy, matches an explicit corpus declaration, and delegates the search to a scoped provider. It does not read files, create embeddings, persist an index, or register a model-facing tool.

## Service: `SkillSearchRegistry` (ctx key: `skillSearch`)

`ctx.skillSearch.registerProvider(create)` registers a provider in the calling context's scope layer. The synchronous factory receives a registration-owned abort signal. Provider names are unique within one layer; the returned Cordis disposer unregisters the provider and aborts that signal.

`ctx.skillSearch.search(request, options)` resolves the Skill with the caller's `cwd`, `scope`, and `signal`, rechecks `modelInvocable` on the loaded definition, resolves the matching configured corpus, and selects the first visible provider whose `supports(corpus)` returns true. The result contains relative source paths, heading trails, one-based line ranges, excerpts, and scores.

## Config

`corpora` is an array of explicit declarations. Each declaration names one Skill, optional winning Skill provider, relative resource roots, accepted extensions, per-file and total byte ceilings, and a chunk ceiling. A deployment must declare every searchable corpus; the service never scans a Skill implicitly.

## Errors

`SkillSearchError.code` distinguishes unknown or non-model-invocable Skills, missing declarations, unsupported resources, corpus limits, unreadable sources, unavailable models, and cancellation. Providers preserve those categories rather than converting every failure to an empty result.

## Model Experience

Indirectly, through a tool Consumer such as `@deepseek-ai/dsh-tool-skill-search`. This service produces no prompt text or tool result by itself.

#### KV Cache effect

No direct effect. A Consumer decides how retrieved passages enter the durable transcript.

## Known Limitations and Deferred Work

- **Corpus declarations are deployment-owned** - Skill frontmatter cannot opt itself into indexing in this release.
- **Provider diagnostics are operation-scoped** - the registry exposes no provider inventory or background corpus status API.
- **Provider selection is first-supporting-provider** - one scope cannot aggregate results from several providers for the same corpus.
