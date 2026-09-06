import { mkdir, readFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden, launchWebScaffold,
  seedSession, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/game-toolbox', import.meta.url))
const FIXTURE = join(SNAPSHOT_DIR, 'session.jsonl')
const UI_EXPECTED = join(SNAPSHOT_DIR, 'ui.expected.md')
const MODE = webSnapshotMode()
const SEED_ID = 'game-toolbox-web-e2e'

describe('web e2e: game-development toolbox', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    await mkdir(SNAPSHOT_DIR, { recursive: true })
    await seedSession(scaffold, await readFile(FIXTURE, 'utf8'), SEED_ID, 'game-ui')
    browser = await chromium.launch()
  }, 120_000)

  beforeEach(async () => {
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 60_000)

  afterEach(async () => {
    const failures: unknown[] = []
    try {
      expect(tripwire).toEqual({ warnings: [], pageErrors: [] })
    } catch (error) {
      failures.push(error)
    }
    await page?.close().catch((error: unknown) => failures.push(error))
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'game-toolbox case cleanup failed')
  })

  afterAll(async () => {
    const failures: unknown[] = []
    await browser?.close().catch((error: unknown) => failures.push(error))
    await scaffold?.close().catch((error: unknown) => failures.push(error))
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'game-toolbox teardown failed')
  })

  it('resumes the dedicated UI workflow and exposes its durable stages', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-game-toolbox'))
    await connectFreshWorkspace(page, dirname(scaffold.workspaceCwd), basename(scaffold.workspaceCwd))

    await page.getByRole('tab', { name: 'Toolbox', exact: true }).click()
    const uiTool = page.getByRole('button', { name: /UI Generation Toolchain/u })
    await uiTool.waitFor({ timeout: 10_000 })
    await expect.poll(() => uiTool.textContent(), { timeout: 10_000 }).toContain('Resume')
    const imageTool = page.getByRole('button', { name: /Image Generation/u })
    await imageTool.waitFor({ timeout: 10_000 })
    await expect.poll(() => imageTool.textContent(), { timeout: 10_000 }).toContain('Open')
    expect(await imageTool.isDisabled()).toBe(false)
    for (const name of ['Lua Development', 'Data Tables', 'Log Diagnostics']) {
      expect(await page.getByRole('button', { name: new RegExp(name, 'u') }).isDisabled()).toBe(true)
    }

    await uiTool.click()
    const progress = page.getByRole('button', { name: 'Open task details', exact: true })
    await progress.waitFor({ timeout: 15_000 })
    for (const stage of ['来源', '视觉', '分层', '工作台', 'UMG 需求', 'UMG 构建', '逻辑绑定', '最终验收']) {
      await progress.getByText(stage, { exact: true }).waitFor({ timeout: 5_000 })
    }

    const details = page.locator('[class*="detailsCol"]')
    await details.getByText('Current stage', { exact: true }).waitFor({ timeout: 10_000 })
    await details.getByText('视觉', { exact: true }).waitFor({ timeout: 10_000 })
    await details.getByText('视觉：等待视觉方案确认', { exact: true }).waitFor({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Close details', exact: true }).click()
    await expect.poll(() => page.locator('[class*="frame"]').getAttribute('data-details-collapsed'), {
      timeout: 5_000,
    }).toBe('true')
    await progress.click()
    await details.getByText('Current stage', { exact: true }).waitFor({ timeout: 5_000 })

    const snapshot = (await captureStableAria(page, '[class*="frame"]', scaffold.workspaceCwd))
      .split(SEED_ID).join('{{seededId}}')
    await compareOrRefreshGolden(UI_EXPECTED, snapshot, MODE)
    await assertFixtureInventory(SNAPSHOT_DIR, ['session.jsonl', 'ui.expected.md'])
  }, 90_000)
})
