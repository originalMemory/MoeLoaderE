import { app, BrowserWindow, clipboard, dialog, ipcMain, net, protocol, shell } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { home, validateSearch, Viewed, visualPage } from '../shared/booru'
import type { BrowserState, Picture, SearchInput, VisualPage } from '../shared/types'
import { appearance, setAcrylicEnabled } from './appearance'
import { DownloadQueue, downloadDefaults, validateDownloadSettings } from './downloads'
import { exportBundle, importSources, parseBundle } from './download-bundle'
import type { DownloadAction, DownloadSource } from '../shared/types'
import { randomUUID } from 'node:crypto'
import { unlinkSync } from 'node:fs'

export function isSiteUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && ['konachan.net', 'konachan.com', 'www.konachan.net', 'www.konachan.com'].includes(u.hostname)
  } catch { return false }
}

async function siteResponse(url: string, signal: AbortSignal, referer = home, retry = true): Promise<Response> {
  for (let hop = 0; hop < 5; hop++) {
    if (!isSiteUrl(url)) throw new Error('站点资源地址不受支持')
    const request = () => net.fetch(url, { signal, redirect: 'manual', headers: { Referer: referer } })
    let response: Response
    try { response = await request() } catch (error) { signal.throwIfAborted(); if (!retry) throw error; response = await request() }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) throw new Error('站点重定向地址缺失')
      url = new URL(location, url).href
      continue
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`站点请求失败 (${response.status})`) }
    return response
  }
  throw new Error('站点重定向次数过多')
}

async function limitedBody(response: Response, limit: number, progress?: (loaded: number, total: number) => void): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('响应过大') }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('响应为空')
  let size = 0
  const parts: Uint8Array[] = []
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new Error('响应过大')
      parts.push(value)
      progress?.(size, Number(response.headers.get('content-length')) || 0)
    }
  } finally { await reader.cancel() }
  return Buffer.concat(parts, size)
}

export function installBrowser(main: () => BrowserWindow | undefined, createPreview: (key: string) => BrowserWindow): BrowserState {
  const settingsPath = join(app.getPath('userData'), 'browser.json')
  const saved = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) : {}
  const state: BrowserState = { count: 60, size: 192, history: [], acrylicEnabled: typeof saved.acrylicEnabled === 'boolean' ? saved.acrylicEnabled : true }
  setAcrylicEnabled(state.acrylicEnabled)
  if (saved.bounds && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(saved.bounds[key])) && saved.bounds.width >= 700 && saved.bounds.height >= 400) state.bounds = saved.bounds
  if (Number.isInteger(saved.count) && saved.count >= 10 && saved.count <= 500) state.count = saved.count
  if (Number.isFinite(saved.size) && saved.size >= 72 && saved.size <= 512) state.size = saved.size
  if (Array.isArray(saved.history)) state.history = saved.history.filter((v: unknown) => typeof v === 'string' && v.length <= 1000).slice(0, 26)
  const viewed = new Viewed(typeof saved.viewed === 'string' ? saved.viewed : '')
  const items = new Map<string, Picture>()
  const previews = new Map<number, Picture>()
  let input: SearchInput | undefined, searchAbort: AbortController | undefined, hintAbort: AbortController | undefined
  let nextPage = 1, pageIndex = 0, offset = 0, complete = false, generation = 0
  const downloadPath = join(app.getPath('userData'), 'downloads.json')
  const initial = downloadDefaults(join(app.getPath('pictures'), 'MoeLoaderE'))
  const stored = existsSync(downloadPath) ? JSON.parse(readFileSync(downloadPath, 'utf8')) : undefined
  const queue = new DownloadQueue(stored ? validateDownloadSettings(stored, typeof stored.directory === 'string' && stored.directory ? stored.directory : initial.directory) : initial, (url, signal, referer) => siteResponse(url, signal, referer, false),
    () => { const window = main(); if (window && !window.isDestroyed()) window.webContents.send('moe:downloads-changed', { tasks: queue.tasks, settings: queue.settings }) })
  const saveDownloads = (): void => {
    writeFileSync(`${downloadPath}.tmp`, JSON.stringify(queue.settings)); renameSync(`${downloadPath}.tmp`, downloadPath)
  }
  const exportTasks = async (): Promise<boolean> => {
    if (!queue.unfinished().length) return true
    const result = await dialog.showSaveDialog(main()!, { title: '导出未成功任务', defaultPath: 'unfinished-tasks.mlpub', filters: [{ name: 'MoeLoaderP 未完成任务包', extensions: ['mlpub'] }] })
    if (result.canceled || !result.filePath) return false
    const path = result.filePath, temp = `${path}.${randomUUID()}.tmp`
    try {
      const bundle = exportBundle(queue.tasks, existsSync(path) ? parseBundle(readFileSync(path, 'utf8')) : undefined)
      writeFileSync(temp, JSON.stringify(bundle), { flag: 'wx' }); renameSync(temp, path); return true
    } finally { if (existsSync(temp)) unlinkSync(temp) }
  }
  let closeConfirmed = false, closePending = false
  const confirmClose = async (quit: boolean): Promise<void> => {
    if (closePending) return
    closePending = true
    try {
      const { response } = await dialog.showMessageBox(main()!, { type: 'question', title: '未完成的下载任务', message: '下载队列中仍有未完成的任务（含排队、下载中、失败或停止）。', buttons: ['导出后关闭', '直接关闭', '取消'], defaultId: 2, cancelId: 2, noLink: true })
      if (response === 2 || (response === 0 && !await exportTasks())) return
      await queue.stopAll(); closeConfirmed = true
      if (quit) app.quit(); else main()?.close()
    } catch (error) { dialog.showErrorBox('导出失败', String(error)) }
    finally { closePending = false }
  }
  app.on('browser-window-created', (_event, window) => {
    if (window.getParentWindow()) return
    closeConfirmed = false
    window.on('close', event => {
      if (window !== main() || closeConfirmed || !queue.unfinished().length) return
      event.preventDefault(); void confirmClose(false)
    })
  })
  app.on('before-quit', event => {
    if (closeConfirmed || !queue.unfinished().length) return
    event.preventDefault(); void confirmClose(true)
  })
  const save = (): void => {
    writeFileSync(`${settingsPath}.tmp`, JSON.stringify({ ...state, viewed: viewed.encode() }))
    renameSync(`${settingsPath}.tmp`, settingsPath)
  }
  app.on('will-quit', save)

  const authorize = (event: IpcMainInvokeEvent, onlyMain = true): void => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || (onlyMain ? window !== main() : window !== main() && !previews.has(window.id)) || event.senderFrame !== event.sender.mainFrame) throw new Error('不允许的调用方')
    const actual = new URL(event.senderFrame.url); actual.hash = ''
    const expected = process.env.ELECTRON_RENDERER_URL && !app.isPackaged ? new URL(process.env.ELECTRON_RENDERER_URL) : new URL(pathToFileURL(join(__dirname, '../renderer/index.html')).href)
    if (actual.href !== expected.href) throw new Error('不允许的页面')
  }
  const handle = (name: string, action: (event: IpcMainInvokeEvent, value: any) => unknown, onlyMain = true): void => {
    ipcMain.handle(`moe:${name}`, (event, value) => { authorize(event, onlyMain); return action(event, value) })
  }
  const getJson = async (url: string, signal: AbortSignal): Promise<unknown> => JSON.parse(new TextDecoder().decode(await limitedBody(await siteResponse(url, AbortSignal.any([signal, AbortSignal.timeout(40_000)])), 8 * 1024 * 1024)))
  const getNext = async (): Promise<VisualPage> => {
    if (!input) throw new Error('请先搜索')
    if (searchAbort) throw new Error('搜索正在进行')
    if (complete) throw new Error('搜索已完成')
    const current = generation, controller = new AbortController()
    searchAbort = controller
    const signal = controller.signal
    try {
      const page = await visualPage(input, nextPage, pageIndex + 1, offset, viewed, u => getJson(u, signal), signal)
      if (current !== generation) throw new Error('搜索已取消')
      page.items.forEach((item, index) => { item.key = `${current}-${page.index}-${index}`; items.set(item.key, item) })
      nextPage = page.nextPage; pageIndex++; offset += page.items.length; complete = page.complete
      return page
    } finally { if (current === generation) searchAbort = undefined }
  }
  handle('downloads', () => ({ tasks: queue.tasks, settings: queue.settings }))
  handle('enqueue', (_event, value) => {
    if (!value || !Array.isArray(value.keys) || !value.keys.length || value.keys.length > 5000 || !['原图', '预览图', '自动'].includes(value.quality)) throw new Error('下载参数无效')
    const sources: DownloadSource[] = value.keys.map((key: unknown) => {
      if (typeof key !== 'string') throw new Error('下载条目无效')
      const picture = items.get(key)
      if (!picture) throw new Error('图片不存在')
      const url = value.quality === '预览图' ? picture.preview : picture.original
      if (!isSiteUrl(url)) throw new Error('下载地址不受支持')
      return { ...picture, picture, url, referer: value.quality === '预览图' ? home : picture.detail, keyword: input?.keyword ?? '' }
    })
    queue.add(sources); return sources.length
  })
  handle('download-action', (_event, value) => {
    if (!value || !['stop', 'retry', 'remove', 'clear'].includes(value.action) || !Array.isArray(value.ids) || value.ids.length > 10000 || value.ids.some((id: unknown) => typeof id !== 'string' || !queue.tasks.some(task => task.id === id))) throw new Error('下载操作无效')
    queue.action(value.action as DownloadAction, value.ids)
  })
  handle('download-settings', (_event, value) => {
    queue.settings = validateDownloadSettings(value, queue.settings.directory); saveDownloads(); queue.pump()
  })
  handle('download-directory', async () => {
    const result = await dialog.showOpenDialog(main()!, { title: '图片保存位置', defaultPath: queue.settings.directory, properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled) return
    queue.settings.directory = result.filePaths[0]; saveDownloads(); return queue.settings.directory
  })
  handle('download-reveal', (_event, id) => {
    const task = queue.tasks.find(task => task.id === id)
    if (!task) throw new Error('任务不存在')
    shell.showItemInFolder(task.children?.[0]?.path || task.path)
  })
  handle('download-export', () => { if (!queue.unfinished().length) throw new Error('当前没有可导出的任务'); return exportTasks() })
  handle('download-import', (_event, text) => {
    if (typeof text !== 'string') throw new Error('任务包无效')
    const { sources, errors } = importSources(parseBundle(text), isSiteUrl)
    let added = 0
    for (const source of sources) { try { queue.add([source]); added++ } catch (error) { errors.push(String(error)) } }
    return { added, errors }
  })
  handle('init', () => state)
  handle('set-acrylic', (_event, enabled) => {
    if (typeof enabled !== 'boolean') throw new Error('毛玻璃设置无效')
    const previous = state.acrylicEnabled
    state.acrylicEnabled = enabled
    try { save() } catch (error) { state.acrylicEnabled = previous; throw error }
    setAcrylicEnabled(enabled)
  })
  handle('appearance', event => appearance(BrowserWindow.fromWebContents(event.sender)!), false)
  handle('search', (_e, value) => {
    const validated = validateSearch(value)
    searchAbort?.abort(); generation++; searchAbort = undefined; hintAbort?.abort()
    input = validated; nextPage = input.page; pageIndex = 0; offset = 0; complete = false; items.clear()
    state.count = input.count
    if (input.keyword) {
      if (state.history.length > 25) state.history.splice(24, 1)
      const old = state.history.indexOf(input.keyword)
      if (old >= 0) state.history.splice(old, 1)
      state.history.unshift(input.keyword)
    }
    return getNext()
  })
  handle('next', getNext)
  handle('cancel', () => { searchAbort?.abort(); generation++; searchAbort = undefined })
  handle('size', (_e, value) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 72 || value > 512) throw new Error('图片尺寸无效')
    state.size = value
  })
  handle('count', (_e, value) => {
    if (!Number.isInteger(value) || value < 10 || value > 500) throw new Error('图片数量无效')
    state.count = value
  })
  handle('hints', async (_e, keyword) => {
    if (typeof keyword !== 'string' || keyword.length > 1000) throw new Error('关键词无效')
    hintAbort?.abort(); hintAbort = new AbortController()
    if (!keyword) return state.history.map(word => ({ word, count: '' }))
    const data = await getJson(`${home}/tag.json?${new URLSearchParams({ limit: '15', order: 'count', name: keyword })}`, AbortSignal.any([hintAbort.signal, AbortSignal.timeout(15_000)]))
    if (!Array.isArray(data)) throw new Error('关键词提示格式无效')
    return data.slice(0, 15).map(item => ({ word: String(item.name ?? ''), count: String(item.count ?? '') }))
  })
  handle('copy', (_e, text) => {
    if (typeof text !== 'string' || text.length > 100_000) throw new Error('复制内容无效')
    clipboard.writeText(text)
  }, false)
  handle('open', (_e, key) => {
    const item = items.get(key)
    if (!item || !isSiteUrl(item.detail)) throw new Error('图片操作无效')
    return shell.openExternal(item.detail)
  })
  handle('preview', (_e, key) => {
    const item = items.get(key)
    if (!item) throw new Error('图片不存在')
    const window = createPreview(key)
    previews.set(window.id, item)
    window.on('closed', () => previews.delete(window.id))
  })
  handle('preview-item', event => {
    const item = previews.get(BrowserWindow.fromWebContents(event.sender)!.id)
    if (!item) throw new Error('预览不存在')
    return item
  }, false)

  protocol.handle('moe-image', async request => {
    try {
      const url = new URL(request.url)
      const match = /^\/(\d+-\d+-\d+)\/(thumbnail|preview)$/.exec(url.pathname)
      if (url.hostname !== 'picture' || !match || request.method !== 'GET') return new Response(null, { status: 400 })
      const key = match[1], kind = match[2] as 'thumbnail' | 'preview'
      const item = items.get(key) ?? [...previews.values()].find(i => i.key === key) ?? queue.tasks.find(task => task.source.picture?.key === key)?.source.picture
      if (!item) return new Response(null, { status: 404 })
      const response = await siteResponse(item[kind], AbortSignal.any([request.signal, AbortSignal.timeout(kind === 'thumbnail' ? 20_000 : 30_000)]))
      const type = response.headers.get('content-type')?.split(';')[0].trim() ?? ''
      if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'].includes(type)) { await response.body?.cancel(); throw new Error('图片类型无效') }
      const body = await limitedBody(response, 40 * 1024 * 1024, kind === 'preview' ? (loaded, total) => {
        for (const [windowId, picture] of previews) if (picture.key === key) BrowserWindow.fromId(windowId)?.webContents.send('moe:image-progress', { key, loaded, total })
      } : undefined)
      return new Response(body as BodyInit, { headers: { 'content-type': type, 'cache-control': 'no-store' } })
    } catch { return new Response(null, { status: 502 }) }
  })
  return state
}
