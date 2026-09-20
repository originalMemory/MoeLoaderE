import { app, BrowserWindow, clipboard, dialog, ipcMain, protocol, shell } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { mkdirSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { home, validateSearch, Viewed, visualPage } from '../shared/booru'
import type { BrowserState, Picture, SearchInput, VisualPage } from '../shared/types'
import { appearance, setAcrylicEnabled } from './appearance'
import { DownloadQueue, downloadDefaults, taskbarProgress, validateDownloadSettings } from './downloads'
import { exportBundle, importSources, parseBundle } from './download-bundle'
import type { DownloadAction, DownloadSource } from '../shared/types'
import { randomUUID } from 'node:crypto'
import { unlinkSync } from 'node:fs'
import { SiteNetwork } from './network'
import { installLogin } from './login'
import { allowedSiteUrl, siteForUrl, sites, validSite } from '../shared/network'
import { pixivVisualPage, resolvePixiv } from '../shared/pixiv'
import { parseBooruXml } from '../shared/booru-xml'
import { resolveGelbooru } from './gelbooru'
import { loadCustomSites, customVisualPage, resolveCustom, loadCustomCategories } from './custom-sites'
import { BackgroundImages } from './background'
import { restoreSearchSettings, validateSearchSettings } from '../shared/search-settings'

export function isSiteUrl(value: string): boolean {
  try { siteForUrl(value); return true } catch { return false }
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
  const customDirectory = join(app.getPath('userData'), 'CustomSites')
  const custom = loadCustomSites(customDirectory)
  const network = new SiteNetwork(snapshot => { const window = main(); if (window && !window.isDestroyed()) window.webContents.send('moe:network-changed', snapshot) })
  const openLogin = installLogin(network, main)
  const siteResponse = (url: string, signal: AbortSignal, referer?: string, retry = true, site?: string): Promise<Response> => network.request(url, signal, referer, retry, site)
  const settingsPath = join(app.getPath('userData'), 'browser.json')
  const saved = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) : {}
  const state: BrowserState = { sites: structuredClone(sites), customErrors: custom.errors, displaySettings: { showBackground: typeof saved.displaySettings?.showBackground === 'boolean' ? saved.displaySettings.showBackground : true, lowPerformance: typeof saved.displaySettings?.lowPerformance === 'boolean' ? saved.displaySettings.lowPerformance : false }, searchSettings: restoreSearchSettings(saved.searchSettings), siteCounts: { 'konachan-g': 60, pixiv: 60, safebooru: 60, yande: 60, gelbooru: 60 }, count: 60, size: 192, history: [], acrylicEnabled: typeof saved.acrylicEnabled === 'boolean' ? saved.acrylicEnabled : true }
  setAcrylicEnabled(state.acrylicEnabled)
  if (saved.bounds && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(saved.bounds[key])) && saved.bounds.width >= 700 && saved.bounds.height >= 400) state.bounds = saved.bounds
  if (Number.isInteger(saved.count) && saved.count >= 10 && saved.count <= 500) state.count = saved.count
  if (Number.isFinite(saved.size) && saved.size >= 72 && saved.size <= 512) state.size = saved.size
  if (Array.isArray(saved.history)) state.history = saved.history.filter((v: unknown) => typeof v === 'string' && v.length <= 1000).slice(0, state.searchSettings.historyLimit)
  state.siteCounts['konachan-g'] = state.count
  if (Number.isInteger(saved.siteCounts?.pixiv) && saved.siteCounts.pixiv >= 10 && saved.siteCounts.pixiv <= 500) state.siteCounts.pixiv = saved.siteCounts.pixiv
  if (Number.isInteger(saved.siteCounts?.safebooru) && saved.siteCounts.safebooru >= 10 && saved.siteCounts.safebooru <= 500) state.siteCounts.safebooru = saved.siteCounts.safebooru
  if (Number.isInteger(saved.siteCounts?.yande) && saved.siteCounts.yande >= 10 && saved.siteCounts.yande <= 500) state.siteCounts.yande = saved.siteCounts.yande
  if (Number.isInteger(saved.siteCounts?.gelbooru) && saved.siteCounts.gelbooru >= 10 && saved.siteCounts.gelbooru <= 500) state.siteCounts.gelbooru = saved.siteCounts.gelbooru
  const viewedBySite: Record<string, Viewed> = { gelbooru: new Viewed(typeof saved.gelbooruViewed === 'string' ? saved.gelbooruViewed : ''), yande: new Viewed(typeof saved.yandeViewed === 'string' ? saved.yandeViewed : ''), 'konachan-g': new Viewed(typeof saved.viewed === 'string' ? saved.viewed : ''), pixiv: new Viewed(typeof saved.pixivViewed === 'string' ? saved.pixivViewed : ''), safebooru: new Viewed(typeof saved.safebooruViewed === 'string' ? saved.safebooruViewed : '') }
  const histories: Record<string, string[]> = { gelbooru: Array.isArray(saved.gelbooruHistory) ? saved.gelbooruHistory.filter((v: unknown) => typeof v === 'string' && v.length <= 1000).slice(0,state.searchSettings.historyLimit) as string[] : [], yande: Array.isArray(saved.yandeHistory) ? saved.yandeHistory.filter((v: unknown) => typeof v === 'string' && v.length <= 1000).slice(0,state.searchSettings.historyLimit) as string[] : [], safebooru: Array.isArray(saved.safebooruHistory) ? saved.safebooruHistory.filter((v: unknown) => typeof v === 'string' && v.length <= 1000).slice(0,state.searchSettings.historyLimit) as string[] : [], 'konachan-g': state.history, pixiv: Array.isArray(saved.pixivHistory) ? saved.pixivHistory.filter((v: unknown) => typeof v === 'string' && v.length <= 1000).slice(0,state.searchSettings.historyLimit) as string[] : [] }
  const conflictingCustomHistories: Record<string, string[]> = {}
  for (const [site, previous] of Object.entries(saved.customStates ?? {}) as [string, any][]) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(site)) continue
    const history = Array.isArray(previous?.history) ? previous.history.filter((value: unknown) => typeof value === 'string' && value.length <= 1000).slice(0,state.searchSettings.historyLimit) : []
    if (Object.hasOwn(histories,site)) conflictingCustomHistories[site] = history
    else histories[site] = history
  }
  const customViewed: Record<string, Set<number>> = {}, customHistorical: Record<string, Set<number>> = {}
  for (const site of custom.configs.keys()) {
    const previous = saved.customStates?.[site]
    histories[site] = Array.isArray(previous?.history) ? previous.history.filter((value: unknown) => typeof value === 'string' && value.length <= 1000).slice(0,state.searchSettings.historyLimit) : []
    state.siteCounts[site] = Number.isInteger(saved.siteCounts?.[site]) && saved.siteCounts[site] >= 10 && saved.siteCounts[site] <= 500 ? saved.siteCounts[site] : 60
    const ids = Array.isArray(previous?.viewed) ? previous.viewed.filter((id: unknown) => Number.isSafeInteger(id) && Number(id) >= 0).slice(-10000) : []
    customViewed[site] = new Set(ids); customHistorical[site] = new Set(ids)
  }
  const historyLists = [...Object.values(histories), ...Object.values(conflictingCustomHistories)]
  const items = new Map<string, Picture>()
  const previews = new Map<number, Picture>()
  let input: SearchInput | undefined, searchAbort: AbortController | undefined, hintAbort: AbortController | undefined
  let nextPage = 1, pageIndex = 0, offset = 0, complete = false, generation = 0, pixivCursor = ''
  const downloadPath = join(app.getPath('userData'), 'downloads.json')
  const initial = downloadDefaults(join(app.getPath('pictures'), 'MoeLoaderE'))
  const stored = existsSync(downloadPath) ? JSON.parse(readFileSync(downloadPath, 'utf8')) : undefined
  const queue = new DownloadQueue(stored ? validateDownloadSettings(stored, typeof stored.directory === 'string' && stored.directory ? stored.directory : initial.directory) : initial, (url, signal, referer, site) => siteResponse(url, signal, referer, false, site),
    () => {
      const window = main()
      if (!window || window.isDestroyed()) return
      window.webContents.send('moe:downloads-changed', { tasks: queue.tasks, settings: queue.settings })
      const progress = taskbarProgress(queue.tasks)
      window.setProgressBar(progress.value, { mode: progress.mode })
    })
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
    writeFileSync(`${settingsPath}.tmp`, JSON.stringify({ ...state, siteCounts: { ...saved.siteCounts, ...state.siteCounts }, sites: undefined, customErrors: undefined, customStates: { ...Object.fromEntries(Object.entries(saved.customStates ?? {}).map(([site, previous]) => [site, {...(previous as object), history: conflictingCustomHistories[site] ?? histories[site] ?? []}])), ...Object.fromEntries([...custom.configs.keys()].map(site => [site, {history: histories[site], viewed: [...customViewed[site]].slice(-10000)}])) }, viewed: viewedBySite['konachan-g'].encode(), pixivViewed: viewedBySite.pixiv.encode(), pixivHistory: histories.pixiv, safebooruHistory: histories.safebooru, safebooruViewed: viewedBySite.safebooru.encode(), yandeHistory: histories.yande, yandeViewed: viewedBySite.yande.encode(), gelbooruHistory: histories.gelbooru, gelbooruViewed: viewedBySite.gelbooru.encode() }))
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
  const getJson = async (url: string, signal: AbortSignal, referer?: string): Promise<any> => JSON.parse(new TextDecoder().decode(await limitedBody(await siteResponse(url, AbortSignal.any([signal, AbortSignal.timeout(40_000)]), referer), 8 * 1024 * 1024)))
  const getBooruXml = async (url: string, signal: AbortSignal, root: 'posts' | 'tags', site: string): Promise<Record<string, string>[]> => parseBooruXml(new TextDecoder().decode(await limitedBody(await siteResponse(url, AbortSignal.any([signal, AbortSignal.timeout(40000)]), undefined, true, site), 8 * 1024 * 1024)), root, sites[site].name)
  const getText = async (url: string, signal: AbortSignal, site: string, referer?: string): Promise<string> => new TextDecoder().decode(await limitedBody(await siteResponse(url, AbortSignal.any([signal, AbortSignal.timeout(40000)]), referer, true, site), 2 * 1024 * 1024))
  const getCustomHtml = async (site: string, url: string, signal: AbortSignal, referer?: string): Promise<string> => new TextDecoder().decode(await limitedBody(await siteResponse(url, AbortSignal.any([signal, AbortSignal.timeout(40000)]), referer, true, site), 2 * 1024 * 1024))
  const categoryLoads = new Map<string, Promise<void>>()
  const ensureCategories = async (site: string): Promise<void> => {
    const config=custom.configs.get(site)
    if(!config)throw new Error('自定义站点不存在')
    if(!config.CustomLv2MenuItems?.length||config.Categories.length)return
    let pending=categoryLoads.get(site)
    if(!pending){
      const signal=AbortSignal.timeout(40000)
      pending=loadCustomCategories(config,(url,referer)=>getCustomHtml(site,url,signal,referer),signal).then(categories=>{
        config.Categories=categories;sites[site].categories=categories.map(category=>category.Name)
        const window=main();if(window&&!window.isDestroyed())window.webContents.send('moe:custom-categories-changed',{site,names:sites[site].categories})
      }).finally(()=>categoryLoads.delete(site))
      categoryLoads.set(site,pending)
    }
    await pending
  }
  handle('custom-categories', async (_event, site) => {
    if(typeof site!=='string'||!custom.configs.has(site))throw new Error('自定义站点无效')
    await ensureCategories(site)
    return custom.configs.get(site)!.Categories.map(category=>category.Name)
  })
  const details = new Map<string, Promise<Picture>>()
  const detail = async (key: unknown, captured?: Picture): Promise<Picture> => {
    if (typeof key !== 'string') throw new Error('图片无效')
    const item = captured ?? items.get(key)
    if (!item) throw new Error('图片不存在')
    const config = custom.configs.get(item.site ?? ''), needsPixiv = item.site === 'pixiv' && !item.original, needsCustom = !!config && !item.original, needsGelbooru = item.site === 'gelbooru' && !item.detailsLoaded
    if (!needsPixiv && !needsCustom && !needsGelbooru) return item
    let pending = details.get(key)
    if (!pending) {
      const signal = AbortSignal.timeout(120000)
      pending = (needsGelbooru ? getText(item.detail, signal, 'gelbooru').then(html => resolveGelbooru(item, html)) : config ? resolveCustom(config, item, (url, referer) => getCustomHtml(config.ShortName, url, signal, referer), signal) : resolvePixiv(item, (url, referer) => getJson(url, signal, referer))).then(resolved => {
        if (resolved.pages?.some(page => !allowedSiteUrl(page.original, item.site!) || !allowedSiteUrl(page.preview, item.site!))) throw new Error('图片地址不受支持')
        Object.assign(item, resolved); return item
      }).finally(() => details.delete(key))
      details.set(key, pending)
    }
    return pending
  }
  const getNext = async (): Promise<VisualPage> => {
    if (!input) throw new Error('请先搜索')
    if (searchAbort) throw new Error('搜索正在进行')
    if (complete) throw new Error('搜索已完成')
    const current = generation, controller = new AbortController()
    searchAbort = controller
    const signal = controller.signal
    try {
      const currentInput = input
      const viewed = viewedBySite[currentInput.site ?? 'konachan-g']
      if (currentInput.site === 'pixiv' && !(await network.snapshot()).loggedIn.pixiv) throw new Error('需要重新登录Pixiv站点才能开始搜索')
      const config = custom.configs.get(currentInput.site ?? '')
      if(config){await ensureCategories(config.ShortName);signal.throwIfAborted()}
      const page = config ? await customVisualPage(config, currentInput, nextPage, pageIndex + 1, offset, {has: id => customHistorical[config.ShortName].has(id), add: id => { const set=customViewed[config.ShortName]; set.add(id); if(set.size>10000)set.delete(set.values().next().value!) }}, (url, referer) => getCustomHtml(config.ShortName, url, signal, referer), signal) : currentInput.site === 'pixiv'
        ? await pixivVisualPage(currentInput, nextPage, pageIndex + 1, offset, viewed, (url, referer) => getJson(url, signal, referer), signal, pixivCursor)
        : await visualPage(currentInput, nextPage, pageIndex + 1, offset, viewed, u => ['safebooru','yande','gelbooru'].includes(currentInput.site ?? '') ? getBooruXml(u, signal, 'posts', currentInput.site!) : getJson(u, signal), signal)
      if (current !== generation) throw new Error('搜索已取消')
      page.items.forEach((item, index) => { item.key = `${current}-${page.index}-${index}`; item.site = currentInput.site ?? 'konachan-g'; item.keyword = currentInput.keyword; items.set(item.key, item) })
      pixivCursor = page.cursor || ''; nextPage = page.nextPage; pageIndex++; offset += page.items.length; complete = page.complete
      return page
    } finally { if (current === generation) searchAbort = undefined }
  }
  handle('downloads', () => ({ tasks: queue.tasks, settings: queue.settings }))
  handle('custom-directory', async () => { mkdirSync(customDirectory, {recursive: true}); const error=await shell.openPath(customDirectory); if(error)throw new Error(error) })
  handle('network', () => network.snapshot())
  handle('set-network', (_event, value) => network.update(value))
  handle('login', (_event, site) => { if (!validSite(site) || !sites[site].login) throw new Error('该站点不支持账号'); return openLogin(site) })
  handle('logout', (_event, site) => { if (!validSite(site)) throw new Error('站点无效'); return network.logout(site) })
  handle('detail', (_event, key) => detail(key))
  handle('enqueue', async (_event, value) => {
    if (!value || !Array.isArray(value.keys) || !value.keys.length || value.keys.length > 5000 || !['原图', '预览图', '大图', 'Jpeg图', '自动'].includes(value.quality)) throw new Error('下载参数无效')
    // Capture authorized entries before awaiting details; a new search may clear the current map.
    const selected: Picture[] = value.keys.map((key: unknown) => { if (typeof key !== 'string' || !items.has(key)) throw new Error('图片不存在'); return items.get(key)! })
    const sources: DownloadSource[] = []
    for (const picture of selected) {
      const item = ((picture.site === 'pixiv' || sites[picture.site ?? 'konachan-g'].custom) && !picture.original) || picture.site === 'gelbooru' && !picture.detailsLoaded ? await detail(picture.key, picture) : picture
      const site = item.site ?? 'konachan-g', preview = value.quality === '预览图' || value.quality === '大图' || value.quality === 'Jpeg图'
      const url = value.quality === 'Jpeg图' ? item.large || item.preview : preview ? item.preview : item.original
      if (!allowedSiteUrl(url, site)) throw new Error('下载地址不受支持')
      const source: DownloadSource = { id:item.id, title:item.title, author:item.author, authorId:item.authorId, artist:item.artist, character:item.character, copyright:item.copyright, tags:item.tags, date:item.date, detail:item.detail, site, picture:item, url, referer:item.pages?.[0]?.referer ?? (site === 'pixiv' || !preview ? item.detail : sites[site].home), keyword:item.keyword ?? '' }
      if (item.pages && item.pages.length > 1) source.children = item.pages.map(page => ({ ...source, picture: undefined, referer: page.referer ?? source.referer, url: preview ? page.preview : page.original }))
      sources.push(source)
    }
    queue.add(sources); return sources.length
  })
  handle('download-action', (_event, value) => {
    if (!value || !['stop', 'retry', 'remove', 'clear', 'clear-success-retry-failed'].includes(value.action) || !Array.isArray(value.ids) || value.ids.length > 10000 || value.ids.some((id: unknown) => typeof id !== 'string' || !queue.tasks.some(task => task.id === id))) throw new Error('下载操作无效')
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
  const backgrounds = new BackgroundImages(join(app.getPath('userData'), 'Background'))
  handle('background', () => backgrounds.get())
  handle('change-background', () => backgrounds.change())
  handle('background-directory', () => backgrounds.openDirectory())
  handle('display-settings', (_event, value) => {
    if (!value || typeof value.showBackground !== 'boolean' || typeof value.lowPerformance !== 'boolean') throw new Error('外观设置无效')
    const previous = state.displaySettings
    state.displaySettings = { showBackground: value.showBackground, lowPerformance: value.lowPerformance }
    try { save() } catch (error) { state.displaySettings = previous; throw error }
  })
  handle('init', () => state)
  handle('search-settings', (_event, value) => {
    const next = validateSearchSettings(value), previous = state.searchSettings
    const previousHistories = historyLists.map(history => [...history])
    state.searchSettings = next
    for (const history of historyLists) history.splice(next.historyLimit)
    try { save() } catch (error) {
      state.searchSettings = previous
      historyLists.forEach((history, index) => history.splice(0, history.length, ...previousHistories[index]))
      throw error
    }
  })
  handle('clear-history', () => {
    const previous = historyLists.map(history => [...history])
    for (const history of historyLists) history.length = 0
    try { save() } catch (error) {
      historyLists.forEach((history, index) => history.push(...previous[index]))
      throw error
    }
  })
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
    input = validated; nextPage = input.page; pageIndex = 0; offset = 0; complete = false; pixivCursor = ''; items.clear()
    state.siteCounts[input.site ?? 'konachan-g'] = input.count
    if (!input.site || input.site === 'konachan-g') state.count = input.count
    const history = histories[input.site ?? 'konachan-g']
    if (input.keyword) {
      const old = history.indexOf(input.keyword)
      if (old >= 0) history.splice(old, 1)
      history.unshift(input.keyword)
      history.splice(state.searchSettings.historyLimit)
    }
    return getNext()
  })
  handle('next', getNext)
  handle('cancel', () => { searchAbort?.abort(); generation++; searchAbort = undefined })
  handle('size', (_e, value) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 72 || value > 512) throw new Error('图片尺寸无效')
    state.size = value
  })
  handle('count', (_e, request) => {
    const value = typeof request === 'number' ? request : request?.value
    const site = typeof request === 'number' ? 'konachan-g' : request?.site
    if (!validSite(site)) throw new Error('站点无效')
    if (!Number.isInteger(value) || value < 10 || value > 500) throw new Error('图片数量无效')
    state.siteCounts[site] = value
    if (site === 'konachan-g') state.count = value
  })
  handle('hints', async (_e, request) => {
    const keyword = typeof request === 'string' ? request : request?.keyword
    const site = typeof request === 'string' ? 'konachan-g' : request?.site
    if (!validSite(site)) throw new Error('站点无效')
    if (typeof keyword !== 'string' || keyword.length > 1000) throw new Error('关键词无效')
    hintAbort?.abort(); hintAbort = new AbortController()
    const signal = hintAbort.signal
    if (!keyword) return histories[site].map(word => ({ word, count: '' }))
    if (sites[site].custom) return histories[site].filter(word => word.includes(keyword)).map(word => ({word,count:''}))
    if (site === 'pixiv') {
      if (!(await network.snapshot()).loggedIn.pixiv) throw new Error('需要重新登录Pixiv站点才能开始搜索')
      const value = await getJson(`https://www.pixiv.net/rpc/cps.php?${new URLSearchParams({ keyword })}`, signal, sites.pixiv.home)
      if (!Array.isArray(value?.candidates)) throw new Error('关键词提示格式无效')
      return value.candidates.map((item: any) => ({ word: String(item.tag_name ?? ''), count: '' }))
    }
    if (site === 'safebooru') {
      const records = await getBooruXml(`${sites.safebooru.home}/index.php?${new URLSearchParams({page:'dapi',s:'tag',q:'index',order:'name',limit:'8',name:keyword})}`, signal, 'tags', site)
      return records.slice(0,8).map(record => ({word:record.name || '',count:record.count || ''}))
    }
    if (site === 'yande') {
      const records = await getBooruXml(`${sites.yande.home}/tag.xml?${new URLSearchParams({limit:'15',order:'count',name:keyword})}`, signal, 'tags', site)
      return records.slice(0,15).map(record => ({word:record.name || '',count:record.count || ''}))
    }
    if (site === 'gelbooru') {
      const value = await getJson(`${sites.gelbooru.home}/index.php?${new URLSearchParams({page:'autocomplete2',term:keyword,type:'tag_query',limit:'10'})}`, signal, sites.gelbooru.home)
      if (!Array.isArray(value)) throw new Error('关键词提示格式无效')
      return value.slice(0,10).map(item => ({word:String(item.value ?? ''),count:String(item.post_count ?? '')}))
    }
    const data = await getJson(`${home}/tag.json?${new URLSearchParams({ limit: '15', order: 'count', name: keyword })}`, AbortSignal.any([signal, AbortSignal.timeout(15_000)]))
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
  handle('preview', async (_e, key) => {
    const item = await detail(key)
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
      if (url.hostname === 'site-icon' && request.method === 'GET') {
        const site=decodeURIComponent(url.pathname.slice(1)), icon=validSite(site) ? sites[site].icon : undefined
        if(!icon || !sites[site].custom)return new Response(null,{status:404})
        const response=await siteResponse(icon,AbortSignal.any([request.signal,AbortSignal.timeout(15000)]),sites[site].home,true,site)
        const type=response.headers.get('content-type')?.split(';')[0] ?? ''
        if(!['image/png','image/jpeg','image/webp','image/x-icon','image/vnd.microsoft.icon'].includes(type)){await response.body?.cancel();return new Response(null,{status:415})}
        const body=await limitedBody(response,1024*1024)
        return new Response(body as BodyInit,{headers:{'content-type':type,'cache-control':'no-store'}})
      }
      if (url.hostname === 'background') return backgrounds.response(request)
      const match = /^\/(\d+-\d+-\d+)\/(thumbnail|preview)$/.exec(url.pathname)
      if (url.hostname !== 'picture' || !match || request.method !== 'GET') return new Response(null, { status: 400 })
      const key = match[1], kind = match[2] as 'thumbnail' | 'preview'
      const item = items.get(key) ?? [...previews.values()].find(i => i.key === key) ?? queue.tasks.find(task => task.source.picture?.key === key)?.source.picture
      if (!item) return new Response(null, { status: 404 })
      if (!allowedSiteUrl(item[kind], item.site ?? 'konachan-g')) return new Response(null, { status: 400 })
      const response = await siteResponse(item[kind], AbortSignal.any([request.signal, AbortSignal.timeout(kind === 'thumbnail' ? 20_000 : 30_000)]), (kind === 'thumbnail' ? item.thumbnailReferer : item.previewReferer) ?? (item.site === 'pixiv' ? item.detail : sites[item.site ?? 'konachan-g'].home), true, item.site)
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
