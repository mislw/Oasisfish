// Web e2e scenario: the Models settings page end to end through the real
// wire — the add card offers the dormant pi-ai catalog, a blank key saves a
// reference-free profile for provider-native auth, and typing an API key later
// stores it write-only under the derived reference (`MINIMAX_CN_API_KEY`)
// while the settings document records only that reference. Each saved row
// appears after route topology invalidation without presenting liveness as
// provider status. The customized-settings fold writes its curated fields —
// the endpoint, and a declared route's own name and protocol — as merge
// patches against the stored profile. Zero model calls: configuration is pure
// settings/credentials/llm-domain traffic, so there is no fixture and a
// stray stream would fail loud because the adapter registry is empty. The provider under test is
// minimax-cn so a developer's real ANTHROPIC/OPENAI environment keys can
// never shadow the derived reference. The deletion dialog distinguishes a
// reference-free profile from a page-managed key before the credential and
// settings unsets reach the wire.
import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/models-settings', import.meta.url))
const EMPTY_EXPECTED = join(SNAPSHOT_DIR, 'empty.expected.md')
const CONFIGURED_EXPECTED = join(SNAPSHOT_DIR, 'configured.expected.md')
const DECLARED_EXPECTED = join(SNAPSHOT_DIR, 'declared.expected.md')
const DECLARED_EDIT_EXPECTED = join(SNAPSHOT_DIR, 'declared-edit.expected.md')
const MODEL_PICKER_EXPECTED = join(SNAPSHOT_DIR, 'model-picker.expected.md')
const NATIVE_DELETE_EXPECTED = join(SNAPSHOT_DIR, 'native-delete.expected.md')
const DELETE_EXPECTED = join(SNAPSHOT_DIR, 'delete.expected.md')
const MODE = webSnapshotMode()

function normalizeRelayPort(snapshot: string): string {
  return snapshot.replace(/127\.0\.0\.1:\d+/g, '127.0.0.1:{{relay-port}}')
}

describe('web e2e: Models settings page configures a dormant provider', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  let relay: Server
  let relayBaseUrl: string

  beforeAll(async () => {
    relay = createServer((request, response) => {
      const authorized = request.headers.authorization === 'Bearer sk-e2e-relay'
      if (!authorized) {
        response.writeHead(401, { 'content-type': 'application/json' })
        response.end('{"error":{"message":"unauthorized"}}')
        return
      }
      if (request.method === 'GET' && request.url?.endsWith('/models') === true) {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({
          data: [
            { id: 'acme-large', object: 'model' },
            { id: 'acme-small', object: 'model' },
          ],
        }))
        return
      }
      request.resume()
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.end([
          'data: {"choices":[{"delta":{"role":"assistant","content":"OK"}}]}',
          'data: {"choices":[{"delta":{"content":""},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1}}',
          'data: [DONE]',
          '',
        ].join('\n\n'))
      })
    })
    await new Promise<void>(resolve => relay.listen(0, '127.0.0.1', resolve))
    const address = relay.address()
    if (address === null || typeof address === 'string') throw new Error('relay fixture did not bind a TCP port')
    relayBaseUrl = `http://127.0.0.1:${String(address.port)}/v1`
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch()
    // The scenario asserts the shipped Chinese copy, so the browser asks for it.
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
    await new Promise<void>(resolve => relay?.close(() => { resolve() }))
  })

  it('opens the add card over the dormant directory vocabulary', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-empty'))
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByRole('button', { name: '模型与中转站' }).click()
    await dialog.getByText('配置模型提供方和中转站、测试连接，并选择新任务使用的默认模型。').waitFor({ timeout: 10_000 })
    // The dormant pi-ai adapter contributes its whole installed catalog; no
    // provider is configured yet, so the page is one add button.
    const add = dialog.getByRole('button', { name: '添加提供方' })
    await add.waitFor({ timeout: 10_000 })
    // The button enables once the dormant catalog lands in the join.
    await expect.poll(async () => add.isEnabled(), { timeout: 10_000 }).toBe(true)
    await add.click()
    const pick = dialog.getByLabel('提供方', { exact: true })
    await pick.waitFor({ timeout: 10_000 })
    await expect.poll(async () => pick.locator('option').count(), { timeout: 10_000 }).toBeGreaterThan(30)
    const options = await pick.locator('option').allTextContents()
    expect(options).toContain('anthropic')
    expect(options).toContain('minimax-cn')
    await pick.selectOption('minimax-cn')
    await dialog.getByRole('textbox', { name: 'API 密钥', exact: true }).waitFor({ timeout: 10_000 })
    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(EMPTY_EXPECTED, snapshot, MODE)
  }, 60_000)

  it('refuses a key no HTTP header can carry before anything is written', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-illegal-key'))
    const dialog = page.getByRole('dialog', { name: '设置' })
    const key = dialog.getByLabel('API 密钥')
    const save = dialog.getByRole('button', { name: '保存', exact: true })

    // A key no HTTP header can carry would save cleanly and fail the first
    // turn with a ByteString TypeError; the form names the offending field
    // instead.
    await key.fill('sk-\u{1F600}minimax')
    await dialog.getByText('该 API 密钥格式错误，请检查。').waitFor({ timeout: 10_000 })
    await expect.poll(async () => save.isEnabled(), { timeout: 10_000 }).toBe(false)

    // Clearing it restores submit: an empty field means "keep what is stored",
    // never a refusal, or editing any other setting would demand the key.
    await key.fill('')
    await expect.poll(async () => save.isEnabled(), { timeout: 10_000 }).toBe(true)
    expect(await dialog.getByText('该 API 密钥格式错误，请检查。').count()).toBe(0)
  }, 60_000)

  it('saves a blank key as a reference-free provider-native profile', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-native-auth'))
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    const row = dialog.locator('li').filter({ hasText: 'minimax-cn' }).first()
    await row.waitFor({ timeout: 10_000 })
    await dialog.getByText('已保存 minimax-cn。', { exact: true }).waitFor({ timeout: 10_000 })
    expect(await dialog.getByRole('img', { name: 'API 密钥已配置' }).count()).toBe(0)
    expect(await dialog.getByRole('img', { name: 'API 密钥缺失' }).count()).toBe(0)
    const document = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
    expect(document).toContain('minimax-cn: {}')
    expect(document).not.toContain('MINIMAX_CN_API_KEY')
  }, 60_000)

  it('describes reference-free deletion without claiming a credential exists', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-native-delete'))
    const settingsDialog = page.getByRole('dialog', { name: '设置' })
    await settingsDialog.getByRole('button', { name: '删除 minimax-cn', exact: true }).click()
    const deleteDialog = page.getByRole('dialog', { name: '删除 minimax-cn？' })
    await deleteDialog.waitFor({ timeout: 10_000 })
    const snapshot = await captureStableAria(
      page,
      '[role="dialog"][aria-label="删除 minimax-cn？"]',
      scaffold.workspaceCwd,
    )
    await compareOrRefreshGolden(NATIVE_DELETE_EXPECTED, snapshot, MODE)
    await deleteDialog.getByRole('button', { name: '取消', exact: true }).click()
  }, 60_000)

  it('stores the key under the derived reference and keeps the route live', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-add'))
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.getByRole('button', { name: '编辑 minimax-cn' }).click()
    await dialog.getByRole('textbox', { name: 'API 密钥', exact: true }).fill('sk-e2e-minimax')
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    // The profile lands in settings.yaml with only the derived reference, the
    // key value lands in the harness home's .credentials.yaml, the dormant route
    // registers, and the topology frame invalidates the page into the row.
    await expect.poll(
      async () => dialog.getByRole('textbox', { name: 'API 密钥', exact: true }).count(),
      { timeout: 10_000 },
    ).toBe(0)
    await dialog.getByRole('img', { name: 'API 密钥已配置' }).waitFor({ timeout: 10_000 })
    await dialog.getByText('已保存 minimax-cn。', { exact: true }).waitFor({ timeout: 10_000 })
    const document = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
    expect(document).toContain('minimax-cn:')
    expect(document).toContain('apiKeyEnv: MINIMAX_CN_API_KEY')
    expect(document).not.toContain('sk-e2e-minimax')
    const credentialFile = join(scaffold.harnessHome, '.credentials.yaml')
    await expect.poll(
      async () => readFile(credentialFile, 'utf8').catch(() => ''),
      { timeout: 10_000 },
    ).toContain('MINIMAX_CN_API_KEY: sk-e2e-minimax')
    expect(await page.content()).not.toContain('sk-e2e-minimax')
  }, 60_000)

  it('applies a customized-settings field as a merge patch', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-customized'))
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.getByRole('button', { name: '编辑 minimax-cn' }).click()
    await dialog.getByText('自定义设置').click()
    const url = dialog.getByLabel('API 地址')
    await url.waitFor({ timeout: 10_000 })
    await url.fill('https://gateway.minimax.example/v1')
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    // The editor closes back to the row; the fold's write merged into the
    // stored profile beside the reference.
    await expect.poll(async () => dialog.getByLabel('API 地址').count(), { timeout: 10_000 }).toBe(0)
    await dialog.getByText('已保存 minimax-cn。', { exact: true }).waitFor({ timeout: 10_000 })
    const document = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
    expect(document).toContain('baseURL: https://gateway.minimax.example/v1')
    expect(document).toContain('apiKeyEnv: MINIMAX_CN_API_KEY')
    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(CONFIGURED_EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('selects and clears the discovered model catalog in one action', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-picker'))
    const settingsDialog = page.getByRole('dialog', { name: '设置' })
    await settingsDialog.getByRole('button', { name: '编辑 minimax-cn' }).click()
    await settingsDialog.getByText('自定义设置').click()
    await settingsDialog.getByRole('button', { name: '从上游获取' }).click()

    const picker = page.getByRole('dialog', { name: '选择要添加的模型' })
    await picker.waitFor({ timeout: 10_000 })
    const boxes = picker.getByRole('checkbox')
    const count = await boxes.count()
    expect(count).toBeGreaterThan(0)
    expect(await boxes.evaluateAll(nodes => nodes.map(node => (node as HTMLInputElement).checked))).toEqual(
      Array.from({ length: count }, () => true),
    )

    await picker.getByRole('button', { name: '取消全选' }).click()
    expect(await boxes.evaluateAll(nodes => nodes.map(node => (node as HTMLInputElement).checked))).toEqual(
      Array.from({ length: count }, () => false),
    )
    await picker.getByRole('button', { name: '全选' }).waitFor()
    const snapshot = await captureStableAria(
      page,
      '[role="dialog"][aria-label="选择要添加的模型"]',
      scaffold.workspaceCwd,
    )
    await compareOrRefreshGolden(MODEL_PICKER_EXPECTED, snapshot, MODE)

    await picker.getByRole('button', { name: '全选' }).click()
    expect(await boxes.evaluateAll(nodes => nodes.map(node => (node as HTMLInputElement).checked))).toEqual(
      Array.from({ length: count }, () => true),
    )
    await picker.getByRole('button', { name: '取消', exact: true }).click()
    await settingsDialog.getByRole('button', { name: '取消', exact: true }).click()
  }, 60_000)

  it('declares and probes a relay the adapter does not ship', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-declare'))
    const dialog = page.getByRole('dialog', { name: '设置' })
    const declare = dialog.getByRole('button', { name: '添加自定义提供方' })
    await expect.poll(async () => declare.isEnabled(), { timeout: 10_000 }).toBe(true)
    await declare.click()
    await dialog.getByLabel('Provider ID').fill('acme-gateway')
    await dialog.getByLabel('显示名称').fill('Acme Gateway')
    await dialog.getByLabel('API 地址').fill(relayBaseUrl)
    await dialog.getByLabel('API 协议').selectOption('openai-completions')
    await dialog.getByRole('textbox', { name: 'API 密钥', exact: true }).fill('sk-e2e-rejected')
    // No reasoning effort on a provider card at all: effort is a per-model
    // capability, the models under one provider disagree about it, and a
    // switch in the composer already records provider+model+effort together.
    expect(await dialog.getByLabel('推理强度').count()).toBe(0)
    await dialog.getByRole('button', { name: '添加模型' }).click()
    await dialog.getByLabel('模型 ID 1').fill('probe-model')
    await dialog.getByRole('button', { name: '添加模型' }).click()
    await dialog.getByLabel('模型 ID 2').fill('gpt-image-2')
    expect(await dialog.getByLabel('测试模型').locator('option').allTextContents()).toEqual(['probe-model'])
    await dialog.getByText('纯生图 gpt-image 模型通过默认生图配置验证，不参与这里的文本连接测试。', {
      exact: true,
    }).waitFor()
    await dialog.getByRole('button', { name: '测试连接', exact: true }).click()
    const rejected = dialog.getByRole('status')
    await rejected.getByText('Provider rejected the credential.', { exact: true }).waitFor({ timeout: 10_000 })
    expect(await rejected.getByText(/鉴权$/).count()).toBe(1)
    expect(await rejected.textContent()).not.toContain('sk-e2e-rejected')
    expect(await dialog.textContent()).not.toContain('sk-e2e-rejected')

    await dialog.getByRole('textbox', { name: 'API 密钥', exact: true }).fill('sk-e2e-relay')
    await dialog.getByRole('button', { name: '从上游获取' }).click()
    const picker = page.getByRole('dialog', { name: '选择要添加的模型' })
    await picker.waitFor({ timeout: 10_000 })
    expect(await picker.getByText('acme-large', { exact: true }).count()).toBe(1)
    expect(await picker.getByText('acme-small', { exact: true }).count()).toBe(1)
    await picker.getByRole('button', { name: '添加所选' }).click()
    await dialog.getByLabel('测试模型').selectOption('acme-large')
    await dialog.getByRole('button', { name: '测试连接', exact: true }).click()
    await dialog.getByRole('status').getByText('连接成功', { exact: true }).waitFor({ timeout: 10_000 })
    expect(await dialog.textContent()).not.toContain('sk-e2e-relay')
    await dialog.getByRole('button', { name: '创建提供方', exact: true }).click()

    const row = dialog.locator('li').filter({ hasText: 'Acme Gateway' }).first()
    await row.waitFor({ timeout: 10_000 })
    const document = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
    expect(document).toContain('acme-gateway:')

    // The tag follows the adapter's installed catalog: this route is in no
    // catalog, while minimax-cn is — even though both now have profiles.
    const rowCard = (name: string) => dialog.locator('li').filter({ hasText: name }).first()
    await expect.poll(async () => rowCard('Acme Gateway').getByText('自定义').count(), { timeout: 10_000 }).toBe(1)
    expect(await rowCard('minimax-cn').getByText('自定义').count()).toBe(0)

    const snapshot = normalizeRelayPort(await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd))
    await compareOrRefreshGolden(DECLARED_EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('sets the relay as the default for new tasks and restores it after reload', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-default'))
    let dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.getByLabel('默认提供方', { exact: true }).selectOption('acme-gateway')
    await dialog.getByLabel('默认模型', { exact: true }).selectOption('acme-large')
    await dialog.getByRole('button', { name: '设为默认', exact: true }).click()
    await expect.poll(
      async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'),
      { timeout: 10_000 },
    ).toContain('agent-default-model:')
    const document = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
    expect(document).toContain('provider: acme-gateway')
    expect(document).toContain('model: acme-large')

    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await page.getByRole('button', { name: '设置', exact: true }).click()
    dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.getByRole('button', { name: '模型与中转站' }).click()
    await expect.poll(async () => dialog.getByLabel('默认提供方', { exact: true }).inputValue(), { timeout: 10_000 })
      .toBe('acme-gateway')
    expect(await dialog.getByLabel('默认模型', { exact: true }).inputValue()).toBe('acme-large')
    const blocked = dialog.getByRole('button', { name: '先切换默认模型再删除' })
    expect(await blocked.isDisabled()).toBe(true)
    expect(await blocked.getAttribute('title')).toBe('先切换默认模型再删除')
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('reopens the name and protocol a declared route was created with', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-declared-identity'))
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.getByRole('button', { name: '编辑 Acme Gateway (acme-gateway)' }).click()
    await dialog.getByText('自定义设置').click()
    // The create card asked this route for a name and a protocol because
    // nothing can default them; the editor reaches the same two fields rather
    // than sending the user to settings.yaml for what only this route names.
    const protocol = dialog.getByLabel('API 协议')
    await protocol.waitFor({ timeout: 10_000 })
    expect(await protocol.inputValue()).toBe('openai-completions')
    const name = dialog.getByLabel('显示名称', { exact: true })
    expect(await name.inputValue()).toBe('Acme Gateway')
    const snapshot = normalizeRelayPort(await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd))
    await compareOrRefreshGolden(DECLARED_EDIT_EXPECTED, snapshot, MODE)

    await protocol.selectOption('anthropic-messages')
    await name.fill('Acme 网关')
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    await expect.poll(async () => dialog.getByLabel('API 协议').count(), { timeout: 10_000 }).toBe(0)
    // The adapter re-resolved the route under the new protocol and re-registered
    // it under the new name: an unserviceable profile would have been refused
    // at the write instead, and a rename that did not re-register would leave
    // the old label on the row.
    await dialog.locator('li').filter({ hasText: 'Acme 网关' }).first().waitFor({ timeout: 10_000 })
    // The status line names the route as the refreshed directory reports it;
    // the target captured when the card opened still carries the old name.
    await dialog.getByText('已保存 Acme 网关 (acme-gateway)。', { exact: true }).waitFor({ timeout: 10_000 })
    const document = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
    expect(document).toContain('api: anthropic-messages')
    expect(document).toContain('displayName: Acme 网关')
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('confirms an identified provider deletion before removing its profile and key', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-delete'))
    const settingsDialog = page.getByRole('dialog', { name: '设置' })
    await settingsDialog.getByRole('button', { name: '删除 minimax-cn', exact: true }).click()
    const deleteDialog = page.getByRole('dialog', { name: '删除 minimax-cn？' })
    await deleteDialog.waitFor({ timeout: 10_000 })
    const snapshot = await captureStableAria(
      page,
      '[role="dialog"][aria-label="删除 minimax-cn？"]',
      scaffold.workspaceCwd,
    )
    await compareOrRefreshGolden(DELETE_EXPECTED, snapshot, MODE)

    await deleteDialog.getByRole('button', { name: '取消', exact: true }).click()
    expect(await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')).toContain('minimax-cn:')
    await settingsDialog.getByRole('button', { name: '删除 minimax-cn', exact: true }).click()
    await page.getByRole('dialog', { name: '删除 minimax-cn？' })
      .getByRole('button', { name: '删除 minimax-cn', exact: true }).click()
    await expect.poll(
      async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'),
      { timeout: 10_000 },
    ).not.toContain('minimax-cn:')
    expect(await readFile(join(scaffold.harnessHome, '.credentials.yaml'), 'utf8'))
      .not.toContain('MINIMAX_CN_API_KEY')
    await expect.poll(
      async () => page.getByRole('dialog', { name: '删除 minimax-cn？' }).count(),
      { timeout: 10_000 },
    ).toBe(0)
    await page.keyboard.press('Escape')
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, [
      'configured.expected.md', 'declared-edit.expected.md', 'declared.expected.md',
      'delete.expected.md', 'empty.expected.md', 'model-picker.expected.md',
      'native-delete.expected.md',
    ])
  })
})
