const { contextBridge, ipcRenderer } = require('electron');

// Only expose safe internal browser APIs to local file:// pages (like settings.html)
if (window.location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('browserAPI', {
    getSettings: () => ipcRenderer.invoke('settings:get'),
    saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
    clearHistory: () => ipcRenderer.invoke('history:clear')
  });
}
