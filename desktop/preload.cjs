const { contextBridge, ipcRenderer } = require('electron')

function listen(channel, callback) {
  const handler = (_event, value) => callback(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('gifHost', {
  onOpen: (callback) => listen('gif:open', callback),
  onClose: (callback) => listen('gif:closed', callback),
  ready: () => ipcRenderer.send('gif:ready'),
  onShortcutError: (callback) => listen('gif:shortcut-error', callback),
  close: () => ipcRenderer.send('gif:close'),
  search: (query, customerId, sessionId) => ipcRenderer.invoke('gif:search', query, customerId, sessionId),
  recommend: (message, sessionId) => ipcRenderer.invoke('gif:recommend', message, sessionId),
  copyGif: (request) => ipcRenderer.invoke('gif:copy', request),
  dragGif: (request) => ipcRenderer.invoke('gif:drag', request),
})
