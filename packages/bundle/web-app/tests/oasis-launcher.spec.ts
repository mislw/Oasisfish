import { fileURLToPath } from 'node:url'
import { composeEntries, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { expect, it } from 'vitest'

const base = loadOverlayPatches('oasis-launcher-test', fileURLToPath(new URL('../../base/cordis.patch.yml', import.meta.url)))
const web = loadOverlayPatches('oasis-launcher-test', fileURLToPath(new URL('../cordis.patch.yml', import.meta.url)))

it('leaves the Oasis composer launcher disabled by default but available for opt-in', () => {
  const defaultRow = composeEntries([base, web]).find(row => row.id === 'ui-oasis-workflow')
  expect(defaultRow).toMatchObject({
    name: '@deepseek-ai/dsh-client-ui-oasis-workflow',
    disabled: true,
  })

  const enabledRow = composeEntries([base, web, [{ id: 'ui-oasis-workflow', disabled: false }]])
    .find(row => row.id === 'ui-oasis-workflow')
  expect(enabledRow).toMatchObject({
    name: '@deepseek-ai/dsh-client-ui-oasis-workflow',
    disabled: false,
  })
})
