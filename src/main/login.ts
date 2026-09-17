import { BrowserWindow, WebContentsView, ipcMain, app } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { sites, allowedSiteUrl } from '../shared/network'
import { installAppearance } from './appearance'
import { SiteNetwork } from './network'
import type { LoginStatus, SiteId } from '../shared/types'

export function installLogin(network: SiteNetwork, main: () => BrowserWindow | undefined): (site: SiteId) => Promise<void> {
  let current: { window: BrowserWindow; view: WebContentsView; controller: AbortController; verifying: boolean; status: LoginStatus } | undefined
  let opening: Promise<void> | undefined
  let openingSite: SiteId | undefined
  let closingForQuit = false
  app.on('before-quit', event => {
    if (!current) return
    event.preventDefault()
    if (closingForQuit) return
    closingForQuit = true
    const entry = current
    const closed = new Promise<void>(resolve => entry.window.once('closed', () => resolve()))
    entry.controller.abort(); entry.window.close()
    const resumeQuit = (): void => { closingForQuit = false; app.quit() }
    void Promise.all([closed, network.waitForIdle()]).then(resumeQuit, resumeQuit)
  })
  const toolbarUrl = (): string => !app.isPackaged && process.env.ELECTRON_RENDERER_URL ? new URL('login.html', process.env.ELECTRON_RENDERER_URL.endsWith('/') ? process.env.ELECTRON_RENDERER_URL : process.env.ELECTRON_RENDERER_URL + '/').href : pathToFileURL(join(__dirname, '../renderer/login.html')).href
  const authorize = (event: IpcMainInvokeEvent): NonNullable<typeof current> => {
    if (!current || event.sender !== current.window.webContents || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== toolbarUrl()) throw new Error('不允许的登录调用方')
    return current
  }
  const publish = (entry: NonNullable<typeof current>, state: LoginStatus['state'], text: string): void => {
    entry.status = { site: entry.status.site, state, text }
    if (!entry.window.isDestroyed()) entry.window.webContents.send('login:status', entry.status)
  }
  const allowedNavigation = (url: string, site: SiteId): boolean => {
    if (site !== 'pixiv') return allowedSiteUrl(url, site)
    try {
      const u = new URL(url)
      return u.protocol === 'https:' && !u.username && !u.password && !u.port && ['accounts.pixiv.net', 'www.pixiv.net', 'accounts.google.com', 'appleid.apple.com', 'api.twitter.com', 'twitter.com', 'x.com'].includes(u.hostname)
    } catch { return false }
  }
  ipcMain.handle('login:init', event => authorize(event).status)
  ipcMain.handle('login:navigate', event => { const entry = authorize(event); if (entry.verifying) return; return entry.view.webContents.loadURL(sites[entry.status.site].login).catch(() => publish(entry, 'failed', '登录页面加载失败，请检查网络后重试')) })
  ipcMain.handle('login:verify', async event => {
    const entry = authorize(event)
    if (entry.verifying) return
    entry.verifying = true; publish(entry, 'verifying', '认证中，请稍候')
    try {
      const signal = AbortSignal.any([entry.controller.signal, AbortSignal.timeout(40000)])
      if (entry.status.site === 'pixiv') await network.commitPixiv(entry.view.webContents.session, signal)
      else await network.commitCookieLogin(entry.view.webContents.session, signal)
      if (entry.controller.signal.aborted) return
      for (let seconds = 4; seconds > 0; seconds--) {
        publish(entry, 'success', `认证成功，${seconds}秒后将关闭窗口`)
        await new Promise(resolve => setTimeout(resolve, 1000))
        if (entry.controller.signal.aborted) return
      }
      entry.window.close()
    } catch {
      if (!entry.controller.signal.aborted) {
        publish(entry, 'failed', '认证失败，请确认登录成功')
        const failedStatus = entry.status
        setTimeout(() => { if (!entry.verifying && current === entry && entry.status === failedStatus) publish(entry, 'idle', '') }, 4000)
      }
    } finally { entry.verifying = false }
  })
  return site => {
    if (current && !current.window.isDestroyed()) { if (current.status.site !== site) throw new Error('请先关闭当前登录窗口'); current.window.focus(); return Promise.resolve() }
    if (opening) { if (openingSite !== site) throw new Error('请先关闭当前登录窗口'); return opening }
    openingSite = site
    opening = (async () => {
      const candidate = await network.candidate(site)
      const parent = main()
      if (!parent || parent.isDestroyed()) { await network.discard(candidate); return }
      const ownerBounds = parent.getBounds()
      const window = new BrowserWindow({ title: '账号登陆窗口', width:1280, height:900, minWidth:700, minHeight:400, x:Math.round(ownerBounds.x + (ownerBounds.width - 1280)/2), y:Math.round(ownerBounds.y + (ownerBounds.height - 900)/2), parent, modal:process.platform !== 'darwin', show:false, autoHideMenuBar:true,
        webPreferences:{ preload:join(__dirname,'../preload/login.js'), sandbox:true, contextIsolation:true, nodeIntegration:false } })
      installAppearance(window, false)
      const view = new WebContentsView({ webPreferences:{ session:candidate, sandbox:true, contextIsolation:true, nodeIntegration:false, webSecurity:true } })
      const entry: NonNullable<typeof current> = { window, view, controller:new AbortController(), verifying:false, status:{site,state:'idle',text:''} }; current = entry
      window.contentView.addChildView(view)
      const resize = (): void => { const [width,height] = window.getContentSize(); view.setBounds({ x:0,y:50,width,height:Math.max(0,height-50) }) }
      resize(); window.on('resize',resize)
      window.webContents.setWindowOpenHandler(()=>({action:'deny'}))
      window.webContents.on('will-navigate',event=>event.preventDefault())
      view.webContents.on('will-navigate',(event,url)=>{if(!allowedNavigation(url, site)){event.preventDefault();publish(entry,'failed','此登录方式的跳转地址尚不支持，请检查站点登录地址配置')}})
      view.webContents.on('will-redirect',(event,url)=>{if(!allowedNavigation(url, site)){event.preventDefault();publish(entry,'failed','此登录方式的跳转地址尚不支持，请检查站点登录地址配置')}})
      view.webContents.setWindowOpenHandler(({url})=>{if(allowedNavigation(url, site))void view.webContents.loadURL(url).catch(()=>{});return {action:'deny'}})
      view.webContents.on('will-attach-webview',event=>event.preventDefault())
      view.webContents.on('did-fail-load',(_e,code,_description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3&&!entry.verifying)publish(entry,'failed','登录页面加载失败，请检查网络后重试')})
      window.on('closed',()=>{
        if (process.platform === 'darwin' && !parent.isDestroyed()) parent.setEnabled(true)
        entry.controller.abort(); if(current===entry)current=undefined
        if(!view.webContents.isDestroyed())view.webContents.close()
        void network.discard(candidate).catch(()=>{})
      })
      try {
        await window.loadURL(toolbarUrl()); if (process.platform === 'darwin') parent.setEnabled(false); window.show()
        await view.webContents.loadURL(sites[site].login).catch(()=>publish(entry,'failed','登录页面加载失败，请检查网络后重试'))
      } catch (error) { if (!window.isDestroyed()) window.close(); throw error }
    })().finally(()=>{opening=undefined;openingSite=undefined})
    return opening
  }
}
