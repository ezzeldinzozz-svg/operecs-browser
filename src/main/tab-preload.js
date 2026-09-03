const { contextBridge, ipcRenderer } = require('electron');

// Only expose safe internal browser APIs to local file:// pages (like settings.html)
if (window.location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('browserAPI', {
    getSettings: () => ipcRenderer.invoke('settings:get'),
    saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
    clearHistory: () => ipcRenderer.invoke('history:clear'),
    getDownloads: () => ipcRenderer.invoke('downloads:get'),
    cancelDownload: (id) => ipcRenderer.invoke('downloads:cancel', id),
    openDownload: (id) => ipcRenderer.invoke('downloads:open', id),
    showDownloadInFolder: (id) => ipcRenderer.invoke('downloads:show-in-folder', id),
    onDownloadsUpdated: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('downloads:updated', handler);
      return () => ipcRenderer.removeListener('downloads:updated', handler);
    }
  });
}
