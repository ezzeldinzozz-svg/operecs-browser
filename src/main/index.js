const { app, BrowserWindow, ipcMain, Menu, globalShortcut, dialog, session } = require('electron');
const path = require('path');
const BrowserStore = require('./store');
const TabManager = require('./tab-manager');
const PrivacyShield = require('./shield');
const DownloadsManager = require('./downloads-manager');

// Disable default menu to keep clean browser UI
Menu.setApplicationMenu(null);

let mainWindow = null;
let tabManager = null;
let store = null;
let shield = null;
let downloadsManager = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Operecs Browser',
    icon: path.join(__dirname, '../../assets/icon.png'),
    width: 1280,
    height: 850,
    minWidth: 700,
    minHeight: 500,
    frame: false, // Custom frameless titlebar for modern Chrome-like aesthetic
    backgroundColor: '#08070a',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  store = new BrowserStore();
  shield = new PrivacyShield(store, mainWindow);
  downloadsManager = new DownloadsManager(mainWindow);
  tabManager = new TabManager(mainWindow, store, shield);

  // Load the browser chrome UI
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    // Check if onStartup is restore
    const settings = store.getSettings();
    if (settings && settings.onStartup === 'restore' && settings.startupUrls && settings.startupUrls.length > 0) {
      settings.startupUrls.forEach((url, i) => {
        tabManager.createTab(url, i === 0);
      });
    } else {
      tabManager.createTab('', true);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    tabManager = null;
  });
}

function createIncognitoWindow() {
  const incognitoWin = new BrowserWindow({
    title: 'Operecs Browser (Incognito)',
    icon: path.join(__dirname, '../../assets/icon.png'),
    width: 1280,
    height: 850,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    backgroundColor: '#09080e',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      partition: `incognito-${Date.now()}` // Isolated session, not stored to disk
    }
  });

  const incognitoShield = new PrivacyShield(store, incognitoWin);
  const incognitoDownloads = new DownloadsManager(incognitoWin);
  const incognitoTabMgr = new TabManager(incognitoWin, store, incognitoShield);

  incognitoWin.loadFile(path.join(__dirname, '../renderer/index.html'), {
    query: { incognito: 'true' }
  });

  incognitoWin.webContents.on('did-finish-load', () => {
    incognitoTabMgr.createTab('operecs://incognito', true);
  });
}

// IPC Handlers: Windows
ipcMain.handle('window:new-window', () => {
  createWindow();
});

ipcMain.handle('window:new-incognito', () => {
  createIncognitoWindow();
});

ipcMain.handle('dialog:choose-download-dir', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Download Folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('dialog:open-clear-data', () => {
  if (mainWindow) mainWindow.webContents.send('open-clear-browsing-data');
});

// IPC Handlers: Layout Bounds
ipcMain.handle('layout:set-bounds', (_event, bounds) => {
  if (tabManager) tabManager.setLayoutBounds(bounds);
});

// IPC Handlers: Navigation
ipcMain.handle('browser:navigate', (_event, url) => {
  tabManager.navigateTab(null, url);
});

ipcMain.handle('browser:go-back', () => {
  tabManager.goBack();
});

ipcMain.handle('browser:go-forward', () => {
  tabManager.goForward();
});

ipcMain.handle('browser:reload', () => {
  tabManager.reloadTab();
});

ipcMain.handle('browser:stop', () => {
  tabManager.stopTab();
});

ipcMain.handle('browser:open-devtools', () => {
  tabManager.openDevTools();
});

ipcMain.handle('browser:print', () => {
  const activeTab = tabManager.tabs.get(tabManager.activeTabId);
  if (activeTab && activeTab.view) {
    activeTab.view.webContents.print();
  }
});

// IPC Handlers: Tabs
ipcMain.handle('tabs:create', (_event, url) => {
  return tabManager.createTab(url, true);
});

ipcMain.handle('tabs:close', (_event, tabId) => {
  tabManager.closeTab(tabId);
});

ipcMain.handle('tabs:switch', (_event, tabId) => {
  tabManager.switchTab(tabId);
});

ipcMain.handle('tabs:get-all', () => {
  return tabManager.getSerializedTabs();
});

// IPC Handlers: Split View & Sidebar
ipcMain.handle('split:toggle', (_event, targetTabId) => {
  tabManager.toggleSplitView(targetTabId);
});

ipcMain.handle('split:close', () => {
  tabManager.closeSplitView();
});

ipcMain.handle('split:focus-pane', (_event, pane) => {
  tabManager.focusSplitPane(pane);
});

ipcMain.handle('sidebar:set-width', (_event, width) => {
  tabManager.setSidebarWidth(width);
});

// IPC Handlers: Bookmarks
ipcMain.handle('bookmarks:get', () => {
  return store.getBookmarks();
});

ipcMain.handle('bookmarks:add', (_event, bookmark) => {
  return store.addBookmark(bookmark);
});

ipcMain.handle('bookmarks:update', (_event, id, data) => {
  return store.updateBookmark(id, data);
});

ipcMain.handle('bookmarks:remove', (_event, url) => {
  return store.removeBookmark(url);
});

ipcMain.handle('bookmarks:search', (_event, query) => {
  return store.searchBookmarks(query);
});

ipcMain.handle('bookmarks:get-folders', () => {
  return store.getBookmarkFolders();
});

ipcMain.handle('bookmarks:is-bookmarked', (_event, url) => {
  return store.isBookmarked(url);
});

// IPC Handlers: History
ipcMain.handle('history:get', () => {
  return store.getHistory();
});

ipcMain.handle('history:search', (_event, query) => {
  return store.searchHistory(query);
});

ipcMain.handle('history:remove-item', (_event, idOrUrl) => {
  return store.removeHistoryItem(idOrUrl);
});

ipcMain.handle('history:clear', () => {
  return store.clearHistory();
});

ipcMain.handle('history:clear-range', (_event, range) => {
  return store.clearHistoryRange(range);
});

// IPC Handlers: Clear Browsing Data
ipcMain.handle('browser:clear-browsing-data', async (_event, options = {}) => {
  try {
    const ses = session.defaultSession;
    if (options.clearCache) {
      await ses.clearCache();
    }
    if (options.clearCookies || options.clearStorage) {
      await ses.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'websql', 'serviceworkers', 'cachestorage']
      });
    }
    if (options.clearHistory) {
      store.clearHistoryRange(options.timeRange || 'all');
    }
    return { success: true };
  } catch (err) {
    console.error('Failed to clear browsing data:', err);
    return { success: false, error: err.message };
  }
});

// IPC Handlers: Settings
ipcMain.handle('settings:get', () => {
  return store.getSettings();
});

ipcMain.handle('settings:save', (_event, newSettings) => {
  const updated = store.updateSettings(newSettings);
  if (mainWindow) {
    mainWindow.webContents.send('settings:updated', updated);
  }
  return updated;
});

ipcMain.handle('settings:reset', () => {
  const res = store.resetSettings();
  if (mainWindow) {
    mainWindow.webContents.send('settings:updated', res);
  }
  return res;
});

// IPC Handlers: Tab Power Tools
ipcMain.handle('tabs:toggle-mute', (_event, tabId) => {
  return tabManager.toggleMuteTab(tabId);
});

ipcMain.handle('tabs:toggle-pin', (_event, tabId) => {
  return tabManager.togglePinTab(tabId);
});

ipcMain.handle('tabs:duplicate', (_event, tabId) => {
  return tabManager.duplicateTab(tabId);
});

ipcMain.handle('tabs:close-others', (_event, tabId) => {
  tabManager.closeOtherTabs(tabId);
});

ipcMain.handle('tabs:close-right', (_event, tabId) => {
  tabManager.closeTabsToRight(tabId);
});

ipcMain.handle('tabs:reopen-closed', () => {
  return tabManager.reopenClosedTab();
});

// IPC Handlers: Find in Page
ipcMain.handle('find:start', (_event, text, options) => {
  return tabManager.findInPage(text, options);
});

ipcMain.handle('find:stop', (_event, action) => {
  tabManager.stopFindInPage(action);
});

// IPC Handlers: Page Zoom
ipcMain.handle('zoom:in', () => {
  return tabManager.zoomIn();
});

ipcMain.handle('zoom:out', () => {
  return tabManager.zoomOut();
});

ipcMain.handle('zoom:reset', () => {
  return tabManager.resetZoom();
});

// IPC Handlers: Privacy Shield
ipcMain.handle('shield:toggle', () => {
  return shield.toggleShield();
});

ipcMain.handle('shield:is-enabled', () => {
  return shield.isShieldEnabled();
});

ipcMain.handle('shield:get-count', (_event, wcId) => {
  return shield.getBlockedCount(wcId);
});

// IPC Handlers: Downloads
ipcMain.handle('downloads:get', () => {
  return downloadsManager.getDownloads();
});

ipcMain.handle('downloads:cancel', (_event, id) => {
  return downloadsManager.cancelDownload(id);
});

ipcMain.handle('downloads:open', (_event, id) => {
  return downloadsManager.openDownload(id);
});

ipcMain.handle('downloads:show-in-folder', (_event, id) => {
  return downloadsManager.showInFolder(id);
});

// IPC Handlers: Window Controls
ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

app.whenReady().then(() => {
  createWindow();

  // Register Global Shortcuts
  try {
    globalShortcut.register('CommandOrControl+K', () => {
      if (mainWindow) mainWindow.webContents.send('open-command-palette');
    });

    globalShortcut.register('CommandOrControl+P', () => {
      if (mainWindow) mainWindow.webContents.send('open-command-palette');
    });

    globalShortcut.register('CommandOrControl+F', () => {
      if (mainWindow) mainWindow.webContents.send('open-find-bar');
    });

    globalShortcut.register('CommandOrControl+Shift+T', () => {
      if (tabManager) tabManager.reopenClosedTab();
    });

    globalShortcut.register('CommandOrControl+=', () => {
      if (tabManager) tabManager.zoomIn();
    });

    globalShortcut.register('CommandOrControl+Plus', () => {
      if (tabManager) tabManager.zoomIn();
    });

    globalShortcut.register('CommandOrControl+-', () => {
      if (tabManager) tabManager.zoomOut();
    });

    globalShortcut.register('CommandOrControl+0', () => {
      if (tabManager) tabManager.resetZoom();
    });

    globalShortcut.register('CommandOrControl+L', () => {
      if (mainWindow) mainWindow.webContents.send('focus-omnibox');
    });

    globalShortcut.register('CommandOrControl+S', () => {
      if (mainWindow) mainWindow.webContents.send('toggle-sidebar');
    });

    globalShortcut.register('CommandOrControl+Shift+N', () => {
      createIncognitoWindow();
    });

    globalShortcut.register('CommandOrControl+N', () => {
      createWindow();
    });

    globalShortcut.register('CommandOrControl+Shift+B', () => {
      if (mainWindow) mainWindow.webContents.send('toggle-bookmarks-bar');
    });

    globalShortcut.register('CommandOrControl+Shift+Delete', () => {
      if (mainWindow) mainWindow.webContents.send('open-clear-browsing-data');
    });

    globalShortcut.register('CommandOrControl+H', () => {
      if (tabManager) tabManager.createTab('operecs://history', true);
    });

    globalShortcut.register('CommandOrControl+Shift+O', () => {
      if (tabManager) tabManager.createTab('operecs://bookmarks', true);
    });

    globalShortcut.register('CommandOrControl+,', () => {
      if (tabManager) tabManager.createTab('operecs://settings', true);
    });
  } catch (err) {
    console.warn('Failed to register some global shortcuts:', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
