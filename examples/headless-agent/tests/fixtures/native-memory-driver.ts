#!/usr/bin/env node
/** Snapshot-only Loader driver for two turns in one Session. */

import type { Context } from '@deepseek-ai/cordis'
import { boot, installFailLoud, loadEnv, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { runFixtureTurn } from '@deepseek-ai/dsh-loader-smoke'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

const NAME = 'native-memory-test-driver'
const [configPath] = process.argv.slice(2)
if (configPath === undefined) throw new Error(`${NAME}: expected <config-path>`)

const uninstallFailLoud = installFailLoud(NAME)
let ctx: Context | undefined
try {
  loadEnv(NAME)
  ctx = await boot(NAME, resolveConfigPath(configPath, undefined))
  const emit = (sessionId: string, event: SessionEvent): void => {
    process.stdout.write(`${JSON.stringify({ type: 'session_event', sessionId, event })}\n`)
  }
  const first = await runFixtureTurn(ctx, { task: 'Remember the package manager.', onEvent: emit })
  process.stdout.write(`${JSON.stringify({ type: 'turn_result', turn: 1, result: first })}\n`)
  const second = await runFixtureTurn(ctx, { task: 'Which package manager should this project use?', onEvent: emit })
  process.stdout.write(`${JSON.stringify({ type: 'turn_result', turn: 2, result: second })}\n`)
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
} finally {
  await ctx?.fiber.dispose()
  uninstallFailLoud()
}
