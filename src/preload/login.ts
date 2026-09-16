import { contextBridge, ipcRenderer } from 'electron'
import type { LoginStatus } from '../shared/types'
contextBridge.exposeInMainWorld('login', {
  init: (): Promise<LoginStatus> => ipcRenderer.invoke('login:init'),
  navigate: (): Promise<void> => ipcRenderer.invoke('login:navigate'),
  verify: (): Promise<void> => ipcRenderer.invoke('login:verify'),
  onStatus: (callback: (value: LoginStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: LoginStatus): void => callback(value)
    ipcRenderer.on('login:status', listener)
    return () => ipcRenderer.removeListener('login:status', listener)
  }
})
