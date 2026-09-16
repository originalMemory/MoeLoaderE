import type { DownloadAction, DownloadSettings, DownloadSnapshot, DownloadTask } from '../../shared/types'

export async function installDownloads(report: (text: string) => void): Promise<(keys: string[], quality: string) => Promise<boolean>> {
  const panel = document.querySelector<HTMLElement>('#downloads')!, list = document.querySelector<HTMLElement>('#download-list')!
  const menu = document.querySelector<HTMLElement>('#download-menu')!, settingsPopup = document.querySelector<HTMLElement>('#settings-popup')!
  const settingsControl = document.querySelector<HTMLElement>('#download-settings')!, settingsToggle = document.querySelector<HTMLButtonElement>('#settings-toggle')!
  const selected = new Set<string>(), rows = new Map<string, HTMLElement>()
  let tasks: DownloadTask[] = [], settings: DownloadSettings, anchor = -1, focusedId: string | undefined
  const fail = (error: unknown): void => report(String(error))
  const show = (): void => { panel.hidden = false; document.body.classList.add('downloads-open') }
  const selection = (): void => {
    for (const [id, row] of rows) { row.classList.toggle('selected', selected.has(id)); row.setAttribute('aria-selected', String(selected.has(id))); row.tabIndex = id === (focusedId ?? tasks[0]?.id) ? 0 : -1 }
    list.tabIndex = tasks.length ? -1 : 0
  }
  const choose = (index: number, extend: boolean, toggle: boolean): void => {
    if (extend) {
      if (anchor < 0) anchor = Math.max(0, tasks.findIndex(task => task.id === [...selected].at(-1)))
      if (!toggle) selected.clear()
      for (let i = Math.min(anchor, index); i <= Math.max(anchor, index); i++) selected.add(tasks[i].id)
    } else {
      const id = tasks[index].id
      if (toggle) { if (selected.has(id)) selected.delete(id); else selected.add(id) }
      else { selected.clear(); selected.add(id) }
      anchor = index
    }
    selection()
  }
  const icons = { queued: '\uf252', downloading: '\uf04b', stopped: '\uf04d', failed: '\uf00d', success: '\uf00c', skip: '\uf04e', cancelled: '\uf069' }
  const render = (snapshot: DownloadSnapshot): void => {
    const anchorId = tasks[anchor]?.id
    tasks = snapshot.tasks; anchor = tasks.findIndex(task => task.id === anchorId)
    if (!tasks.some(task => task.id === focusedId)) focusedId = undefined
    if (!settings || settingsPopup.hidden) settings = snapshot.settings
    for (const [id, row] of rows) if (!tasks.some(task => task.id === id)) { row.remove(); rows.delete(id); selected.delete(id) }
    if (anchor >= tasks.length) anchor = -1
    for (const task of tasks) {
      let row = rows.get(task.id)
      if (!row) {
        row = document.createElement('div'); row.className = 'download-row'; row.tabIndex = 0; row.role = 'option'; row.dataset.id = task.id
        row.innerHTML = '<progress max="100"></progress><span class="download-thumbnail"><img alt="" /></span><strong></strong><i></i><span class="download-status"></span>'
        const image = row.querySelector('img')!
        if (task.source.picture) image.src = `moe-image://picture/${task.source.picture.key}/thumbnail`; else image.hidden = true
        row.onfocus = () => { focusedId = task.id; selection() }
        row.onclick = event => choose(tasks.findIndex(t => t.id === task.id), event.shiftKey, event.ctrlKey || event.metaKey)
        row.oncontextmenu = event => {
          if (event.shiftKey || event.ctrlKey || event.metaKey) return
          anchor = tasks.findIndex(t => t.id === task.id)
          if (!selected.has(task.id)) choose(anchor, false, false)
          row!.focus()
        }
        rows.set(task.id, row); list.append(row)
      }
      row.dataset.status = task.status; row.title = task.children?.length ? task.name : task.name.replace(/\.[^.]+$/, '')
      row.querySelector('strong')!.textContent = task.children?.length ? task.name : task.name.replace(/\.[^.]+$/, '')
      row.querySelector('i')!.textContent = icons[task.status]
      row.querySelector('.download-status')!.textContent = task.text
      row.querySelector('progress')!.value = task.progress
      row.setAttribute('aria-label', `${task.name} ${task.text}`)
      if (task.children?.length) {
        let children = row.querySelector<HTMLElement>('.download-children')
        if (!children) { children = document.createElement('div'); children.className = 'download-children'; row.append(children) }
        while (children.children.length < task.children.length) {
          const child = document.createElement('div'); child.className = 'download-subitem'
          child.innerHTML = '<svg class="branch-mark" viewBox="0 -4 10 22" aria-hidden="true"><path d="M1.0890278,-3.4839403 C0.94120593,14.046875 2.1804033,14.218884 9.037,14.000904 M6.6880001,11.782 L9.2928118,14.003873 6.6884999,16.573" fill="none" stroke="black" stroke-width="1.5" /></svg><progress max="100"></progress><b></b><i></i><span class="subitem-name"></span>'
          children.append(child)
        }
        task.children.forEach((task, index) => {
          const child = children!.children[index] as HTMLElement
          child.dataset.status = task.status; child.title = `${task.name}\n${task.text}`
          child.querySelector('progress')!.value = task.progress; child.querySelector('b')!.textContent = String(index + 1)
          child.querySelector('i')!.textContent = icons[task.status]; child.querySelector('.subitem-name')!.textContent = task.name.replace(/\.[^.]+$/, '')
        })
      }
    }
    selection()
  }
  const unsubscribe = window.moe.onDownloads(render)
  window.addEventListener('unload', unsubscribe, { once: true })
  render(await window.moe.downloads())
  panel.onkeydown = event => {
    if (event.altKey) return
    const control = event.ctrlKey || event.metaKey
    if (control && event.key.toLowerCase() === 'a') {
      event.preventDefault(); event.stopPropagation(); tasks.forEach(task => selected.add(task.id)); selection(); return
    }
    if (!tasks.length || !['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', ' '].includes(event.key)) return
    event.preventDefault(); event.stopPropagation()
    let index = tasks.findIndex(task => task.id === (event.target as HTMLElement).closest<HTMLElement>('.download-row')?.dataset.id)
    if (event.key === 'ArrowDown') index++
    else if (event.key === 'ArrowUp') index--
    else if (event.key === 'Home') index = 0
    else if (event.key === 'End') index = tasks.length - 1
    else if (event.key === 'PageUp' || event.key === 'PageDown') {
      const direction = event.key === 'PageDown' ? 1 : -1
      const top = rows.get(tasks[Math.max(0, index)].id)!.offsetTop + direction * list.clientHeight
      const next = tasks.findIndex(task => rows.get(task.id)!.offsetTop >= top)
      index = next < 0 ? tasks.length - 1 : next
    }
    index = Math.max(0, Math.min(tasks.length - 1, index))
    if (event.key === ' ' || !control || event.shiftKey) choose(index, event.shiftKey, control)
    const row = rows.get(tasks[index].id)!
    row.focus({ preventScroll: true }); row.scrollIntoView({ block: 'nearest' })
  }
  panel.oncontextmenu = event => {
    event.preventDefault(); menu.hidden = false
    menu.style.left = `${Math.max(4, Math.min(event.clientX + 10, innerWidth - menu.offsetWidth - 4))}px`
    menu.style.top = `${Math.max(4, Math.min(event.clientY - 1, innerHeight - menu.offsetHeight - 4))}px`
  }
  document.addEventListener('click', event => { if (!menu.contains(event.target as Node)) menu.hidden = true })
  document.addEventListener('keydown', event => { if (event.key === 'Escape') menu.hidden = true })
  const importFile = async (file: File): Promise<void> => {
    if (!file.name.toLowerCase().endsWith('.mlpub') || file.size > 8 * 1024 * 1024) throw new Error('请选择不超过 8 MiB 的 .mlpub 任务包')
    const result = await window.moe.importDownloads(await file.text())
    report(`已加入 ${result.added} 个下载任务。${result.errors.length ? `\n${result.errors.slice(0, 8).join('\n')}` : ''}`)
  }
  panel.ondragover = event => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy' }
  panel.ondrop = event => { event.preventDefault(); void (async () => { for (const file of event.dataTransfer?.files ?? []) await importFile(file) })().catch(fail) }
  const fields = (): NodeListOf<HTMLInputElement> => settingsControl.querySelectorAll<HTMLInputElement>('input[name]')
  const updateFirstCount = (): void => {
    const enabled = settingsControl.querySelector<HTMLInputElement>('[name=firstOnly]')!.checked
    settingsControl.querySelector<HTMLInputElement>('[name=firstCount]')!.disabled = !enabled
    document.querySelector('#first-count-text')!.textContent = settingsControl.querySelector<HTMLInputElement>('[name=firstCount]')!.value
  }
  const fillSettings = (): void => {
    for (const field of fields()) {
      const value = settings[field.name as keyof DownloadSettings]
      if (field.type === 'checkbox') field.checked = value as boolean; else field.value = String(value)
    }
    updateFirstCount()
  }
  let saving = Promise.resolve()
  const saveSettings = (): void => {
    const next = { ...settings }
    for (const field of fields()) {
      if (field.name === 'directory') continue
      if (!field.checkValidity()) { field.reportValidity(); return }
      Object.assign(next, { [field.name]: field.type === 'checkbox' ? field.checked : field.type === 'number' ? Number(field.value) : field.value })
    }
    settings = next; updateFirstCount()
    saving = saving.then(() => window.moe.downloadSettings(next)).catch(fail)
  }
  const positionSettings = (): void => {
    const anchor = settingsToggle.getBoundingClientRect()
    // Source Popup: HorizontalOffset=-235; shadow margin=10; border padding=6.
    settingsPopup.style.left = `${Math.max(4, Math.min(anchor.left - 225, innerWidth - settingsPopup.offsetWidth - 4))}px`
    settingsPopup.style.top = `${anchor.bottom + 10}px`
    settingsPopup.style.maxHeight = `${Math.max(80, innerHeight - anchor.bottom - 14)}px`
  }
  const closeSettings = (): void => {
    if (settingsPopup.hidden) return
    if (settingsPopup.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
    settingsPopup.hidden = true; settingsToggle.setAttribute('aria-expanded', 'false')
  }
  settingsToggle.onclick = () => {
    if (!settingsPopup.hidden) { closeSettings(); return }
    fillSettings(); settingsPopup.hidden = false; settingsToggle.setAttribute('aria-expanded', 'true'); positionSettings()
  }
  document.addEventListener('pointerdown', event => { if (!settingsPopup.contains(event.target as Node) && !settingsToggle.contains(event.target as Node)) closeSettings() })
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeSettings() })
  window.addEventListener('resize', () => { if (!settingsPopup.hidden) positionSettings() })
  settingsControl.addEventListener('change', event => {
    if ((event.target as HTMLInputElement).name?.endsWith('Template')) return
    saveSettings()
  })
  const renamePairs = [['站点缩略名','%site'],['站点显示名','%sitedispname'],['搜索关键字','%keyword'],['作品ID','%id'],['作者ID','%upid'],['作者','%uploader'],['标题','%title'],['标签','%tag'],['日期','%date'],['原始文件名','%origin'],['作品名','%copyright'],['角色名','%character'],['画师名','%artist']]
  for (const name of ['folderTemplate', 'fileTemplate']) {
    const field = settingsControl.querySelector<HTMLInputElement>(`[name="${name}"]`)!, tokens = settingsControl.querySelector<HTMLElement>(`[data-template="${name}"]`)!
    for (const [label, value] of renamePairs) {
      const button = document.createElement('button'); button.textContent = label; button.title = value; button.tabIndex = -1
      button.onpointerdown = event => event.preventDefault()
      button.onclick = () => { const start = field.selectionStart ?? field.value.length; field.value = field.value.slice(0, start) + value + field.value.slice(start); field.setSelectionRange(start + value.length, start + value.length) }
      tokens.append(button)
    }
    field.onfocus = () => { tokens.hidden = false }
    field.onblur = () => {
      tokens.hidden = true
      const before = field.value, invalid = name === 'folderTemplate' ? /[<>:"/|?*\x00-\x1f]/g : /[<>:"/\\|?*\x00-\x1f]/g
      field.value = before.trim().replace(invalid, '')
      if (field.value !== before.trim()) report(name === 'folderTemplate' ? '路径名包含非法字符，已自动去除' : '文件名包含非法字符，已自动去除')
      saveSettings()
    }
    settingsControl.querySelector<HTMLButtonElement>(`[data-reset-template="${name}"]`)!.onclick = () => { field.value = name === 'folderTemplate' ? '%site\\%title' : '%site %id %title'; saveSettings() }
  }
  for (const group of settingsPopup.querySelectorAll<HTMLElement>('[data-settings-pending]')) {
    for (const field of group.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input:not(#acrylic-enabled),select')) {
      const value = field.value, checked = field instanceof HTMLInputElement && field.checked
      field.title ||= `${group.dataset.settingsPending}尚未迁移，将在后续阶段实现。`
      field.addEventListener('change', () => { field.value = value; if (field instanceof HTMLInputElement) field.checked = checked; report(`${group.dataset.settingsPending}尚未迁移，将在后续阶段实现。`) }, true)
    }
  }
  for (const element of document.querySelectorAll<HTMLButtonElement>('[data-download-action]')) element.onclick = () => {
    menu.hidden = true
    void (async () => {
      const action = element.dataset.downloadAction!
      if (action === 'all') { tasks.forEach(task => selected.add(task.id)); selection() }
      else if (action === 'export') { if (await window.moe.exportDownloads()) report('未成功任务导出完成') }
      else if (action === 'reveal') { const id = selected.values().next().value; if (id) await window.moe.revealDownload(id) }
      else await window.moe.downloadAction((action === 'start-all' ? 'retry' : action === 'stop-all' ? 'stop' : action) as DownloadAction, action.endsWith('-all') ? tasks.map(t => t.id) : [...selected])
    })().catch(fail)
  }
  document.querySelector<HTMLButtonElement>('#download-directory')!.onclick = () => {
    void window.moe.downloadDirectory().then(path => { if (path) { settings.directory = path; settingsControl.querySelector<HTMLInputElement>('[name=directory]')!.value = path } }).catch(fail)
  }
  return async (keys, quality) => {
    if (!keys.length) return false
    try { const count = await window.moe.enqueue(keys, quality); show(); list.lastElementChild?.scrollIntoView({ block: 'nearest' }); report(`已加入 ${count} 个下载任务。`); return true }
    catch (error) { fail(error); return false }
  }
}
