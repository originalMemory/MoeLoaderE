export async function showPreview(): Promise<void> {
  const image = document.querySelector<HTMLImageElement>('#large-image')!
  const canvas = document.querySelector<HTMLElement>('#preview-canvas')!
  const loading = document.querySelector<HTMLProgressElement>('#preview-loading')!
  const retry = document.querySelector<HTMLButtonElement>('#preview-retry')!
  const item = await window.moe.previewItem()
  const unsubscribe = window.moe.onImageProgress(progress => {
    if (progress.key === item.key && progress.total > 0) { loading.max = progress.total; loading.value = progress.loaded }
  })
  window.addEventListener('unload', unsubscribe, { once: true })
  document.title = '预览'
  for (const [name, value] of [['作者', item.author], ['作品ID', item.id], ['评分', item.score], ['分辨率', `${item.width}x${item.height}`], ['日期', item.date]]) {
    const entry = document.createElement('span'), valueElement = document.createElement('b')
    entry.textContent = `${name}：`; valueElement.textContent = String(value); entry.append(valueElement)
    document.querySelector('#metadata')!.append(entry)
  }
  for (const tag of item.tags) {
    const button = document.createElement('button'); button.textContent = tag; button.title = '复制标签'
    button.onclick = () => { void window.moe.copy(tag) }; document.querySelector('#tags')!.append(button)
  }
  let width = 0, height = 0, x = 0, y = 0
  const paint = (): void => { image.style.width = `${width}px`; image.style.height = `${height}px`; image.style.left = `${x}px`; image.style.top = `${y}px` }
  const constrain = (): void => {
    if (height <= canvas.clientHeight) y = Math.max(0, Math.min(canvas.clientHeight - height, y))
    if (width <= canvas.clientWidth) x = Math.max(0, Math.min(canvas.clientWidth - width, x))
  }
  const fit = (): void => {
    const scale = Math.min(1, canvas.clientWidth / image.naturalWidth, canvas.clientHeight / image.naturalHeight)
    width = image.naturalWidth * scale; height = image.naturalHeight * scale
    x = (canvas.clientWidth - width) / 2; y = (canvas.clientHeight - height) / 2; paint()
  }
  image.onload = () => { loading.hidden = true; retry.hidden = true; image.hidden = false; fit() }
  image.onerror = () => { loading.hidden = true; image.hidden = true; retry.hidden = false; retry.textContent = '图片加载失败，重新加载' }
  const load = (): void => { loading.removeAttribute('value'); loading.hidden = false; retry.hidden = true; image.src = `moe-image://picture/${item.key}/preview?retry=${Date.now()}` }
  retry.onclick = load
  image.addEventListener('wheel', event => {
    event.preventDefault()
    const delta = -event.deltaY * (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? canvas.clientHeight : 1) / 500
    if ((delta > 0 && width > 2 * canvas.clientWidth) || (delta < 0 && width < canvas.clientWidth / 4) || delta <= -1) return
    const box = image.getBoundingClientRect(), mx = event.clientX - box.left, my = event.clientY - box.top
    width *= 1 + delta; height = width * image.naturalHeight / image.naturalWidth
    x -= delta * mx; y -= delta * my; constrain(); paint()
  }, { passive: false })
  let drag: { x: number; y: number; left: number; top: number } | undefined
  image.onpointerdown = event => { if (event.button !== 0) return; drag = { x: event.clientX, y: event.clientY, left: x, top: y }; image.setPointerCapture(event.pointerId) }
  image.onpointermove = event => { if (!drag) return; x = drag.left + event.clientX - drag.x; y = drag.top + event.clientY - drag.y; constrain(); paint() }
  image.onpointerup = () => { drag = undefined }
  image.onpointercancel = () => { drag = undefined }
  window.addEventListener('keydown', event => { if (event.key === 'Escape') window.close() })
  window.addEventListener('resize', () => { if (image.naturalWidth) { constrain(); paint() } })
  load()
}
