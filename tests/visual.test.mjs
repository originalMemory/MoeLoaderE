import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

test('WPF 视觉基线：布局、材质、主题和自绘控件', { timeout: 30000 }, async t => {
  const profile = await mkdtemp(join(tmpdir(), 'moeloader-visual-'))
  const expected = JSON.parse(await readFile('tests/fixtures/wpf-layout.json', 'utf8'))
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
  let app
  t.after(async () => { if (app) await app.close(); assert.equal(dirname(resolve(profile)), resolve(tmpdir())); await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) })
  app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env })
  const page = await app.firstWindow(); await page.waitForLoadState('load')
  await page.waitForFunction(() => document.documentElement.dataset.nativeBlur !== undefined)
  const material = await page.evaluate(() => window.moe.appearance())
  if (process.platform === 'win32') assert.equal(material.nativeBlur, true, 'Windows 原生材质调用失败')
  const restored = await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0], before = win.getBounds()
    win.maximize(); await new Promise(resolve => setTimeout(resolve, 150))
    const maximized = win.isMaximized(); win.unmaximize(); await new Promise(resolve => setTimeout(resolve, 150))
    return { maximized, before, after: win.getBounds() }
  })
  assert.equal(restored.maximized, true)
  assert.deepEqual(restored.before, restored.after)
  await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'light' })
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  const geometry = await page.evaluate(() => {
    const root = document.querySelector('#browser').getBoundingClientRect(), result = { client: { width: root.width, height: root.height } }
    for (const id of ['header', 'workspace', 'footer', 'search-form', 'logo']) {
      const r = document.querySelector(id === 'header' || id === 'footer' ? id : `#${id}`).getBoundingClientRect()
      result[id] = { x: r.x - root.x, y: r.y - root.y, width: r.width, height: r.height }
    }
    return result
  })
  for (const name of ['client', 'header', 'workspace', 'footer', 'search-form', 'logo']) for (const [key, value] of Object.entries(expected[name])) assert.ok(Math.abs(geometry[name][key] - value) <= 1, `${name}.${key}: ${geometry[name][key]} != ${value}`)
  assert.match(await page.evaluate(() => getComputedStyle(document.documentElement).fontFamily), /Microsoft YaHei UI/)
  await page.screenshot({ path: 'artifacts/visual-light.png', animations: 'disabled' })
  await page.locator('#browse-controls').evaluate(el => { el.hidden = false })
  for (const height of [760, 400]) {
    await app.evaluate(({ BrowserWindow }, height) => BrowserWindow.getAllWindows()[0].setSize(1060, height), height)
    await page.waitForFunction(height => innerHeight === height, height)
    for (const name of ['预览图', '自动', '原图']) {
      await page.locator('#quality-toggle').click()
      const list = page.locator('[data-select="quality"] .select-options')
      const r = await list.boundingBox()
      assert.ok(r.y >= 0 && r.y + r.height <= height, `下拉菜单超出窗口: ${JSON.stringify(r)}`)
      await list.getByRole('option', { name, exact: true }).click()
      assert.equal(await page.locator('#quality').inputValue(), name)
    }
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1060, 760))
  await page.waitForFunction(() => innerHeight === 760)
  await page.locator('#browse-controls').evaluate(el => { el.hidden = true })
  await page.getByRole('combobox', { name: '站点', exact: true }).click()
  await page.getByRole('option', { name: 'Konachan-G' }).waitFor({ state: 'visible' })
  await page.screenshot({ path: 'artifacts/visual-dropdown.png', animations: 'disabled' }); await page.keyboard.press('Escape')
  await page.locator('#keyword').focus(); await page.locator('#search-popup').waitFor({ state: 'visible' })
  await page.getByRole('button', { name: '增加每页最少数量' }).click()
  assert.equal(await page.locator('#count').inputValue(), '61')
  await page.getByRole('button', { name: '减少每页最少数量' }).click()
  await page.screenshot({ path: 'artifacts/visual-parameters.png', animations: 'disabled' })
  await page.getByRole('combobox', { name: '图片方向', exact: true }).press('ArrowDown')
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter')
  assert.equal(await page.locator('#orientation').inputValue(), '1')
  await page.keyboard.press('Escape')
  await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'dark' })
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  await page.screenshot({ path: 'artifacts/visual-dark.png', animations: 'disabled' })
  await app.evaluate(({ BrowserWindow }) => { const probe = new BrowserWindow({ width: 100, height: 100, x: 0, y: 0, show: true, title: 'Focus test' }); probe.focus() })
  await page.waitForFunction(() => document.documentElement.dataset.active === 'false')
  assert.equal(await page.evaluate(() => getComputedStyle(document.body, '::before').backgroundColor), 'rgb(31, 31, 31)')
  await page.screenshot({ path: 'artifacts/visual-inactive-dark.png', animations: 'disabled' })
  await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'light' })
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  await page.screenshot({ path: 'artifacts/visual-inactive.png', animations: 'disabled' })
  await writeFile('artifacts/visual-metrics.json', JSON.stringify({ geometry, material }, null, 2))
})
