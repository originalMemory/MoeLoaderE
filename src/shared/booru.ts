// Ported from MoeLoaderP: KonachanSite, MoeItem.LocalFilter, SearchSession and ViewedId (GPL-3.0).
import type { Picture, SearchInput, VisualPage } from './types'

export const home = 'https://konachan.net'
export function validateSearch(value: unknown): SearchInput {
  if (!value || typeof value !== 'object') throw new Error('搜索参数无效')
  const v = value as SearchInput
  if (typeof v.keyword !== 'string' || v.keyword.length > 1000 || typeof v.filterResolution !== 'boolean') throw new Error('搜索参数无效')
  for (const [key, min, max] of [['page', 1, 99999], ['count', 10, 500], ['minWidth', 1, 10000], ['minHeight', 1, 10000], ['orientation', 0, 2]] as const) {
    if (!Number.isInteger(v[key]) || v[key] < min || v[key] > max) throw new Error(`搜索参数 ${key} 越界`)
  }
  if (v.site !== undefined && v.site !== 'konachan-g' && v.site !== 'pixiv') throw new Error('站点无效')
  if (v.site === 'pixiv') {
    if (!['rank','tag','author'].includes(v.pixivMode ?? 'tag') || !['all','illust','manga','ugoira'].includes(v.pixivKind ?? 'illust') || !['daily','weekly','monthly','rookie','original','male','female'].includes(v.pixivPeriod ?? 'daily')) throw new Error('Pixiv 分类无效')
    if (v.pixivDate && (!/^\d{4}-\d{2}-\d{2}$/.test(v.pixivDate) || !Number.isFinite(new Date(v.pixivDate).getTime()) || new Date(v.pixivDate).toISOString().slice(0,10) !== v.pixivDate)) throw new Error('日期无效')
  }
  return { ...(v.site ? { site: v.site } : {}), ...(v.site === 'pixiv' ? { pixivMode:v.pixivMode ?? 'tag', pixivKind:v.pixivKind ?? 'illust', pixivPeriod:v.pixivPeriod ?? 'daily', pixivDate:v.pixivDate ?? '' } : {}), keyword: v.keyword, page: v.page, count: v.count, filterResolution: v.filterResolution, minWidth: v.minWidth, minHeight: v.minHeight, orientation: v.orientation }
}
export function query(input: SearchInput, page = input.page): string {
  return `${home}/post.json?${new URLSearchParams({ page: String(page), limit: String(input.count), tags: `${input.keyword} rating:safe` })}`
}
const text = (v: unknown): string => v == null ? '' : String(v)
const integer = (v: unknown): number => /^-?\d+$/.test(text(v)) && Number.isSafeInteger(Number(v)) ? Number(v) : 0
export function parsePictures(value: unknown, input: SearchInput, viewed: Viewed): Picture[] {
  if (!Array.isArray(value) || value.length > 5000) throw new Error('站点未返回有效图片列表')
  return value.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('图片条目格式无效')
    const r = raw as Record<string, unknown>
    const width = integer(r.width), height = integer(r.height), id = integer(r.id)
    if (id <= 0) throw new Error('图片 ID 无效')
    const nsfw = text(r.rating) !== 's'
    const seconds = integer(r.created_at)
    let date = text(r.created_at)
    const parsed = seconds > 0 && seconds <= 253402300799 ? new Date(seconds * 1000) : date ? new Date(date) : undefined
    if (parsed && Number.isFinite(parsed.getTime())) date = `${parsed.toISOString().slice(0, 10)} ${parsed.getUTCHours()}:${[parsed.getUTCMinutes(), parsed.getUTCSeconds()].map(n => String(n).padStart(2, '0')).join(':')}`
    const tags = text(r.tags).split(' ')
    while (tags.length && !tags[0].trim()) tags.shift()
    return {
      key: '', id, width, height, score: integer(r.score), author: text(r.author), authorId: text(r.creator_id), tags: tags.map(t => t.trim()), date,
      source: text(r.source), detail: `${home}/post/show/${id}`, thumbnail: text(r.preview_url), preview: text(r.sample_url), original: text(r.file_url), bytes: Math.max(0, integer(r.file_size)), nsfw,
      viewed: viewed.has(id), filtered: nsfw || (input.filterResolution && (width < input.minWidth || height < input.minHeight)) || (input.orientation === 1 && height >= width) || (input.orientation === 2 && height <= width)
    }
  }).map(item => { viewed.add(item.id); return item })
}

// Source stores the current run separately; IDs only become historical after reload.
export class Viewed {
  private ranges: [number, number][] = []
  private viewing: number[] = []
  constructor(encoded = '') {
    if (!encoded) return
    if (!encoded.includes(',')) {
      if (!/^\d+$/.test(encoded) || !Number.isSafeInteger(Number(encoded))) throw new Error('已读记录格式无效')
      this.ranges = [[0, Number(encoded)]]; return
    }
    let last = -1
    for (const part of encoded.split(';')) {
      // The original format uses signed deltas; accept old records without discarding their IDs.
      if (!/^-?\d+,\d+$/.test(part)) throw new Error('已读记录格式无效')
      const pair = part.split(',').map(Number)
      if (pair.some(v => !Number.isSafeInteger(v))) throw new Error('已读记录格式无效')
      const start = pair[0] + (last < 0 ? 0 : last)
      last = start + pair[1]
      if (start < 0 || !Number.isSafeInteger(start) || !Number.isSafeInteger(last)) throw new Error('已读记录格式无效')
      this.ranges.push([start, last])
    }
  }
  has(id: number): boolean { return this.ranges.some(([start, end]) => id >= start && id <= end) }
  add(id: number): void { if (!this.has(id)) this.viewing.push(id) }
  encode(): string {
    let first = this.ranges[0] ?? [0, 0]
    const values = this.ranges.slice(1).flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i)).concat(this.viewing).sort((a, b) => a - b)
    if (!values.length) return `${first[0]},${first[1] - first[0]}`
    let index = 0
    if (values.length > 1000) { first = [0, values[values.length - 1001]]; index = values.length - 1000 }
    let last = values[index], range = 0, trim = first[1]
    const parts = [`${first[0]},${first[1] - first[0]}`]
    for (let i = index + 1; i < values.length; i++) {
      if (i < values.length - 1 && values[i] === values[i + 1]) continue
      if (values[i] === last + range + 1) range++
      else if (values[i] !== last) { parts.push(`${last - trim},${range}`); trim = last + range; last = values[i]; range = 0 }
    }
    parts.push(`${last - trim},${range}`)
    return parts.join(';')
  }
}

export async function visualPage(input: SearchInput, next: number, index: number, offset: number, viewed: Viewed, get: (url: string) => Promise<unknown>, signal: AbortSignal): Promise<VisualPage> {
  const result: VisualPage = { index, firstPage: next, nextPage: next, complete: false, items: [], realPages: [] }
  let shown = 0
  while (shown < input.count) {
    signal.throwIfAborted()
    try {
      const response = await get(query(input, result.nextPage))
      signal.throwIfAborted()
      const items = parsePictures(response, input, viewed)
      const output = items.filter(i => !i.filtered).length
      result.realPages.push({ page: result.nextPage, count: items.length, output, start: offset + 1, end: offset + items.length })
      result.items.push(...items); shown += output; offset += items.length; result.nextPage++
      if (!items.length) { result.complete = true; break }
    } catch (error) {
      signal.throwIfAborted()
      result.error = error instanceof Error ? error.message : String(error)
      result.complete = true
      break
    }
  }
  return result
}
