import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

// Opt-in: real network check. Default tests use local responses.
const profile = await mkdtemp(join(tmpdir(), 'moeloader-online-'))
await writeFile(join(profile, 'downloads.json'), JSON.stringify({ directory: join(profile, 'images'), concurrency: 3, fileTemplate: '%site %id %title', folderTemplate: '%site', autoRename: false, tagCount: 0, firstOnly: false, firstCount: 1 }))
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
let app
try {
  app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env })
  await app.evaluate(({ session }) => { globalThis.onlineRequests = []; session.defaultSession.webRequest.onBeforeRequest((details, callback) => { if (details.url.startsWith('https://konachan.net/post.json')) globalThis.onlineRequests.push(details.url); callback({}) }) })
  const page = await app.firstWindow(); await page.waitForLoadState('load')
  await page.locator('#keyword').fill('landscape'); await page.locator('#count').fill('10'); await page.locator('#count').press('Tab'); await page.locator('#search').click()
  await page.waitForFunction(() => document.querySelector('#search span').textContent === '获取', {}, { timeout: 45000 })
  assert.equal(await page.locator('.picture').count(), 10, await page.locator('#status').textContent())
  await page.locator('.picture.loaded').nth(9).waitFor({ timeout: 45000 })
  await page.screenshot({ path: 'artifacts/browser-online.png', animations: 'disabled' })
  const opened = app.waitForEvent('window')
  await page.locator('.picture').first().hover(); await page.locator('.picture').first().getByTitle('预览图').click()
  const preview = await opened
  await preview.waitForFunction(() => document.querySelector('#large-image')?.naturalWidth > 0 && document.querySelector('#preview-loading').hidden, {}, { timeout: 45000 })
  await preview.screenshot({ path: 'artifacts/browser-online-preview.png', animations: 'disabled' })
  await preview.close()
  await page.locator('.picture').first().hover(); await page.locator('.picture').first().getByTitle('下载', { exact: true }).click()
  await page.waitForFunction(() => ['success', 'failed', 'skip'].includes(document.querySelector('.download-row')?.dataset.status), {}, { timeout: 90000 })
  const task = (await page.evaluate(() => window.moe.downloads())).tasks[0]
  assert.equal(task.status, 'success', task.text)
  const savedFile = await stat(task.path)
  assert.equal(savedFile.size, task.loaded); assert.ok(savedFile.size > 0)
  const bytes = await readFile(task.path)
  assert.ok(bytes.subarray(0, 2).equals(Buffer.from([0xff, 0xd8])) || bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.subarray(0,3).toString() === 'GIF' || bytes.subarray(8,12).toString() === 'WEBP', '下载文件必须为真实图片')
  await page.screenshot({ path: 'artifacts/download-online.png', animations: 'disabled' })
  const result = { downloadedBytes: savedFile.size, download: true, site: 'Konachan-G', keyword: 'landscape', items: 10, loaded: 10, preview: true, time: new Date().toISOString() }
  await writeFile('artifacts/online-result.json', JSON.stringify(result, null, 2)); console.log(result)
} catch (error) {
  if (app) console.error('在线搜索请求：', await app.evaluate(() => globalThis.onlineRequests).catch(() => []))
  throw error
} finally {
  if (app) { await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }) }).catch(() => {}); await app.close() }
  assert.equal(dirname(resolve(profile)), resolve(tmpdir()))
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}
