import { contextBridge, ipcRenderer } from 'electron'
import type { Appearance, BrowserApi } from '../shared/types'

const api: BrowserApi = {
  appearance: () => ipcRenderer.invoke('moe:appearance'),
  onAppearance: callback => {
    const listener = (_event: Electron.IpcRendererEvent, value: Appearance) => callback(value)
    ipcRenderer.on('moe:appearance', listener)
    return () => ipcRenderer.removeListener('moe:appearance', listener)
  },
  init: () => ipcRenderer.invoke('moe:init'),
  search: input => ipcRenderer.invoke('moe:search', input),
  next: () => ipcRenderer.invoke('moe:next'),
  cancel: () => ipcRenderer.invoke('moe:cancel'),
  hints: keyword => ipcRenderer.invoke('moe:hints', keyword),
  preview: key => ipcRenderer.invoke('moe:preview', key),
  previewItem: () => ipcRenderer.invoke('moe:preview-item'),
  onImageProgress: callback => {
    const listener = (_event: Electron.IpcRendererEvent, progress: { key: string; loaded: number; total: number }) => callback(progress)
    ipcRenderer.on('moe:image-progress', listener)
    return () => ipcRenderer.removeListener('moe:image-progress', listener)
  },
  copy: text => ipcRenderer.invoke('moe:copy', text),
  open: key => ipcRenderer.invoke('moe:open', key),
  size: value => ipcRenderer.invoke('moe:size', value),
  count: value => ipcRenderer.invoke('moe:count', value)
}
contextBridge.exposeInMainWorld('moe', api)
