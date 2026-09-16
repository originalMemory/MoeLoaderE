import type { Appearance } from '../../shared/types'

export function installControls(): void {
  const acrylic = document.querySelector<HTMLInputElement>('#acrylic-enabled')!
  let currentAppearance: Appearance | undefined
  const apply = (value: Appearance): void => {
    currentAppearance = value
    acrylic.checked = value.acrylicEnabled
    acrylic.title = value.reducedTransparency ? '系统已开启降低透明度；关闭系统限制后恢复毛玻璃。' : ''
    const root = document.documentElement
    root.dataset.theme = value.dark ? 'dark' : 'light'
    root.dataset.active = String(value.active)
    root.dataset.nativeBlur = String(value.nativeBlur)
    root.dataset.platform = value.platform
  }
  acrylic.onchange = () => {
    acrylic.disabled = true
    void window.moe.setAcrylic(acrylic.checked).catch(error => {
      if (currentAppearance) acrylic.checked = currentAppearance.acrylicEnabled
      const toast = document.querySelector<HTMLElement>('#toast')!
      toast.textContent = String(error); toast.hidden = false
    }).finally(() => { acrylic.disabled = false })
  }
  const dispose = window.moe.onAppearance(apply)
  void window.moe.appearance().then(apply).catch(console.error)
  window.addEventListener('unload', dispose, { once: true })
  const title = document.getElementById('window-title')!
  new MutationObserver(() => { title.textContent = document.title }).observe(document.querySelector('title')!, { childList: true })

  let opened: HTMLElement | undefined
  const close = (): void => {
    if (!opened) return
    const wrapper = opened
    opened = undefined
    const options = wrapper.querySelector<HTMLElement>('.select-options')!
    if (options.matches(':popover-open')) options.hidePopover()
    options.hidden = true
    wrapper.querySelector('button')!.setAttribute('aria-expanded', 'false')
  }
  document.addEventListener('pointerdown', event => { if (opened && !opened.contains(event.target as Node)) close() })
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close() })
  window.addEventListener('blur', close)
  window.addEventListener('resize', close)
  for (const select of document.querySelectorAll('select')) {
    const wrapper = document.createElement('div'); wrapper.className = 'select-control'; wrapper.dataset.select = select.id
    select.before(wrapper); wrapper.append(select); select.tabIndex = -1; select.setAttribute('aria-hidden', 'true')
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'select-toggle'; toggle.setAttribute('role', 'combobox'); toggle.setAttribute('aria-haspopup', 'listbox'); toggle.setAttribute('aria-expanded', 'false')
    const label = select.getAttribute('aria-label') || document.querySelector(`label[for="${select.id}"]`)?.textContent || select.id
    toggle.setAttribute('aria-label', label)
    if (select.id) { toggle.id = `${select.id}-toggle`; const caption = document.querySelector<HTMLLabelElement>(`label[for="${select.id}"]`); if (caption) caption.htmlFor = toggle.id }
    const options = document.createElement('div'); options.className = 'select-options'; options.role = 'listbox'; options.hidden = true
    options.popover = 'manual'
    options.id = `options-${select.id || [...document.querySelectorAll('.select-control')].length}`; toggle.setAttribute('aria-controls', options.id)
    const refresh = (): void => { toggle.textContent = select.selectedOptions[0]?.textContent ?? ''; toggle.disabled = select.disabled }
    const choose = (index: number): void => { select.selectedIndex = index; select.dispatchEvent(new Event('change', { bubbles: true })); refresh(); close(); toggle.focus() }
    const rebuild = (): void => {
    options.replaceChildren()
    for (const [index, option] of [...select.options].entries()) {
      const item = document.createElement('button'); item.type = 'button'; item.className = 'select-option'; item.role = 'option'; item.textContent = option.text; item.disabled = option.disabled
      item.onclick = () => choose(index)
      item.onkeydown = event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const target = options.children[Math.max(0, Math.min(options.children.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))] as HTMLElement; target.focus() }
        if (event.key === 'Escape') { close(); toggle.focus() }
      }
      options.append(item)
    }
    refresh()
    }
    rebuild()
    new MutationObserver(rebuild).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'label'] })
    select.addEventListener('moe:refresh', refresh)
    const open = (): void => {
      if (opened === wrapper) { close(); return }
      close(); opened = wrapper; options.hidden = false; toggle.setAttribute('aria-expanded', 'true')
      for (const [index, item] of [...options.children].entries()) item.setAttribute('aria-selected', String(index === select.selectedIndex))
      // Native top layer avoids clipping by the window layout and transformed search form.
      options.style.maxHeight = ''; options.style.minWidth = `${Math.min(toggle.offsetWidth, innerWidth - 8)}px`
      options.showPopover()
      const anchor = toggle.getBoundingClientRect(), needed = options.scrollHeight + 2
      const below = Math.max(0, innerHeight - anchor.bottom - 6), above = Math.max(0, anchor.top - 6)
      const upward = needed > below && above > below
      options.style.maxHeight = `${upward ? above : below}px`
      const bounds = options.getBoundingClientRect()
      options.style.left = `${Math.max(4, Math.min(anchor.left, innerWidth - bounds.width - 4))}px`
      options.style.top = `${Math.max(4, Math.min(upward ? anchor.top - bounds.height - 2 : anchor.bottom + 2, innerHeight - bounds.height - 4))}px`
    }
    toggle.onclick = open
    toggle.onkeydown = event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (opened !== wrapper) open(); (options.children[select.selectedIndex] as HTMLElement)?.focus() }
    }
    select.addEventListener('change', refresh)
    wrapper.addEventListener('focusout', event => { if (opened === wrapper && !wrapper.contains(event.relatedTarget as Node | null)) close() })
    wrapper.append(toggle, options); refresh()
  }
  for (const input of document.querySelectorAll<HTMLInputElement>('input[type=number]')) {
    const wrapper = document.createElement('div'); wrapper.className = 'number-control'; input.before(wrapper); wrapper.append(input)
    const buttons = [-1, 1].map(delta => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'number-step'; b.textContent = delta < 0 ? '\uf0d7' : '\uf0d8'
      b.setAttribute('aria-label', `${delta < 0 ? '减少' : '增加'}${input.getAttribute('aria-label') || document.querySelector(`label[for="${input.id}"]`)?.textContent}`)
      b.disabled = input.disabled
      b.onclick = () => { input.value = String(Math.min(Number(input.max), Math.max(Number(input.min), Number(input.value) + delta))); input.dispatchEvent(new Event('change', { bubbles: true })) }
      wrapper.append(b); return b
    })
    new MutationObserver(() => buttons.forEach(b => { b.disabled = input.disabled })).observe(input, { attributes: true, attributeFilter: ['disabled'] })
    input.addEventListener('blur', () => {
      if (!Number.isInteger(Number(input.value)) || !input.value) return
      const clamped = Math.min(Number(input.max), Math.max(Number(input.min), Number(input.value)))
      if (clamped !== Number(input.value)) { input.value = String(clamped); input.dispatchEvent(new Event('change', { bubbles: true })) }
    })
  }
}
