const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getOrigins: () => ipcRenderer.invoke('get-origins'),
  setOrigins: (origins) => ipcRenderer.invoke('set-origins', origins)
})
