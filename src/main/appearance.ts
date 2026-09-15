import { BrowserWindow, nativeTheme } from 'electron'
import { release } from 'node:os'
import koffi from 'koffi'

// Window composition policy ported from FluentWPF AcrylicHelper (MIT).

const materials = new WeakMap<BrowserWindow, boolean>()
const activeStates = new WeakMap<BrowserWindow, boolean>()
let setAccent: ((handle: bigint, state: number) => boolean) | undefined

export function appearance(window: BrowserWindow) {
  return { dark: nativeTheme.shouldUseDarkColors, active: activeStates.get(window) ?? window.isFocused(), nativeBlur: materials.get(window) ?? false, platform: process.platform }
}

export function publishAppearance(window: BrowserWindow): void {
  if (window.isDestroyed() || !materials.has(window)) return
  const value = appearance(window)
  if (process.platform !== 'darwin') window.setTitleBarOverlay({ color: '#00000000', symbolColor: value.active ? value.dark ? '#ffffff' : '#000000' : '#808080', height: 30 })
  window.webContents.send('moe:appearance', value)
}

export function installAppearance(window: BrowserWindow): void {
  let enabled = process.platform === 'darwin'
  if (process.platform === 'win32') {
    try {
      if (!setAccent) {
        const policy = koffi.struct('MoeAccentPolicy', { state: 'int', flags: 'int', color: 'uint32_t', animation: 'int' })
        koffi.struct('MoeCompositionData', { attribute: 'int', data: 'void *', size: 'size_t' })
        const apply = koffi.load('user32.dll').func('int __stdcall SetWindowCompositionAttribute(void *hwnd, const MoeCompositionData *data)')
        setAccent = (handle, state) => !!apply(handle, { attribute: 19, data: koffi.as({ state, flags: 2, color: 0x00ffffff, animation: 0 }, koffi.pointer(policy)), size: koffi.sizeof(policy) })
      }
      const buffer = window.getNativeWindowHandle()
      const handle = buffer.length === 8 ? buffer.readBigUInt64LE() : BigInt(buffer.readUInt32LE())
      const build = Number(release().split('.')[2])
      // Same selection as FluentWPF AcrylicHelper; switch off acrylic while dragging on Win10.
      const state = build >= 22000 ? 1 : build >= 17763 ? 4 : 3
      enabled = setAccent(handle, state)
      if (!enabled) throw new Error('SetWindowCompositionAttribute returned 0')
      window.hookWindowMessage(0x0231, () => { if (state === 4) setAccent!(handle, 3) })
      window.hookWindowMessage(0x0232, () => { if (state === 4) setAccent!(handle, state) })
    } catch (error) { console.warn('原生窗口材质不可用，使用原版回退颜色：', error) }
  }
  materials.set(window, enabled)
  activeStates.set(window, window.isFocused())
  window.on('focus', () => { activeStates.set(window, true); publishAppearance(window) })
  window.on('blur', () => { activeStates.set(window, false); publishAppearance(window) })
  window.webContents.on('did-finish-load', () => publishAppearance(window))
}

nativeTheme.on('updated', () => { for (const window of BrowserWindow.getAllWindows()) publishAppearance(window) })
