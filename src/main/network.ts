import { app, session } from 'electron'
import type { Session, Cookie, CookiesSetDetails } from 'electron'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { allowedSiteUrl, networkDefaults, proxyConfig, siteForUrl, sites, validateNetwork } from '../shared/network'
import type { NetworkSettings, NetworkSnapshot, SiteId } from '../shared/types'

export const sitePartition = (site: SiteId): string => `persist:moe-site-${site}`
function secureSession(ses: Session): void {
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  ses.setPermissionCheckHandler(() => false)
  ses.on('will-download', event => event.preventDefault())
}
function cookieDetails(cookie: Cookie): CookiesSetDetails {
  if (!cookie.domain) throw new Error('Cookie 缺少域名')
  return { url: `https://${cookie.domain.replace(/^\./, '')}${cookie.path || '/'}`, name: cookie.name, value: cookie.value,
    ...(cookie.hostOnly ? {} : { domain: cookie.domain }), path: cookie.path, secure: cookie.secure, httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite, ...(cookie.session ? {} : { expirationDate: cookie.expirationDate }) }
}
export class SiteNetwork {
  settings: NetworkSettings
  private sessions: Record<SiteId, Session>
  private candidates = new Map<Session, SiteId>()
  private ready: Promise<unknown> = Promise.resolve()
  private verified = false
  private configurationError: Error | undefined
  private file: string
  private changed: (snapshot: NetworkSnapshot) => void
  constructor(changed: (snapshot: NetworkSnapshot) => void) {
    this.file = join(app.getPath('userData'), 'network.json')
    const saved = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : undefined
    this.settings = saved ? validateNetwork(saved.settings) : networkDefaults()
    this.verified = saved?.pixivVerified === true
    this.changed = changed
    this.sessions = { 'konachan-g': session.fromPartition(sitePartition('konachan-g')), pixiv: session.fromPartition(sitePartition('pixiv')), safebooru: session.fromPartition(sitePartition('safebooru')) }
    for (const [site, ses] of Object.entries(this.sessions) as [SiteId, Session][]) {
      secureSession(ses)
      ses.cookies.on('changed', () => { if (site === 'pixiv') void this.publish() })
    }
    this.ready = this.applyProxy(this.settings).catch(() => { this.configurationError = new Error('代理初始化失败，请重新应用代理设置') })
  }
  private save(): void {
    writeFileSync(`${this.file}.tmp`, JSON.stringify({ settings: this.settings, pixivVerified: this.verified }))
    renameSync(`${this.file}.tmp`, this.file)
  }
  private async applyProxy(settings: NetworkSettings): Promise<void> {
    for (const [site, ses] of Object.entries(this.sessions) as [SiteId, Session][]) { await ses.setProxy(proxyConfig(settings, site)); await ses.closeAllConnections() }
    for (const [ses, site] of this.candidates) { await ses.setProxy(proxyConfig(settings, site)); await ses.closeAllConnections() }
  }
  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.ready.then(operation)
    this.ready = next.catch(() => {})
    return next
  }
  async waitForIdle(): Promise<void> { await this.ready }
  async snapshot(): Promise<NetworkSnapshot> {
    await this.ready
    const cookies = this.verified ? await this.sessions.pixiv.cookies.get({ url: sites.pixiv.home }) : []
    return { settings: structuredClone(this.settings), loggedIn: { 'konachan-g': false, safebooru: false, pixiv: this.verified && cookies.some(c => c.name === 'PHPSESSID' && c.value.length > 0) } }
  }
  private async publish(): Promise<void> { try { this.changed(await this.snapshot()) } catch { /* A failed session init is reported by the initiating request. */ } }
  async update(value: unknown): Promise<void> {
    const next = validateNetwork(value)
    await this.mutate(async () => {
      const previous = this.settings
      try { await this.applyProxy(next); this.settings = next; this.save(); this.configurationError = undefined }
      catch (error) {
        this.settings = previous
        try { await this.applyProxy(previous) } catch { this.configurationError = new Error('代理恢复失败，请重新应用代理设置') }
        throw error
      }
    })
    await this.publish()
  }
  async candidate(site: SiteId): Promise<Session> {
    return this.mutate(async () => {
      const ses = session.fromPartition(`moe-login-${site}-${randomUUID()}`, { cache: false })
      secureSession(ses); await ses.setProxy(proxyConfig(this.settings, site))
      if (site === 'pixiv' && this.verified) for (const cookie of await this.sessions.pixiv.cookies.get({})) await ses.cookies.set(cookieDetails(cookie))
      this.candidates.set(ses, site)
      return ses
    })
  }
  async discard(ses: Session): Promise<void> {
    this.candidates.delete(ses)
    await ses.closeAllConnections(); await ses.clearStorageData(); await ses.clearCache()
  }
  async commitPixiv(candidate: Session, signal: AbortSignal): Promise<void> {
    if (this.candidates.get(candidate) !== 'pixiv') throw new Error('登录会话无效')
    const loginCookies = await candidate.cookies.get({ url: sites.pixiv.home })
    signal.throwIfAborted()
    if (!loginCookies.some(c => c.name === 'PHPSESSID' && c.value)) throw new Error('认证失败，请确认登录成功')
    const response = await candidate.fetch('https://www.pixiv.net/ajax/user/extra', { signal, credentials: 'include', redirect: 'error' })
    if (!response.ok) { await response.body?.cancel(); throw new Error('认证失败，请确认登录成功') }
    const verified = await readJson(response)
    if (!verified || verified.error !== false || !verified.body || typeof verified.body !== 'object') throw new Error('认证失败，请确认登录成功')
    signal.throwIfAborted()
    if (!(await candidate.cookies.get({ url: sites.pixiv.home })).some(cookie => cookie.name === 'PHPSESSID' && cookie.value)) throw new Error('认证失败，请确认登录成功')
    const cookies = (await candidate.cookies.get({})).filter(c => c.domain === 'pixiv.net' || c.domain?.endsWith('.pixiv.net'))
    await this.mutate(async () => {
      signal.throwIfAborted()
      const target = this.sessions.pixiv, oldCookies = await target.cookies.get({}), oldVerified = this.verified
      try {
        signal.throwIfAborted()
        await target.clearStorageData({ storages: ['cookies'] })
        for (const cookie of cookies) { signal.throwIfAborted(); await target.cookies.set(cookieDetails(cookie)) }
        await target.cookies.flushStore(); signal.throwIfAborted()
        this.verified = true; this.save()
      } catch (error) {
        this.verified = oldVerified
        await target.clearStorageData({ storages: ['cookies'] })
        for (const cookie of oldCookies) await target.cookies.set(cookieDetails(cookie))
        await target.cookies.flushStore(); throw error
      }
    })
    await this.publish()
  }
  async logout(site: SiteId): Promise<void> {
    if (site !== 'pixiv') throw new Error('该站点不支持账号')
    await this.mutate(async () => {
      this.verified = false; this.save()
      await this.sessions[site].closeAllConnections(); await this.sessions[site].clearStorageData(); await this.sessions[site].clearCache()
    })
    await this.publish()
  }
  async request(url: string, signal: AbortSignal, referer?: string, retry = true): Promise<Response> {
    const site = siteForUrl(url)
    if (site === 'pixiv' && !(await this.snapshot()).loggedIn.pixiv) throw new Error('需要重新登录Pixiv站点才能开始搜索')
    for (let hop = 0; hop < 5; hop++) {
      if (!allowedSiteUrl(url, site)) throw new Error('站点资源地址不受支持')
      const request = async (): Promise<Response> => {
        await this.ready; signal.throwIfAborted()
        if (this.configurationError) throw this.configurationError
        if (site === 'pixiv' && !this.verified) throw new Error('需要重新登录Pixiv站点才能开始搜索')
        return this.sessions[site].fetch(url, { signal, redirect: 'manual', credentials: 'include', headers: { Referer: referer || sites[site].home } })
      }
      let response: Response
      try { response = await request() } catch (error) { signal.throwIfAborted(); if (!retry) throw error; response = await request() }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location'); await response.body?.cancel()
        if (!location) throw new Error('站点重定向地址缺失')
        url = new URL(location, url).href; continue
      }
      if (!response.ok) {
        await response.body?.cancel()
        if (response.status === 401 && site === 'pixiv') { this.verified = false; this.save(); void this.publish() }
        throw new Error(`站点请求失败 (${response.status})`)
      }
      return response
    }
    throw new Error('站点重定向次数过多')
  }
}
export async function readJson(response: Response): Promise<any> {
  const reader = response.body?.getReader(); if (!reader) throw new Error('站点响应为空')
  const chunks: Uint8Array[] = []; let size = 0
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 8 * 1024 * 1024) throw new Error('响应过大'); chunks.push(value) } }
  finally { await reader.cancel() }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new Error('站点未返回有效 JSON，可能需要登录或验证') }
}
