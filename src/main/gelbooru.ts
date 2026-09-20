import { JSDOM } from 'jsdom'
import type { Picture } from '../shared/types'

export function resolveGelbooru(item: Picture, html: string): Picture {
  const dom = new JSDOM(html, { url: item.detail })
  try {
    const value = (className: string): string => dom.window.document.evaluate(`//li[contains(concat(' ', normalize-space(@class), ' '), ' ${className} ')]/a[2]`, dom.window.document, null, 9, null).singleNodeValue?.textContent?.trim() ?? ''
    return { ...item, artist: value('tag-type-artist'), character: value('tag-type-character'), copyright: value('tag-type-copyright'), detailsLoaded: true }
  } finally { dom.window.close() }
}
