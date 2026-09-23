#!/usr/bin/env node

import { writeFile } from 'node:fs/promises'
import { boot, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { ToolCallId } from '@deepseek-ai/dsh-llm'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('tool-skill-search driver requires a config path')

const ctx = await boot('tool-skill-search-loader-smoke', resolveConfigPath(configPath, undefined))
try {
  const schema = ctx.tools.schemas().find(tool => tool.name === 'skill_search')
  if (schema === undefined) throw new Error('skill_search tool not registered by the composition')
  const result = await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId('loader-skill-search'),
    name: 'skill_search',
    arguments: { name: 'fixture-skill', query: 'respawn checkpoint', limit: 1 },
  })
  if (result.isError) throw new Error('skill_search loader execution failed')
  const resultText = result.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
  await writeFile('./skill-search-loader-report.json', JSON.stringify({
    description: schema.description,
    resultText,
    leakedAbsolutePath: JSON.stringify(result).includes(process.cwd()),
  }))
} finally {
  await ctx.fiber.dispose()
}
