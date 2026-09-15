import type { Picture, SearchInput, VisualPage } from '../../shared/types'
import { showPreview } from './preview'
import { installControls } from './controls'

installControls()

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T
const value = (id: string): string => $<HTMLInputElement>(id).value
const checked = (id: string): boolean => $<HTMLInputElement>(id).checked
let toastTimer: ReturnType<typeof setTimeout>
function message(text: string, popup = true): void {
  $('status').textContent = text
  $('log-text').textContent += `${new Date().toLocaleTimeString()} ${text}\n`
  if (popup) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true }, 3500) }
}
function failure(error: unknown): void { message(String(error).replace(/^Error: Error invoking remote method '[^']+': Error: /, '')) }
const pending = (name: string): void => message(`${name}尚未迁移，将在后续阶段实现。`)
function button(label: string, action: () => void, title?: string): HTMLButtonElement {
  const element = document.createElement('button'); element.type = 'button'; element.textContent = label; element.onclick = action
  if (title) element.title = title
  return element
}

async function startBrowser(): Promise<void> {
  const settings = await window.moe.init()
  $<HTMLInputElement>('count').value = String(settings.count)
  $<HTMLInputElement>('size').value = String(settings.size)
  document.documentElement.style.setProperty('--picture-size', `${settings.size}px`)
  let pages: VisualPage[] = [], currentPage: VisualPage | undefined, visible: Picture[] = [], anchor = -1, busy = false, epoch = 0, hintEpoch = 0
  let activeKeyword = ''
  const selected = new Set<string>()
  const cards = new Map<string, HTMLElement>()
  const popup = $('search-popup'), menu = $('context-menu')
  const fitPopup = (): void => { if (popup.hidden) return; popup.style.left = '0'; const r = popup.getBoundingClientRect(); if (r.right > innerWidth - 10) popup.style.left = `${innerWidth - 10 - r.right}px` }
  new ResizeObserver(fitPopup).observe(popup)
  window.addEventListener('resize', fitPopup)
  const input = (): SearchInput => ({ keyword: value('keyword'), page: Number(value('start-page')), count: Number(value('count')), filterResolution: checked('filter-resolution'), minWidth: Number(value('min-width')), minHeight: Number(value('min-height')), orientation: Number(value('orientation')) as 0 | 1 | 2 })

  function selection(): void {
    for (const [key, card] of cards) { card.classList.toggle('selected', selected.has(key)); card.querySelector<HTMLInputElement>('input')!.checked = selected.has(key) }
    $('selection-actions').hidden = selected.size === 0
    $('selection-count').textContent = `已选择${selected.size}张（组）图片`
  }
  function choose(index: number, shift: boolean): void {
    const key = visible[index].key, add = !selected.has(key)
    if (add) selected.add(key); else selected.delete(key)
    if (add && shift && anchor >= 0 && anchor < visible.length) {
      for (let i = Math.min(anchor, index); i <= Math.max(anchor, index); i++) selected.add(visible[i].key)
    }
    anchor = index; selection()
  }
  function operate(action: string): void {
    for (const item of visible) {
      if (action === 'all') selected.add(item.key)
      else if (action === 'none') selected.delete(item.key)
      else if (action === 'invert') { if (selected.has(item.key)) selected.delete(item.key); else selected.add(item.key) }
    }
    selection()
  }
  function load(card: HTMLElement, item: Picture): Promise<void> {
    const image = card.querySelector<HTMLImageElement>('img')!
    if (card.classList.contains('loading')) return Promise.resolve()
    card.classList.remove('loaded', 'failed'); card.classList.add('loading'); card.querySelector('.image-status')!.textContent = '\uf110'
    return new Promise(resolve => {
      image.onload = () => {
        const canvas = card.querySelector<HTMLCanvasElement>('canvas')!
        canvas.width = card.clientWidth; canvas.height = card.clientHeight
        const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight)
        canvas.getContext('2d')?.drawImage(image, (canvas.width - image.naturalWidth * scale) / 2, (canvas.height - image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale)
        card.classList.remove('loading'); card.classList.add('loaded'); resolve()
      }
      image.onerror = () => { card.classList.remove('loading'); card.classList.add('failed'); card.querySelector('.image-status')!.textContent = '\uf127'; resolve() }
      image.src = `moe-image://picture/${item.key}/thumbnail?retry=${Date.now()}`
    })
  }
  async function loadImages(list: { card: HTMLElement; item: Picture }[]): Promise<void> {
    let next = 0
    await Promise.all(Array.from({ length: Math.min(8, list.length) }, async () => {
      while (next < list.length) { const job = list[next++]; if (job.card.isConnected) await load(job.card, job.item) }
    }))
  }
  function retryFailed(): void { void loadImages(visible.filter(item => !cards.get(item.key)!.classList.contains('loaded')).map(item => ({ item, card: cards.get(item.key)! }))) }
  function context(event: MouseEvent, item?: Picture): void {
    event.preventDefault(); menu.replaceChildren()
    if (!visible.length) return
    const row = document.createElement('div'); row.className = 'context-actions'
    const iconButton = (icon: string, label: string, action: () => void) => { const b = button(label, action); const i = document.createElement('i'); i.textContent = icon; b.prepend(i); return b }
    for (const [icon, label, action] of [['\uf560', '全选', 'all'], ['\uf05e', '全不选', 'none'], ['\uf074', '反选', 'invert']]) row.append(iconButton(icon, label, () => { operate(action); menu.hidden = true }))
    const actions = document.createElement('div'); actions.className = 'context-actions secondary'
    actions.append(iconButton('\uf2f9', '重试失败', () => { retryFailed(); menu.hidden = true }), iconButton('\uf019', '下载', () => pending('下载所选')))
    menu.append(row, actions)
    if (item) {
      for (const [name, text] of [['ID:', String(item.id)], ['Uploader:', item.author], ['UpID:', item.authorId], ['Date:', item.date]]) {
        if (!text) continue
        const row = document.createElement('div'); row.className = 'info-row'; row.textContent = name
        row.append(button(text, () => { void window.moe.copy(text).catch(failure) })); menu.append(row)
      }
      const tags = document.createElement('div'); tags.className = 'tag-list'
      tags.textContent = 'Tags:'
      for (const tag of item.tags) {
        const tagButton = button(tag, () => { void window.moe.copy(tag).catch(failure) }, '复制标签')
        tags.append(tagButton)
      }
      menu.append(tags)
      if (item.source) { const row = document.createElement('div'); row.className = 'info-row'; row.textContent = 'Source:'; row.append(button(item.source, () => { void window.moe.copy(item.source).catch(failure) })); menu.append(row) }
      if ([...selected].some(key => cards.get(key)?.classList.contains('failed'))) menu.append(button('刷新未加载的缩略图', () => { for (const picture of visible) if (selected.has(picture.key) && cards.get(picture.key)?.classList.contains('failed')) load(cards.get(picture.key)!, picture); menu.hidden = true }))
    }
    menu.hidden = false
    menu.style.left = `${Math.max(0, Math.min(event.clientX, innerWidth - menu.offsetWidth - 4))}px`
    menu.style.top = `${Math.max(0, Math.min(event.clientY, innerHeight - menu.offsetHeight - 28))}px`
  }
  function display(page: VisualPage): void {
    currentPage = page; selected.clear(); cards.clear(); anchor = -1
    visible = page.items.filter(i => !i.filtered)
    $('no-results').hidden = visible.length > 0 || !!page.error
    const container = $('pictures'); container.replaceChildren(); $('gallery').scrollTop = 0
    visible.forEach((item, index) => {
      const card = document.createElement('article'); card.className = `picture${item.viewed ? ' viewed' : ''}`; card.dataset.id = String(item.id)
      card.innerHTML = '<canvas class="image-backdrop" aria-hidden="true"></canvas><img draggable="false" alt="" /><span class="image-status"></span><span class="badge score"></span><span class="badge resolution"></span><span class="badge file-info"></span><span class="badge image-id"></span><input type="checkbox" /><div class="operations"></div>'
      const score = card.querySelector('.score')!, flame = document.createElement('i'); flame.textContent = '\uf06d'; score.append(flame, ` ${item.score}`)
      card.querySelector<HTMLElement>('.score')!.hidden = item.score === 0
      card.querySelector('.resolution')!.textContent = `${item.width} × ${item.height}`
      const ext = item.original.split('?')[0].split('.').at(-1) ?? ''
      card.querySelector('.file-info')!.textContent = `${ext.length < 5 ? ext : ''}${item.bytes ? ` ${item.bytes < 1048576 ? `${Math.round(item.bytes / 1024)}kB` : `${Math.round(item.bytes / 1048576 * 100) / 100}MB`}` : ''}`
      card.querySelector('.image-id')!.textContent = String(item.id)
      card.querySelector('input')!.setAttribute('aria-label', `选择图片 ${item.id}`)
      card.querySelector('img')!.setAttribute('alt', `图片 ${item.id}`)
      card.title = `${item.tags.join(' ')}\n${item.author}\n${item.viewed ? '已读' : ''}`
      const operations = card.querySelector('.operations')!
      for (const [icon, title, action] of [
        ['\uf2f9', '刷新', () => load(card, item)],
        ['\uf002', '预览图', () => { void window.moe.preview(item.key).catch(failure) }],
        ['\uf35d', '打开网页', () => { void window.moe.open(item.key).catch(failure) }],
        ['\uf019', '下载', () => pending('下载')]
      ] as const) { const b = button('', action, title); const i = document.createElement('i'); i.textContent = icon; b.append(i); operations.append(b) }
      card.onclick = event => { if ((event.target as HTMLElement).closest('button') || dragged) { dragged = false; return }; choose(index, event.shiftKey) }
      card.oncontextmenu = event => { event.stopPropagation(); context(event, item) }
      cards.set(item.key, card); container.append(card)
    })
    void loadImages(visible.map(item => ({ item, card: cards.get(item.key)! })))
    selection(); $('browse-controls').hidden = false
    $('pages').replaceChildren(...pages.map(p => {
      const b = button(String(p.firstPage), () => display(p), p.realPages.map(r => `第【${r.page}/】页: 本页图片（过滤前/过滤后）【${r.count}/${r.output}】张,图片范围（过滤前）【${r.start}~${r.end}】`).join('\n'))
      b.classList.toggle('current', p.index === page.index); return b
    }))
    $<HTMLButtonElement>('next').disabled = !!pages.at(-1)?.complete || busy
    $('site-status').textContent = `当前搜索：Konachan-G${activeKeyword ? `→"${activeKeyword}"` : ''}　本页共 ${page.items.length} 张，已读 ${page.items.filter(i => i.viewed).length} 张`
    const last = page.realPages.at(-1)
    if (last) message(`第${last.page}页获取到图片${last.count}张，条件过滤${last.count - last.output}张`, false)
    if (page.error) message(`搜索中断:${page.error}`)
  }
  function setBusy(on: boolean): void {
    busy = on; $('search').querySelector('span')!.textContent = on ? '停止' : '获取'; $('search').querySelector('i')!.textContent = on ? '\uf04d' : '\uf002'
    $<HTMLButtonElement>('next').disabled = on || !!pages.at(-1)?.complete
    $('search-message').textContent = on ? '正在获取图片…' : ''
  }
  async function search(next = false): Promise<void> {
    if (busy && !next) { epoch++; await window.moe.cancel().catch(failure); setBusy(false); message('搜索已停止', false); return }
    if (busy) return
    popup.hidden = true; menu.hidden = true; document.body.classList.add('has-search')
    const current = ++epoch; setBusy(true)
    try {
      if (!next) { activeKeyword = value('keyword'); pages = []; $('pictures').replaceChildren(); $('pages').replaceChildren(); selected.clear(); cards.clear(); visible = []; $('no-results').hidden = true; selection() }
      const result = await (next ? window.moe.next() : window.moe.search(input()))
      if (current !== epoch) return
      pages.push(result); display(result)
    } catch (error) { if (current === epoch) failure(error) }
    finally { if (current === epoch) setBusy(false) }
  }
  $<HTMLFormElement>('search-form').noValidate = true
  $('search-form').onsubmit = event => { event.preventDefault(); if (busy || $<HTMLFormElement>('search-form').reportValidity()) void search() }
  $('next').onclick = () => { void search(true) }
  const hints = async (): Promise<void> => {
    const version = ++hintEpoch
    $('hint-spinner').hidden = !value('keyword')
    try {
      const result = await window.moe.hints(value('keyword'))
      if (version !== hintEpoch) return
      $('hint-status').textContent = ''; $('hints').replaceChildren(...result.map(hint => {
        const b = button(hint.word, () => { $<HTMLInputElement>('keyword').value = hint.word; $<HTMLInputElement>('keyword').focus() })
        const count = document.createElement('b'); count.textContent = hint.count; b.append(count); return b
      }))
    } catch (error) { if (version === hintEpoch) { $('hints').replaceChildren(); $('hint-status').textContent = '关键词提示获取失败'; $('log-text').textContent += `${String(error)}\n` } }
    finally { if (version === hintEpoch) $('hint-spinner').hidden = true }
  }
  let hintTimer: ReturnType<typeof setTimeout>
  $('keyword').onfocus = () => { popup.hidden = false; void hints() }
  $('keyword').oninput = () => { clearTimeout(hintTimer); hintEpoch++; hintTimer = setTimeout(() => { void hints() }, 600) }
  $('parameters-toggle').onclick = () => { popup.hidden = !popup.hidden }
  $('filter-resolution').onchange = () => { $<HTMLInputElement>('min-width').disabled = $<HTMLInputElement>('min-height').disabled = !checked('filter-resolution') }
  $('count').onchange = () => { if ($<HTMLInputElement>('count').checkValidity()) void window.moe.count(Number(value('count'))).catch(failure) }
  $('proxy').onchange = () => { pending('代理设置'); $<HTMLSelectElement>('proxy').selectedIndex = 0 }
  $('gallery').oncontextmenu = event => context(event)
  $('size').oninput = () => { const size = Number(value('size')); document.documentElement.style.setProperty('--picture-size', `${size}px`); void window.moe.size(size).catch(failure) }
  $('size').onwheel = event => {
    event.preventDefault(); const size = Number(value('size')) - event.deltaY / 5
    if (size > 72 && size < 512) { $<HTMLInputElement>('size').value = String(size); $('size').dispatchEvent(new Event('input')) }
  }
  $('download-toggle').onclick = () => { $('downloads').hidden = !$('downloads').hidden; document.body.classList.toggle('downloads-open', !$('downloads').hidden) }
  $('collect-toggle').onclick = () => { $('collect').hidden = !$('collect').hidden }
  $('log-toggle').onclick = () => { $('log').hidden = !$('log').hidden }
  $('copy-collected').onclick = () => { void window.moe.copy(value('collected')).catch(failure) }
  $('clear-collected').onclick = () => { $<HTMLTextAreaElement>('collected').value = '' }
  $('export-selected').onclick = () => {
    for (const item of visible) if (selected.has(item.key)) $<HTMLTextAreaElement>('collected').value += `${value('quality') === '预览图' ? item.preview : item.original}\n`
    selected.clear(); selection(); message('已添加至收集箱')
  }
  $('logo').onclick = () => pending('原版彩蛋')
  document.addEventListener('click', event => {
    const target = event.target as HTMLElement
    const name = target.closest<HTMLElement>('[data-pending]')?.dataset.pending
    if (name) pending(name)
    const action = target.closest<HTMLElement>('[data-action]')?.dataset.action
    if (action) operate(action)
    if (!target.closest('#keyword-area')) popup.hidden = true
    if (!target.closest('#context-menu')) menu.hidden = true
  })
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { popup.hidden = true; menu.hidden = true }
    if ((event.target as HTMLElement).matches('input,textarea,select')) return
    if (event.ctrlKey && ['a', 'd', 'r'].includes(event.key.toLowerCase())) {
      event.preventDefault()
      if (event.key.toLowerCase() === 'a') operate('all')
      if (event.key.toLowerCase() === 'd' && selected.size) pending('下载所选')
      if (event.key.toLowerCase() === 'r') retryFailed()
    }
  })
  let drag: { x: number; y: number; startScroll: number; endX: number; endY: number } | undefined, dragged = false
  let scrollTimer: ReturnType<typeof setInterval> | undefined
  $('gallery').onpointerdown = event => {
    dragged = false
    if (event.button !== 0 || (event.target as HTMLElement).closest('button,input')) return
    drag = { x: event.clientX, y: event.clientY, startScroll: $('gallery').scrollTop, endX: event.clientX, endY: event.clientY }
  }
  $('gallery').onpointermove = event => {
    if (!drag) return
    if (!dragged && Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) < 4) return
    dragged = true; $('gallery').setPointerCapture(event.pointerId)
    drag.endX = event.clientX; drag.endY = event.clientY
    const left = Math.min(event.clientX, drag.x), top = Math.min(event.clientY, drag.y), right = Math.max(event.clientX, drag.x), bottom = Math.max(event.clientY, drag.y)
    const box = $('selection-box'); box.hidden = false; box.style.left = `${left}px`; box.style.top = `${top}px`; box.style.width = `${right - left}px`; box.style.height = `${bottom - top}px`
    if (!scrollTimer) scrollTimer = setInterval(() => { if (!drag) return; const r = $('gallery').getBoundingClientRect(); if (drag.endY < r.top) $('gallery').scrollTop -= 16; if (drag.endY > r.bottom) $('gallery').scrollTop += 16 }, 20)
  }
  $('gallery').onpointerup = event => {
    if (drag && dragged) {
      const y = drag.y - ($('gallery').scrollTop - drag.startScroll)
      const left = Math.min(drag.endX, drag.x), right = Math.max(drag.endX, drag.x), top = Math.min(drag.endY, y), bottom = Math.max(drag.endY, y)
      for (const [key, card] of cards) {
        const r = card.getBoundingClientRect()
        if ([[r.left, r.top], [r.right, r.top], [r.right, r.bottom], [r.left, r.bottom], [(r.left + r.right) / 2, (r.top + r.bottom) / 2]].some(([x, y]) => x > left && x < right && y > top && y < bottom)) {
          if (event.shiftKey || event.altKey) selected.delete(key); else selected.add(key)
        }
      }
      selection()
    }
    drag = undefined; clearInterval(scrollTimer); scrollTimer = undefined; $('selection-box').hidden = true
  }
  $('gallery').onpointercancel = () => { drag = undefined; clearInterval(scrollTimer); scrollTimer = undefined; $('selection-box').hidden = true }
}

if (location.hash.startsWith('#preview=')) {
  $('browser').hidden = true; $('preview').hidden = false
  void showPreview().catch(failure)
} else { void startBrowser().catch(failure) }
