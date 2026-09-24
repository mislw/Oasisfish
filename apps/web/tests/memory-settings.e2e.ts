import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, type Browser } from 'playwright'
import { expect, it } from 'vitest'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import { ZH_BROWSER_LOCALE } from './support.ts'

it('adds durable memory through the shipped Web Settings composition', async () => {
  const scaffold = await launchWebScaffold({})
  let browser: Browser | undefined
  try {
    browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: ZH_BROWSER_LOCALE })
    const tripwire = watchConsole(page)
    const content = 'Use focused checks before handing off work.'
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.getByRole('button', { name: '记忆', exact: true }).click()
    await dialog.getByRole('heading', { name: '长期记忆', exact: true }).waitFor({ timeout: 10_000 })

    await dialog.getByRole('textbox', { name: '记忆内容' }).fill(content)
    await dialog.getByRole('button', { name: '添加', exact: true }).click()
    await dialog.getByText(content, { exact: true }).waitFor({ timeout: 10_000 })

    const storagePath = join(scaffold.workspaceCwd, '.dsh-storages', 'native_memory.json')
    await expect.poll(async () => {
      const stored = JSON.parse(await readFile(storagePath, 'utf8')) as {
        global?: { records?: Array<{ content?: string }> }
      }
      return stored.global?.records?.map(record => record.content)
    }, { timeout: 10_000 }).toContain(content)
    expect(tripwire.warnings).toEqual([])
    expect(tripwire.pageErrors).toEqual([])
  } finally {
    try { await browser?.close() } finally { await scaffold.close() }
  }
}, 120_000)
