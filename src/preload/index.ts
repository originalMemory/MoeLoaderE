import { contextBridge, ipcRenderer } from 'electron'
import type { Appearance, BrowserApi, DownloadSnapshot, NetworkSnapshot } from '../shared/types'

const api: BrowserApi = {
  setDisplaySettings: value => ipcRenderer.invoke('moe:display-settings', value),
  background: () => ipcRenderer.invoke('moe:background'),
  changeBackground: () => ipcRenderer.invoke('moe:change-background'),
  openBackgroundDirectory: () => ipcRenderer.invoke('moe:background-directory'),
  setSearchSettings: value => ipcRenderer.invoke('moe:search-settings', value),
  clearHistory: () => ipcRenderer.invoke('moe:clear-history'),
  network: () => ipcRenderer.invoke('moe:network'),
  setNetwork: value => ipcRenderer.invoke('moe:set-network', value),
  onNetwork: callback => {
    const listener = (_event: Electron.IpcRendererEvent, value: NetworkSnapshot) => callback(value)
    ipcRenderer.on('moe:network-changed', listener)
    return () => ipcRenderer.removeListener('moe:network-changed', listener)
  },
  login: site => ipcRenderer.invoke('moe:login', site),
  logout: site => ipcRenderer.invoke('moe:logout', site),
  detail: key => ipcRenderer.invoke('moe:detail', key),
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
  hints: (keyword, site = 'konachan-g') => ipcRenderer.invoke('moe:hints', { keyword, site }),
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
  count: (value, site = 'konachan-g') => ipcRenderer.invoke('moe:count', { value, site })
}
contextBridge.exposeInMainWorld('moe', api)
