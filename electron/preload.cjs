const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sqliteApi', {
  isElectron: true,
  getAll: (collection) => ipcRenderer.invoke('sqlite:get-all', collection),
  getDoc: (collection, id) => ipcRenderer.invoke('sqlite:get-doc', collection, id),
  setDoc: (collection, id, data) => ipcRenderer.invoke('sqlite:set-doc', collection, id, data),
  deleteDoc: (collection, id) => ipcRenderer.invoke('sqlite:delete-doc', collection, id),
  writeBatch: (ops) => ipcRenderer.invoke('sqlite:write-batch', ops)
});
