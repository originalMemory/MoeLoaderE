import { contextBridge, ipcRenderer } from 'electron'
import type { Appearance, BrowserApi, DownloadSnapshot } from '../shared/types'

const api: BrowserApi = {
  downloads: () => ipcRenderer.invoke('moe:downloads'),
  onDownloads: callback => {
    const listener = (_event: Electron.IpcRendererEvent, value: DownloadSnapshot) => callback(value)
    ipcRenderer.on('moe:downloads-changed', listener)
    return () => ipcRenderer.removeListener('moe:downloads-changed', listener)
  },
  enqueue: (keys, quality) => ipcRenderer.invoke('moe:enqueue', { keys, quality }),
  downloadAction: (action, ids) => ipcRenderer.invoke('moe:download-action', { action, ids }),
  downloadSettings: value => ipcRenderer.invoke('moe:download-settings', value),
  downloadDirectory: () => ipcRenderer.invoke('moe:download-directory'),
  revealDownload: id => ipcRenderer.invoke('moe:download-reveal', id),
  exportDownloads: () => ipcRenderer.invoke('moe:download-export'),
  importDownloads: text => ipcRenderer.invoke('moe:download-import', text),
  setAcrylic: enabled => ipcRenderer.invoke('moe:set-acrylic', enabled),
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
