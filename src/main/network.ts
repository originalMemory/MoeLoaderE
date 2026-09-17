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
  private verified = new Set<SiteId>()
  private authRevision = new Map<SiteId, number>()
  private configurationError: Error | undefined
  private file: string
  private changed: (snapshot: NetworkSnapshot) => void
  constructor(changed: (snapshot: NetworkSnapshot) => void) {
    this.file = join(app.getPath('userData'), 'network.json')
    const saved = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : undefined
    this.settings = saved ? validateNetwork(saved.settings) : networkDefaults()
    if (saved?.pixivVerified === true) this.verified.add('pixiv')
    if (Array.isArray(saved?.customVerified)) for (const site of saved.customVerified) if (typeof site === 'string' && site !== 'pixiv') this.verified.add(site)
    this.changed = changed
    this.sessions = Object.fromEntries(Object.keys(sites).map(site => [site, session.fromPartition(sitePartition(site))]))
    for (const [site, ses] of Object.entries(this.sessions) as [SiteId, Session][]) {
      secureSession(ses)
      ses.cookies.on('changed', () => { if (sites[site].login) void this.publish() })
    }
    this.ready = this.applyProxy(this.settings).catch(() => { this.configurationError = new Error('代理初始化失败，请重新应用代理设置') })
  }
  private save(): void {
    writeFileSync(`${this.file}.tmp`, JSON.stringify({ settings: this.settings, pixivVerified: this.verified.has('pixiv'), customVerified: [...this.verified].filter(site => site !== 'pixiv') }))
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
    const loggedIn = Object.fromEntries(await Promise.all(Object.keys(sites).map(async site => [site, this.verified.has(site) && await this.hasLoginCookie(this.sessions[site], site)])))
    return { settings: structuredClone(this.settings), loggedIn }
  }
  private async hasLoginCookie(ses: Session, site: SiteId): Promise<boolean> {
    if (!sites[site]?.login) return false
    const key = site === 'pixiv' ? 'PHPSESSID' : sites[site].cookieAuthKey
    const cookies = await ses.cookies.get({ url: sites[site].home })
    return cookies.some(cookie => cookie.value.length > 0 && (!key || (site === 'pixiv' ? cookie.name === key : cookie.name.toLowerCase() === key.toLowerCase())))
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
      if (this.verified.has(site)) for (const cookie of await this.sessions[site].cookies.get({})) await ses.cookies.set(cookieDetails(cookie))
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
    await this.commitCookies('pixiv', cookies, signal)
  }
  async commitCustom(candidate: Session, signal: AbortSignal): Promise<void> {
    const site = this.candidates.get(candidate)
    if (!site || !sites[site]?.custom || !sites[site].login) throw new Error('登录会话无效')
    signal.throwIfAborted()
    if (!await this.hasLoginCookie(candidate, site)) throw new Error('认证失败，请确认登录成功')
    const hosts = sites[site].hosts.map(host => new URL(`http://${host}`).hostname)
    const cookies = (await candidate.cookies.get({})).filter(cookie => {
      const domain = cookie.domain?.replace(/^\./, '')
      return domain && hosts.some(host => host === domain || host.endsWith(`.${domain}`))
    })
    await this.commitCookies(site, cookies, signal)
  }
  private async commitCookies(site: SiteId, cookies: Cookie[], signal: AbortSignal): Promise<void> {
    await this.mutate(async () => {
      signal.throwIfAborted()
      const target = this.sessions[site], oldCookies = await target.cookies.get({}), oldVerified = this.verified.has(site)
      try {
        signal.throwIfAborted()
        await target.clearStorageData({ storages: ['cookies'] })
        for (const cookie of cookies) { signal.throwIfAborted(); await target.cookies.set(cookieDetails(cookie)) }
        await target.cookies.flushStore(); signal.throwIfAborted()
        this.verified.add(site); this.save()
        this.authRevision.set(site, (this.authRevision.get(site) ?? 0) + 1)
      } catch (error) {
        if (oldVerified) this.verified.add(site); else this.verified.delete(site)
        await target.clearStorageData({ storages: ['cookies'] })
        for (const cookie of oldCookies) await target.cookies.set(cookieDetails(cookie))
        await target.cookies.flushStore(); throw error
      }
    })
    await this.publish()
  }
  async logout(site: SiteId): Promise<void> {
    if (!sites[site]?.login) throw new Error('该站点不支持账号')
    await this.mutate(async () => {
      this.verified.delete(site); this.save()
      this.authRevision.set(site, (this.authRevision.get(site) ?? 0) + 1)
      await this.sessions[site].closeAllConnections(); await this.sessions[site].clearStorageData(); await this.sessions[site].clearCache()
    })
    await this.publish()
  }
  async request(url: string, signal: AbortSignal, referer?: string, retry = true, requestedSite?: SiteId): Promise<Response> {
    const site = requestedSite ?? siteForUrl(url)
    if (site === 'pixiv' && !(await this.snapshot()).loggedIn.pixiv) throw new Error('需要重新登录Pixiv站点才能开始搜索')
    for (let hop = 0; hop < 5; hop++) {
      if (!allowedSiteUrl(url, site)) throw new Error('站点资源地址不受支持')
      let requestRevision = 0
      const request = async (): Promise<Response> => {
        await this.ready; signal.throwIfAborted()
        if (this.configurationError) throw this.configurationError
        if (site === 'pixiv' && !this.verified.has(site)) throw new Error('需要重新登录Pixiv站点才能开始搜索')
        requestRevision = this.authRevision.get(site) ?? 0
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
        if (response.status === 401 && sites[site].login) {
          await this.mutate(async () => {
            if (requestRevision !== (this.authRevision.get(site) ?? 0) || !this.verified.has(site)) return
            this.verified.delete(site); this.save()
          })
          void this.publish()
        }
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
