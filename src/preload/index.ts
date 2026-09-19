import { contextBridge, ipcRenderer } from 'electron'

/**
 * Phase 0 bridge. Deliberately tiny: the spike only needs to report timings
 * back to main and read a file chosen from the command line.
 */
const api = {
  report: (label: string, data: unknown) => ipcRenderer.send('spike:report', label, data),
  readSample: (lines: number): Promise<string> => ipcRenderer.invoke('spike:sample', lines),
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
