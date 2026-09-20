// Ported from MoeDownloader / MoeItem (GPL-3.0); filesystem commits are exclusive.
import { mkdir, open, link, unlink, realpath, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, isAbsolute, sep } from 'node:path'
import { sites } from '../shared/network.ts'
import { randomUUID } from 'node:crypto'
import type { DownloadSettings, DownloadSource, DownloadTask, DownloadAction, SiteId } from '../shared/types'

export function downloadDefaults(directory: string): DownloadSettings {
  return { directory, concurrency: 3, fileTemplate: '%site %id %title', folderTemplate: '%site\\%title', autoRename: false, tagCount: 0, firstOnly: false, firstCount: 1 }
}
export function validateDownloadSettings(value: unknown, directory: string): DownloadSettings {
  if (!value || typeof value !== 'object') throw new Error('下载设置无效')
  const v = value as DownloadSettings
  for (const [key, min, max] of [['concurrency', 1, 16], ['tagCount', 0, 1000], ['firstCount', 1, 10000]] as const) {
    if (!Number.isInteger(v[key]) || v[key] < min || v[key] > max) throw new Error('下载设置数值越界')
  }
  for (const key of ['fileTemplate', 'folderTemplate'] as const) if (typeof v[key] !== 'string' || v[key].length > 1000) throw new Error('命名模板无效')
  if (typeof v.autoRename !== 'boolean' || typeof v.firstOnly !== 'boolean') throw new Error('下载设置无效')
  return { directory, concurrency: v.concurrency, fileTemplate: v.fileTemplate, folderTemplate: v.folderTemplate, autoRename: v.autoRename, tagCount: v.tagCount, firstOnly: v.firstOnly, firstCount: v.firstCount }
}
function clean(value: string): string {
  const safe = value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '')
  if (!safe || safe === '.' || safe === '..') return '_'
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe) ? `_${safe}` : safe
}
export function filePath(source: DownloadSource, settings: DownloadSettings, index = 0, parent = source): string {
  const original = decodeURIComponent(basename(new URL(source.url).pathname))
  const extension = extname(original).toLowerCase()
  if (!/^\.[a-z0-9]{1,4}$/.test(extension)) throw new Error('下载地址缺少有效文件扩展名')
  const tokens: Record<string, string> = {
    site: parent.site ?? 'konachan-g', sitedispname: sites[parent.site ?? 'konachan-g'].name, id: String(parent.id), keyword: parent.keyword || 'no-keyword',
    title: parent.title ?? 'no-title', uploader: parent.author ?? 'no-uploader', upid: parent.authorId ?? 'no-uploader-id',
    uploader_id: parent.authorId ?? 'no-uploader-id', date: parent.date ?? 'no-date',
    origin: original.slice(0, -extension.length), tag: (settings.tagCount ? parent.tags.slice(0, settings.tagCount) : parent.tags).map(t => `${t} `).join(''),
    character: 'no-character', artist: 'no-artist', copyright: 'no-copyright'
  }
  const format = (text: string): string => text.replace(/%(sitedispname|site|uploader_id|uploader|upid|keyword|copyright|character|artist|origin|title|date|tag|id)/g, (_m, key: string) => clean(tokens[key]))
  const folder = (settings.folderTemplate || '%site').split(/[\\/]/).map(part => clean(format(part)))
  let name = source.name || format(settings.fileTemplate || '%site %id')
  if (index) name += ` p${index}`
  name = clean(name)
  // Match MoeLoaderP's Samba-safe 240-byte limit, including the extension.
  while (Buffer.byteLength(name + extension) > 240) name = [...name].slice(0, -1).join('')
  return join(settings.directory, ...folder, name + extension)
}
const complete = (task: DownloadTask): boolean => task.status === 'success' || task.status === 'skip'
export class DownloadQueue {
  tasks: DownloadTask[] = []
  settings: DownloadSettings
  private active = new Map<string, AbortController>()
  private changed: () => void
  private request: (url: string, signal: AbortSignal, referer: string, site?: SiteId) => Promise<Response>
  constructor(settings: DownloadSettings, request: (url: string, signal: AbortSignal, referer: string, site?: SiteId) => Promise<Response>, changed: () => void) {
    this.settings = settings; this.request = request; this.changed = changed
  }
  add(sources: DownloadSource[]): DownloadTask[] {
    const make = (source: DownloadSource, index = 0, parent = source): DownloadTask => ({
      id: randomUUID(), source: structuredClone(source), path: source.children?.length ? '' : filePath(source, this.settings, index, parent),
      name: source.children?.length ? `多张图片${source.title ? `(${source.title})` : ''}` : basename(filePath(source, this.settings, index, parent)),
      status: 'queued', text: '等待下载', loaded: 0, total: 0, progress: 0, autoRename: this.settings.autoRename, root: this.settings.directory,
      children: source.children?.slice(0, this.settings.firstOnly ? this.settings.firstCount : undefined).map((child, i) => make(child, i + 1, source))
    })
    const added = sources.map(source => make(source))
    this.tasks.push(...added); this.changed(); this.pump(); return added
  }
  unfinished(): DownloadTask[] { return this.tasks.filter(task => !complete(task)) }
  action(action: DownloadAction, ids: string[]): void {
    const chosen = this.tasks.filter(task => ids.includes(task.id))
    if (action === 'clear') this.tasks = this.tasks.filter(task => !complete(task))
    if (action === 'clear-success-retry-failed') {
      this.tasks = this.tasks.filter(task => !complete(task))
      for (const task of this.tasks) if (task.status === 'failed') { task.status = 'queued'; task.text = '等待下载'; task.loaded = 0; task.progress = 0 }
    }
    for (const task of chosen) {
      if (action === 'remove') { this.active.get(task.id)?.abort(); task.status = 'cancelled'; this.tasks = this.tasks.filter(t => t !== task) }
      if (action === 'stop' && ['queued', 'downloading'].includes(task.status)) { task.status = 'stopped'; task.text = '已停止'; this.active.get(task.id)?.abort() }
      if (action === 'retry' && !complete(task)) {
        this.active.get(task.id)?.abort(); task.status = 'queued'; task.text = '等待下载'; task.loaded = 0; task.progress = 0
      }
    }
    this.changed(); this.pump()
  }
  async stopAll(): Promise<void> {
    this.action('stop', this.tasks.map(t => t.id))
    while (this.active.size) await new Promise(resolve => setTimeout(resolve, 10))
  }
  pump(): void {
    for (const task of this.tasks) {
      if (this.active.size >= this.settings.concurrency) break
      if (task.status !== 'queued' || this.active.has(task.id)) continue
      const controller = new AbortController(); this.active.set(task.id, controller)
      task.status = 'downloading'; task.text = '正在下载'; this.changed()
      void this.run(task, controller.signal).catch(error => {
        if (!controller.signal.aborted) { task.status = 'failed'; task.text = `下载失败：${error instanceof Error ? error.message : String(error)}`; this.changed() }
      }).finally(() => { this.active.delete(task.id); this.pump() })
    }
  }
  private async run(task: DownloadTask, signal: AbortSignal): Promise<void> {
    if (!task.children?.length) { await this.single(task, signal); return }
    for (const [i, child] of task.children.entries()) {
      signal.throwIfAborted()
      task.text = `正在下载 ${i + 1} / ${task.children.length} 张`; this.changed()
      if (!complete(child)) {
        try { await this.single(child, signal) }
        catch (error) { signal.throwIfAborted(); child.status = 'failed'; child.text = String(error) }
      }
      task.progress = (i + 1) / task.children.length * 100; this.changed()
    }
    signal.throwIfAborted()
    const failed = task.children.filter(child => !complete(child)).length
    task.status = failed ? 'failed' : 'success'
    task.text = failed ? `${task.children.length - failed}张成功，失败${failed}张` : `${task.children.length} 张下载完成`
    this.changed()
  }
  private async single(task: DownloadTask, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    await mkdir(task.root, { recursive: true })
    const root = await realpath(task.root)
    let directory = root
    for (const part of relative(task.root, dirname(task.path)).split(sep).filter(Boolean)) {
      if (part === '..') throw new Error('下载目录超出保存目录')
      directory = join(directory, part)
      await mkdir(directory, { recursive: false }).catch(error => { if (error.code !== 'EEXIST') throw error })
      directory = await realpath(directory)
      const rel = relative(root, directory)
      if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('下载目录超出保存目录')
    }
    const exists = await stat(task.path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error })
    signal.throwIfAborted()
    if (exists && !task.autoRename) { task.status = 'skip'; task.text = '已存在，跳过'; this.changed(); return }
    const temp = join(directory, `.moeloader-${randomUUID()}.part`)
    task.status = 'downloading'
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        signal.throwIfAborted()
        const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(500_000)])
        let file: Awaited<ReturnType<typeof open>> | undefined
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
        try {
          const response = await this.request(task.source.url, requestSignal, task.source.referer, task.source.site)
          if (!response.ok || !/^image\/(jpeg|png|gif|webp|avif)(;|$)/i.test(response.headers.get('content-type') || '')) {
            await response.body?.cancel(); throw new Error(`无效图片响应 (${response.status})`)
          }
          reader = response.body?.getReader(); if (!reader) throw new Error('响应为空')
          file = await open(temp, 'wx')
          task.loaded = 0; task.total = Number(response.headers.get('content-length')) || 0
          let notified = 0
          for (;;) {
            requestSignal.throwIfAborted()
            const { done, value } = await reader.read(); if (done) break
            await file.writeFile(value); task.loaded += value.byteLength
            task.progress = task.total ? Math.min(99, task.loaded / task.total * 100) : 0
            task.text = task.total ? `正在下载：${Math.round(task.progress)}%` : `正在下载：${Math.round(task.loaded / 1024)}kB`
            if (Date.now() - notified > 100) { notified = Date.now(); this.changed() }
          }
          if (!task.loaded || (task.total && task.loaded !== task.total)) throw new Error('图片数据不完整')
          await file.sync(); await file.close(); file = undefined
          signal.throwIfAborted()
          const desired = join(directory, basename(task.path)), extension = extname(desired), stem = desired.slice(0, -extension.length)
          for (let suffix = 1; ; suffix++) {
            signal.throwIfAborted()
            const target = suffix === 1 ? desired : `${stem}-${suffix}${extension}`
            try { await link(temp, target); task.path = target; task.name = basename(target); break }
            catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
              if (!task.autoRename) { await unlink(temp); task.status = 'skip'; task.text = '已存在，跳过'; this.changed(); return }
            }
          }
          await unlink(temp)
          // Once published, this file is complete even if cancellation arrives immediately afterwards.
          task.status = 'success'; task.progress = 100; task.text = '下载完成'; this.changed(); return
        } catch (error) {
          signal.throwIfAborted()
          if (attempt === 2) throw error
        } finally {
          await reader?.cancel().catch(() => {})
          await file?.close()
          await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error })
        }
      }
    } finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error }) }
  }
}

export function taskbarProgress(tasks: DownloadTask[]): { value: number; mode: 'none' | 'normal' | 'error' } {
  if (!tasks.length) return { value: -1, mode: 'none' }
  if (tasks.some(task => task.status === 'downloading')) return { value: tasks.reduce((sum, task) => sum + Math.min(100, Math.max(0, task.progress)), 0) / tasks.length / 100, mode: 'normal' }
  if (tasks.some(task => task.status === 'failed')) return { value: 1, mode: 'error' }
  if (tasks.every(complete)) return { value: 1, mode: 'normal' }
  return { value: -1, mode: 'none' }
}
