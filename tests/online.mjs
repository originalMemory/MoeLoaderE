import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

// Opt-in: real network check. Default tests use local responses.
const profile = await mkdtemp(join(tmpdir(), 'moeloader-online-'))
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
let app
try {
  app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env })
  const page = await app.firstWindow(); await page.waitForLoadState('load')
  await page.locator('#keyword').fill('landscape'); await page.locator('#count').fill('10'); await page.locator('#search').click()
  await page.waitForFunction(() => document.querySelector('#search span').textContent === '获取', {}, { timeout: 45000 })
  assert.equal(await page.locator('.picture').count(), 10, await page.locator('#status').textContent())
  await page.locator('.picture.loaded').nth(9).waitFor({ timeout: 45000 })
  await page.screenshot({ path: 'artifacts/browser-online.png', animations: 'disabled' })
  const opened = app.waitForEvent('window')
  await page.locator('.picture').first().hover(); await page.locator('.picture').first().getByTitle('预览图').click()
  const preview = await opened
  await preview.waitForFunction(() => document.querySelector('#large-image')?.naturalWidth > 0 && document.querySelector('#preview-loading').hidden, {}, { timeout: 45000 })
  await preview.screenshot({ path: 'artifacts/browser-online-preview.png', animations: 'disabled' })
  const result = { site: 'Konachan-G', keyword: 'landscape', items: 10, loaded: 10, preview: true, time: new Date().toISOString() }
  await writeFile('artifacts/online-result.json', JSON.stringify(result, null, 2)); console.log(result)
} finally {
  if (app) await app.close()
  assert.equal(dirname(resolve(profile)), resolve(tmpdir()))
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}
