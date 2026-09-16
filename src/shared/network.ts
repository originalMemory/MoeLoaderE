import type { NetworkSettings, SiteId, ProxyMode } from './types'

export const sites = {
  'konachan-g': { name: 'Konachan-G', home: 'https://konachan.net', login: '', hosts: ['konachan.net', 'www.konachan.net', 'konachan.com', 'www.konachan.com'] },
  pixiv: { name: 'Pixiv', home: 'https://www.pixiv.net', login: 'https://accounts.pixiv.net/login', hosts: ['www.pixiv.net', 'accounts.pixiv.net', 'i.pximg.net', 's.pximg.net'] }
} as const
export function validSite(value: unknown): value is SiteId { return value === 'konachan-g' || value === 'pixiv' }
export function allowedSiteUrl(value: string, site: SiteId): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && (sites[site].hosts as readonly string[]).includes(u.hostname)
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
  return { globalMode: 'none', proxyAddress: '127.0.0.1:1080', siteModes: { 'konachan-g': 'default', pixiv: 'default' } }
}
export function validateNetwork(value: unknown): NetworkSettings {
  if (!value || typeof value !== 'object') throw new Error('代理设置无效')
  const v = value as NetworkSettings, modes = ['none', 'custom', 'system']
  if (!modes.includes(v.globalMode) || !v.siteModes || !['default', ...modes].includes(v.siteModes['konachan-g']) || !['default', ...modes].includes(v.siteModes.pixiv)) throw new Error('代理模式无效')
  proxyServer(v.proxyAddress)
  return { globalMode: v.globalMode, proxyAddress: v.proxyAddress.trim(), siteModes: { 'konachan-g': v.siteModes['konachan-g'], pixiv: v.siteModes.pixiv } }
}
export function proxyConfig(settings: NetworkSettings, site: SiteId): { mode: 'direct' | 'system' | 'fixed_servers'; proxyRules?: string; proxyBypassRules?: string } {
  const mode: ProxyMode = settings.siteModes[site] === 'default' ? settings.globalMode : settings.siteModes[site]
  return mode === 'none' ? { mode: 'direct' } : mode === 'system' ? { mode: 'system' } : { mode: 'fixed_servers', proxyRules: proxyServer(settings.proxyAddress), proxyBypassRules: '<-loopback>' }
}
