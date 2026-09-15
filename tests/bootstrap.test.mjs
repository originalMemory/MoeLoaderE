import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { _electron as electron } from 'playwright'
import electronPath from 'electron'

test('本地构建：页面、隔离、导航限制与窗口生命周期', { timeout: 30_000 }, async (t) => {
  const profile = await mkdtemp(join(tmpdir(), 'moeloader-e-test-'))
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  let app
  let closed = false
  t.after(async () => {
    if (app && !closed) await app.close()
    assert.equal(dirname(resolve(profile)), resolve(tmpdir()))
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  })
  app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env })
  app.on('close', () => { closed = true })

  const page = await app.firstWindow()
  await page.waitForLoadState('load')
  assert.equal(await page.title(), 'MoeLoaderE')
  assert.equal(await page.locator('#mode').textContent(), '本地构建')
  assert.equal(await page.locator('h2').textContent(), '应用基础已就绪')
  assert.ok(page.url().startsWith('file:'))
  assert.deepEqual(await page.evaluate(() => [typeof window.require, typeof window.process]), ['undefined', 'undefined'])

  const preferences = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences())
  assert.equal(preferences.nodeIntegration, false)
  assert.equal(preferences.contextIsolation, true)
  assert.equal(preferences.sandbox, true)
  assert.equal(preferences.webSecurity, true)

  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  assert.ok(csp.includes("connect-src 'none'"))
  assert.equal(await page.evaluate(() => {
    const script = document.createElement('script')
    script.textContent = 'window.inlineScriptExecuted = true'
    document.body.append(script)
    return window.inlineScriptExecuted === true
  }), false)

  const url = page.url()
  const navigationBlocked = app.evaluate(({ BrowserWindow }) => new Promise((resolve) => {
    BrowserWindow.getAllWindows()[0].webContents.once('will-navigate', (event) => resolve(event.defaultPrevented))
  }))
  await page.evaluate(() => { window.location.href = 'https://example.invalid/' })
  assert.equal(await navigationBlocked, true)
  assert.equal(page.url(), url)
  assert.equal(await page.evaluate(() => window.open('https://example.invalid/') === null), true)

  await app.evaluate(({ app }) => { app.emit('activate') })
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1)
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/bootstrap.png' })

  if (process.platform === 'darwin') {
    await page.close()
    const reopened = app.waitForEvent('window')
    await app.evaluate(({ app }) => { app.emit('activate') })
    const nextPage = await reopened
    await nextPage.waitForLoadState('load')
    assert.equal(await nextPage.title(), 'MoeLoaderE')
    await app.close()
  } else {
    const exited = app.waitForEvent('close')
    await page.close()
    await exited
  }
  assert.equal(closed, true)
})

test('启动加载失败返回退出码 1', async (t) => {
  const profile = await mkdtemp(join(tmpdir(), 'moeloader-e-failure-'))
  t.after(async () => {
    assert.equal(dirname(resolve(profile)), resolve(tmpdir()))
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  })
  const entry = join(profile, 'failure.cjs')
  // 只替换阻塞的错误弹窗，加载和退出仍执行真实主进程代码。
  await writeFile(entry, `
    const { app, dialog } = require('electron');
    app.setPath('userData', ${JSON.stringify(profile)});
    dialog.showErrorBox = (title, message) => require('node:fs').writeSync(1, title + ': ' + message);
    require(${JSON.stringify(resolve('out/main/index.js'))});
  `)
  const env = { ...process.env, ELECTRON_RENDERER_URL: 'http://127.0.0.1:1/' }
  delete env.ELECTRON_RUN_AS_NODE
  const result = spawnSync(electronPath, [entry], {
    env, encoding: 'utf8', timeout: 15_000, windowsHide: true
  })
  assert.ifError(result.error)
  assert.match(result.stdout, /MoeLoaderE 启动失败.*ERR_UNSAFE_PORT/)
  assert.equal(result.status, 1, result.stderr)
})
