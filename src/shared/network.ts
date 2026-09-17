import type { NetworkSettings, SiteId, ProxyMode, SiteDefinition } from './types'

export const sites: Record<string, SiteDefinition> = {
  safebooru: { name: 'Safebooru', home: 'https://safebooru.org', login: '', hosts: ['safebooru.org', 'www.safebooru.org'] },
  'konachan-g': { name: 'Konachan-G', home: 'https://konachan.net', login: '', hosts: ['konachan.net', 'www.konachan.net', 'konachan.com', 'www.konachan.com'] },
  pixiv: { name: 'Pixiv', home: 'https://www.pixiv.net', login: 'https://accounts.pixiv.net/login', hosts: ['www.pixiv.net', 'accounts.pixiv.net', 'i.pximg.net', 's.pximg.net'] }
}
export function validSite(value: unknown): value is SiteId { return typeof value === 'string' && Object.hasOwn(sites, value) }
export function allowedSiteUrl(value: string, site: SiteId): boolean {
  try {
    const u = new URL(value)
    return validSite(site) && (sites[site].custom ? ['http:', 'https:'].includes(u.protocol) : u.protocol === 'https:' && !u.port) && !u.username && !u.password && sites[site].hosts.includes(u.host)
  } catch { return false }
}
export function siteForUrl(value: string): SiteId {
  for (const site of Object.keys(sites) as SiteId[]) if (allowedSiteUrl(value, site)) return site
  throw new Error('站点资源地址不受支持')
}
export function proxyServer(address: string): string {
  if (typeof address !== 'string' || address.length > 2048) throw new Error('代理地址格式不正确，应类似于 127.0.0.1:1080 形式')
  const text = address.trim(), value = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`
  let u: URL
  try { u = new URL(value) } catch { throw new Error('代理地址格式不正确，应类似于 127.0.0.1:1080 形式') }
  if (!['http:', 'socks5:'].includes(u.protocol) || !u.hostname || !/:\d+\/?$/.test(value) || u.username || u.password || u.pathname !== '/' && u.pathname !== '' || u.search || u.hash || /[\s;,]/.test(text)) throw new Error('代理地址格式不正确，应类似于 127.0.0.1:1080 形式')
  const port = Number(u.port || (u.protocol === 'http:' ? 80 : 1080))
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('代理端口无效')
  return `${u.protocol}//${u.hostname}:${port}`
}
export function networkDefaults(): NetworkSettings {
  return { globalMode: 'none', proxyAddress: '127.0.0.1:1080', siteModes: Object.fromEntries(Object.keys(sites).map(site => [site, 'default'])) }
}
export function validateNetwork(value: unknown): NetworkSettings {
  if (!value || typeof value !== 'object') throw new Error('代理设置无效')
  const v = value as NetworkSettings, modes = ['none', 'custom', 'system']
  if (!modes.includes(v.globalMode) || !v.siteModes || !['default', ...modes].includes(v.siteModes['konachan-g']) || !['default', ...modes].includes(v.siteModes.pixiv)) throw new Error('代理模式无效')
  const siteModes: NetworkSettings['siteModes'] = Object.fromEntries(Object.entries(v.siteModes).filter(([id, mode]) => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id) && ['default', ...modes].includes(mode)))
  for (const site of Object.keys(sites)) {
    const mode = v.siteModes[site] === undefined ? 'default' : v.siteModes[site]
    if (!['default', ...modes].includes(mode)) throw new Error('代理模式无效')
    siteModes[site] = mode
  }
  proxyServer(v.proxyAddress)
  return { globalMode: v.globalMode, proxyAddress: v.proxyAddress.trim(), siteModes }

}
export function proxyConfig(settings: NetworkSettings, site: SiteId): { mode: 'direct' | 'system' | 'fixed_servers'; proxyRules?: string; proxyBypassRules?: string } {
  const mode: ProxyMode = settings.siteModes[site] === 'default' ? settings.globalMode : settings.siteModes[site]
  return mode === 'none' ? { mode: 'direct' } : mode === 'system' ? { mode: 'system' } : { mode: 'fixed_servers', proxyRules: proxyServer(settings.proxyAddress), proxyBypassRules: '<-loopback>' }
}
