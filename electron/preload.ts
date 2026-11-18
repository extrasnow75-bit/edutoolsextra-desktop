import { contextBridge, ipcRenderer } from 'electron'
import type { Api, Progress } from '../src/shared/api'

/**
 * The narrow bridge the window gets as `window.api`. Each method is one IPC call; the shape is
 * `Api` in src/shared/api.ts. Nothing here returns the Canvas token.
 */
const api: Api = {
  app: {
    platform: process.platform,
    version: () => ipcRenderer.invoke('app:version'),
    getZoom: () => ipcRenderer.invoke('app:getZoom'),
    stepZoom: (delta) => ipcRenderer.invoke('app:stepZoom', delta),
    openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  },
  setup: {
    status: () => ipcRenderer.invoke('setup:status'),
    saveSite: (site) => ipcRenderer.invoke('setup:saveSite', site),
    saveToken: (token) => ipcRenderer.invoke('setup:saveToken', token),
    removeToken: () => ipcRenderer.invoke('setup:removeToken'),
    checkToken: () => ipcRenderer.invoke('setup:checkToken'),
  },
  session: {
    load: () => ipcRenderer.invoke('session:load'),
    save: (courses) => ipcRenderer.invoke('session:save', courses),
    saveGroup: (group) => ipcRenderer.invoke('session:saveGroup', group),
    deleteGroup: (name) => ipcRenderer.invoke('session:deleteGroup', name),
  },
  courses: {
    list: () => ipcRenderer.invoke('courses:list'),
    resolve: (addresses) => ipcRenderer.invoke('courses:resolve', addresses),
  },
  findReplace: {
    search: (req) => ipcRenderer.invoke('findReplace:search', req),
    apply: (args) => ipcRenderer.invoke('findReplace:apply', args),
  },
  term: {
    preview: (req) => ipcRenderer.invoke('term:preview', req),
    apply: (args) => ipcRenderer.invoke('term:apply', args),
  },
  rubrics: {
    list: (courseId) => ipcRenderer.invoke('rubrics:list', courseId),
    save: (args) => ipcRenderer.invoke('rubrics:save', args),
  },
  history: {
    list: () => ipcRenderer.invoke('history:list'),
    undo: (id) => ipcRenderer.invoke('history:undo', id),
  },
  onProgress: (callback) => {
    const listener = (_e: unknown, p: Progress) => callback(p)
    ipcRenderer.on('progress', listener)
    return () => ipcRenderer.removeListener('progress', listener)
  },
}

contextBridge.exposeInMainWorld('api', api)
