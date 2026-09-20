import { JSDOM } from 'jsdom'

export function parseDanbooruHints(html: string): { word: string; count: string }[] {
  const dom = new JSDOM(html)
  try {
    return [...dom.window.document.querySelectorAll('.ui-menu-item-wrapper')].slice(0,20).flatMap(item => {
      let word = item.querySelector('a')?.textContent?.trim().replace(/\\[rnb]/g, '') ?? ''
      if (word.includes('→')) word = word.slice(word.indexOf('→') + 1).trim()
      word = word.replace(/\s+/g, '_')
      return word ? [{ word, count: item.querySelector('.post-count')?.textContent?.trim() ?? '' }] : []
    })
  } finally { dom.window.close() }
}
