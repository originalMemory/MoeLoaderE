import { allowedSiteUrl, validSite, sites } from '../shared/network.ts'
import type { DownloadSource, DownloadTask } from '../shared/types'
export const bundleSchema = 'MoeLoaderP.UnfinishedDownloadTasks'
export interface BundleTask { siteShortName: string; downloadUrl: string; referer?: string; detailUrl?: string; id: string; title?: string; localFileShortNameWithoutExt?: string; dlStatusAtExport?: string }
export interface DownloadBundle { schema: string; version: number; exportedAt: string; tasks: BundleTask[] }
export function parseBundle(text: string): DownloadBundle {
  if (Buffer.byteLength(text) > 8 * 1024 * 1024) throw new Error('任务包超过 8 MiB')
  const value = JSON.parse(text.replace(/^\uFEFF/, ''))
  if (!value || value.schema !== bundleSchema || value.version !== 1 || !Array.isArray(value.tasks)) throw new Error('不支持的任务包格式或版本')
  if (value.tasks.length > 10000) throw new Error('任务包超过 10000 条，请减少未完成任务或选择其他任务包文件')
  for (const task of value.tasks) {
    if (!task || typeof task !== 'object') throw new Error('任务记录无效')
    for (const key of ['siteShortName', 'downloadUrl', 'referer', 'detailUrl', 'id', 'title', 'localFileShortNameWithoutExt', 'dlStatusAtExport']) {
      if (task[key] != null && (typeof task[key] !== 'string' || task[key].length > 10000)) throw new Error('任务字段无效')
    }
  }
  return value
}
export function importSources(bundle: DownloadBundle, allowed: (url: string) => boolean): { sources: DownloadSource[]; errors: string[] } {
  const sources: DownloadSource[] = [], errors: string[] = []
  for (const [i, task] of bundle.tasks.entries()) {
    const site = task.siteShortName?.trim()
    if (!validSite(site)) { errors.push(`任务 ${i + 1}：站点不受支持`); continue }
    const url = task.downloadUrl?.trim() || '', referer = task.referer || sites[site].home
    if (!allowed(url) || !allowed(referer) || !allowedSiteUrl(url, site) || !allowedSiteUrl(referer, site)) { errors.push(`任务 ${i + 1}：资源地址不受支持`); continue }
    sources.push({ site, id: task.id || '', url, referer, detail: task.detailUrl || '', title: task.title ?? '', keyword: '', tags: [], name: task.localFileShortNameWithoutExt })
  }
  return { sources, errors }
}
export function exportBundle(tasks: DownloadTask[], existing?: DownloadBundle): DownloadBundle {
  const bundle: DownloadBundle = existing ? { ...existing, tasks: [...existing.tasks] } : { schema: bundleSchema, version: 1, exportedAt: '', tasks: [] }
  const keys = new Set(bundle.tasks.map(t => `${t.siteShortName}\0${t.downloadUrl}`))
  const statuses = { queued: 'WaitForDownload', downloading: 'Downloading', failed: 'Failed', stopped: 'Stop', cancelled: 'Cancel', success: 'Success', skip: 'Skip' }
  const append = (task: DownloadTask): void => {
    if (task.status === 'success' || task.status === 'skip') return
    if (task.children?.length) { task.children.forEach(append); return }
    const s = task.source, site = s.site ?? 'konachan-g', key = `${site}\0${s.url}`
    if (keys.has(key)) return
    keys.add(key)
    bundle.tasks.push({ siteShortName: site, downloadUrl: s.url, referer: s.referer, detailUrl: s.detail, id: String(s.id), title: s.title,
      localFileShortNameWithoutExt: task.name.replace(/\.[^.]+$/, ''), dlStatusAtExport: statuses[task.status] })
  }
  tasks.forEach(append); bundle.exportedAt = new Date().toISOString()
  // Validate the exact payload before the caller writes it or permits closing.
  parseBundle(JSON.stringify(bundle))
  return bundle
}
