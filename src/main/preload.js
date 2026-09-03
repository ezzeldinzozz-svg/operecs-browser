const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('browserAPI', {
  // Navigation
  navigate: (url) => ipcRenderer.invoke('browser:navigate', url),
  goBack: () => ipcRenderer.invoke('browser:go-back'),
  goForward: () => ipcRenderer.invoke('browser:go-forward'),
  reload: () => ipcRenderer.invoke('browser:reload'),
  stop: () => ipcRenderer.invoke('browser:stop'),
  openDevTools: () => ipcRenderer.invoke('browser:open-devtools'),

  // Tabs
  createTab: (url) => ipcRenderer.invoke('tabs:create', url),
  closeTab: (tabId) => ipcRenderer.invoke('tabs:close', tabId),
  switchTab: (tabId) => ipcRenderer.invoke('tabs:switch', tabId),
  getTabs: () => ipcRenderer.invoke('tabs:get-all'),

  // Split View & Sidebar
  toggleSplitView: (targetTabId) => ipcRenderer.invoke('split:toggle', targetTabId),
  closeSplitView: () => ipcRenderer.invoke('split:close'),
  focusSplitPane: (pane) => ipcRenderer.invoke('split:focus-pane', pane),
  setSidebarWidth: (width) => ipcRenderer.invoke('sidebar:set-width', width),

  // Bookmarks
  getBookmarks: () => ipcRenderer.invoke('bookmarks:get'),
  addBookmark: (bookmark) => ipcRenderer.invoke('bookmarks:add', bookmark),
  removeBookmark: (url) => ipcRenderer.invoke('bookmarks:remove', url),
  isBookmarked: (url) => ipcRenderer.invoke('bookmarks:is-bookmarked', url),

  // History
  getHistory: () => ipcRenderer.invoke('history:get'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),

  // Window Controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),

  // Event Listeners
  onTabsUpdated: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('tabs-updated', handler);
    return () => ipcRenderer.removeListener('tabs-updated', handler);
  },
  onTabStatusUpdated: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('tab-status-updated', handler);
    return () => ipcRenderer.removeListener('tab-status-updated', handler);
  },
  onActiveTabChanged: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('active-tab-changed', handler);
    return () => ipcRenderer.removeListener('active-tab-changed', handler);
  },
  onSplitViewChanged: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('split-view-changed', handler);
    return () => ipcRenderer.removeListener('split-view-changed', handler);
  },
  onFocusOmnibox: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('focus-omnibox', handler);
    return () => ipcRenderer.removeListener('focus-omnibox', handler);
  },
  onToggleSidebar: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('toggle-sidebar', handler);
    return () => ipcRenderer.removeListener('toggle-sidebar', handler);
  }
});
