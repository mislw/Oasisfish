import { contextBridge, ipcRenderer } from 'electron'
import { createOasisfishUpdateBridge } from './preload-bridge.ts'

contextBridge.exposeInMainWorld('oasisfishUpdate', createOasisfishUpdateBridge(ipcRenderer))
