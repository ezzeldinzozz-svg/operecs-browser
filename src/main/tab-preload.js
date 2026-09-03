const { contextBridge, ipcRenderer } = require('electron');

// Only expose safe internal browser APIs to local file:// pages (like settings.html, history.html, bookmarks.html, downloads.html)
if (window.location.protocol === 'file:') {
  const api = {
    // Settings
    getSettings: () => ipcRenderer.invoke('settings:get'),
    saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
    resetSettings: () => ipcRenderer.invoke('settings:reset'),
    chooseDownloadDir: () => ipcRenderer.invoke('dialog:choose-download-dir'),

    // History
    getHistory: () => ipcRenderer.invoke('history:get'),
    searchHistory: (query) => ipcRenderer.invoke('history:search', query),
    removeHistoryItem: (idOrUrl) => ipcRenderer.invoke('history:remove-item', idOrUrl),
    clearHistory: () => ipcRenderer.invoke('history:clear'),
    clearHistoryRange: (range) => ipcRenderer.invoke('history:clear-range', range),
    openClearBrowsingData: () => ipcRenderer.invoke('dialog:open-clear-data'),

    // Bookmarks
    getBookmarks: () => ipcRenderer.invoke('bookmarks:get'),
    addBookmark: (bookmark) => ipcRenderer.invoke('bookmarks:add', bookmark),
    updateBookmark: (id, data) => ipcRenderer.invoke('bookmarks:update', id, data),
    removeBookmark: (idOrUrl) => ipcRenderer.invoke('bookmarks:remove', idOrUrl),
    searchBookmarks: (query) => ipcRenderer.invoke('bookmarks:search', query),

    // Navigation
    navigate: (url) => ipcRenderer.invoke('browser:navigate', url),

    // Downloads
    getDownloads: () => ipcRenderer.invoke('downloads:get'),
    cancelDownload: (id) => ipcRenderer.invoke('downloads:cancel', id),
    openDownload: (id) => ipcRenderer.invoke('downloads:open', id),
    showDownloadInFolder: (id) => ipcRenderer.invoke('downloads:show-in-folder', id),
    onDownloadsUpdated: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('downloads:updated', handler);
      return () => ipcRenderer.removeListener('downloads:updated', handler);
    }
  };

  contextBridge.exposeInMainWorld('browserAPI', api);
  contextBridge.exposeInMainWorld('operecs', api);
}

