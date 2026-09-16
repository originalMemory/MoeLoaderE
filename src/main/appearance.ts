import { BrowserWindow, nativeTheme } from 'electron'
import { release } from 'node:os'
import koffi from 'koffi'

// Window composition policy ported from FluentWPF AcrylicHelper (MIT).
const materials = new WeakMap<BrowserWindow, boolean>()
const activeStates = new WeakMap<BrowserWindow, boolean>()
const overlayWindows = new WeakSet<BrowserWindow>()
const materialSetters = new WeakMap<BrowserWindow, (enabled: boolean) => boolean>()
let acrylicEnabled = true
let setAccent: ((handle: bigint, state: number) => boolean) | undefined

export function appearance(window: BrowserWindow) {
  return { dark: nativeTheme.shouldUseDarkColors, active: activeStates.get(window) ?? window.isFocused(), nativeBlur: materials.get(window) ?? false, platform: process.platform,
    acrylicEnabled, reducedTransparency: process.platform === 'darwin' && nativeTheme.prefersReducedTransparency }
}

export function publishAppearance(window: BrowserWindow): void {
  if (window.isDestroyed() || !materials.has(window)) return
  const value = appearance(window)
  if (process.platform !== 'darwin' && overlayWindows.has(window)) window.setTitleBarOverlay({ color: '#00000000', symbolColor: value.active ? value.dark ? '#ffffff' : '#000000' : '#808080', height: 30 })
  window.webContents.send('moe:appearance', value)
}

function applyMaterial(window: BrowserWindow): void {
  const apply = materialSetters.get(window)
  if (window.isDestroyed() || !apply) return
  const enabled = acrylicEnabled && !(process.platform === 'darwin' && nativeTheme.prefersReducedTransparency)
  try { materials.set(window, apply(enabled)) }
  catch (error) { materials.set(window, false); console.warn('原生窗口材质不可用，使用原版回退颜色：', error) }
  publishAppearance(window)
}

export function setAcrylicEnabled(enabled: boolean): void {
  acrylicEnabled = enabled
  for (const window of BrowserWindow.getAllWindows()) applyMaterial(window)
}

export function installAppearance(window: BrowserWindow, titleBarOverlay = true): void {
  if (titleBarOverlay) overlayWindows.add(window)
  let apply: (enabled: boolean) => boolean = () => false
  if (process.platform === 'darwin') {
    apply = enabled => { window.setVibrancy(enabled ? 'under-window' : null); return enabled }
  } else if (process.platform === 'win32') {
    try {
      if (!setAccent) {
        const policy = koffi.struct('MoeAccentPolicy', { state: 'int', flags: 'int', color: 'uint32_t', animation: 'int' })
        koffi.struct('MoeCompositionData', { attribute: 'int', data: 'void *', size: 'size_t' })
        const applyAccent = koffi.load('user32.dll').func('int __stdcall SetWindowCompositionAttribute(void *hwnd, const MoeCompositionData *data)')
        setAccent = (handle, state) => !!applyAccent(handle, { attribute: 19, data: koffi.as({ state, flags: 2, color: 0x00ffffff, animation: 0 }, koffi.pointer(policy)), size: koffi.sizeof(policy) })
      }
      const buffer = window.getNativeWindowHandle()
      const handle = buffer.length === 8 ? buffer.readBigUInt64LE() : BigInt(buffer.readUInt32LE())
      const build = Number(release().split('.')[2])
      // Same selection as FluentWPF AcrylicHelper; switch off acrylic while dragging on Win10.
      const state = build >= 22000 ? 1 : build >= 17763 ? 4 : 3
      apply = enabled => {
        if (!setAccent!(handle, enabled ? state : 0)) throw new Error('SetWindowCompositionAttribute returned 0')
        return enabled
      }
      window.hookWindowMessage(0x0231, () => { if (state === 4 && materials.get(window)) setAccent!(handle, 3) })
      window.hookWindowMessage(0x0232, () => { if (state === 4 && materials.get(window)) setAccent!(handle, state) })
    } catch (error) { console.warn('原生窗口材质不可用，使用原版回退颜色：', error) }
  }
  materialSetters.set(window, apply)
  activeStates.set(window, window.isFocused())
  applyMaterial(window)
  window.on('focus', () => { activeStates.set(window, true); publishAppearance(window) })
  window.on('blur', () => { activeStates.set(window, false); publishAppearance(window) })
  window.webContents.on('did-finish-load', () => publishAppearance(window))
}

nativeTheme.on('updated', () => { for (const window of BrowserWindow.getAllWindows()) applyMaterial(window) })
