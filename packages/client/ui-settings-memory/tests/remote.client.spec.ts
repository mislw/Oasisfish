// @vitest-environment jsdom
import { expect } from 'vitest'
import { ok } from '@deepseek-ai/dsh-remote-mock'
import { createClientTest, webApp } from '@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts'
import { MemoryId, type MemoryRecord } from '@deepseek-ai/dsh-memory'

const SELF = '@deepseek-ai/dsh-client-ui-settings-memory'
const SETTINGS_SHELL = '@deepseek-ai/dsh-client-ui-settings-general'
const test = createClientTest({ roster: webApp.closure([SELF, SETTINGS_SHELL]) })
const id = MemoryId('memory-remote-1')
const record: MemoryRecord = {
  id,
  scope: 'project',
  projectKey: 'project-key',
  projectLabel: 'project',
  content: 'Use focused tests.',
  createdAt: 1,
  updatedAt: 1,
}

test('removes a record through the assembled generated Remote and accepts an idempotent result', async ({ remote, start }) => {
  remote.memory.list.mockResolvedValueOnce(ok({ enabled: true, records: [record] }))
  remote.memory.removeRecord.mockResolvedValueOnce(ok({ id, absent: true }))
  const client = await start()
  const entry = client.ctx.slots.entries('settings.section')
    .find(candidate => candidate.options.id === 'memory')
  expect(entry).toBeDefined()
  const injected = (entry?.inject as (() => {
    load(cwd: string | undefined): Promise<void>
    remove(id: typeof record.id, cwd: string | undefined): Promise<boolean>
  }) | undefined)?.()
  expect(injected).toBeDefined()

  await injected?.load('/work/project')
  await expect(injected?.remove(id, '/work/project')).resolves.toBe(true)
  expect(remote.memory.removeRecord).toHaveBeenCalledExactlyOnceWith({ id, cwd: '/work/project' })
})
