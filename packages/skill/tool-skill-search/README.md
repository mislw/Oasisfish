# @deepseek-ai/dsh-tool-skill-search

English | [中文](README.zh.md)

Model-facing `skill_search` Consumer over `ctx.skillSearch`.

## Tool: `skill_search`

The tool accepts an exact Skill `name`, a non-empty natural-language or symbol `query`, and an optional `limit` from 1 through 10. The default is 5. It resolves the calling agent's working directory and scope, preserves `SkillSearchError` codes in diagnostics, and returns the Skill, query, result count, ranks, scores, relative paths, heading trails, one-based line ranges, and source excerpts.

The model-facing text formats every citation as `path:start-end`. An empty successful result recommends a narrower or synonymous query. The pending UI intent is a generic search call; completed results use replayable search metadata grouped by relative file and line.

## Model Experience

### Tool schema

#### What the model sees

The model sees the generated [`skill_search` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-skill-search). Its description tells the model to load the Skill first, search its declared corpus for factual or API questions, and cite returned relative paths and line ranges.

#### Token effect

Fixed schema cost per request where the scoped tool is visible.

#### KV Cache effect

The stable schema preserves reuse while the tool definition and description remain unchanged. Scoped visibility changes the request tool list and can invalidate reuse at that request.

### Tool result

#### What the model sees

Each successful call returns data-dependent relative citations and excerpts, or the stable empty-result guidance. Structured failures include the `SkillSearchError` code and diagnostic.

#### Token effect

Append-only result cost scales with the selected result count and excerpt lengths.

#### KV Cache effect

Each durable `tool/result` appends a new suffix without replacing earlier reusable tokens. A different query, limit, source revision, or ranking changes that appended suffix.

## Known Limitations and Deferred Work

- The tool searches one declared Skill corpus per call and does not aggregate several Skills.
- It does not inject search results automatically or trigger background indexing.
- Relative citations depend on the selected provider preserving source paths and line ranges.
