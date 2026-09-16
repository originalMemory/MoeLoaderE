import { nativeImage, shell } from 'electron'
import { readdir, open, mkdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { randomInt, randomUUID } from 'node:crypto'
import type { BackgroundImage } from '../shared/types'

export function backgroundLayout(filename: string): Pick<BackgroundImage, 'width' | 'height' | 'align'> {
  const layout: Pick<BackgroundImage, 'width' | 'height' | 'align'> = { width: 670, height: 530, align: 'right' }
  for (const part of basename(filename, extname(filename)).split(' ')) {
    const [key, value, extra] = part.split('=')
    if (extra !== undefined) continue
    if ((key === 'width' || key === 'height') && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0) layout[key] = Number(value)
    if (key === 'ha' && ['left', 'center', 'right'].includes(value)) layout.align = value as BackgroundImage['align']
  }
  return layout
}

export class BackgroundImages {
  private selected?: BackgroundImage
  private bytes?: Buffer
  private initialized = false
  private pending: Promise<void> = Promise.resolve()
  constructor(private directory: string) {}
  async get(): Promise<BackgroundImage | undefined> {
    if (!this.initialized) return this.change()
    await this.pending; return this.selected
  }
  change(): Promise<BackgroundImage | undefined> {
    this.initialized = true
    const operation = this.pending.then(() => this.select())
    this.pending = operation.then(() => {}, () => {})
    return operation
  }
  private async select(): Promise<BackgroundImage | undefined> {
    const entries = await readdir(this.directory, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error })
    const files = entries.filter(entry => entry.isFile() && extname(entry.name).toLowerCase() === '.png')
    while (files.length) {
      const file = files.splice(randomInt(files.length), 1)[0]
      try {
        const handle = await open(join(this.directory, file.name), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
        let bytes: Buffer
        try {
          const stat = await handle.stat()
          if (!stat.isFile() || stat.size > 40 * 1024 * 1024) continue
          bytes = await handle.readFile()
        } finally { await handle.close() }
        if (bytes.length > 40 * 1024 * 1024 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || nativeImage.createFromBuffer(bytes).isEmpty()) continue
        this.bytes = bytes
        this.selected = { url: `moe-image://background/${randomUUID()}`, ...backgroundLayout(file.name) }
        return this.selected
      } catch { /* Skip removed, unreadable or invalid local images. */ }
    }
    // Source leaves the current bitmap in place when the directory has no usable files.
    return this.selected
  }
  response(request: Request): Response {
    if (request.method !== 'GET' || request.url !== this.selected?.url || !this.bytes) return new Response(null, { status: 404 })
    return new Response(this.bytes as BodyInit, { headers: { 'content-type': 'image/png', 'cache-control': 'no-store' } })
  }
  async openDirectory(): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const error = await shell.openPath(this.directory)
    if (error) throw new Error(error)
  }
}
