const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const BrowserStore = require('./store');
const TabManager = require('./tab-manager');

// Disable default menu to keep clean browser UI
Menu.setApplicationMenu(null);

let mainWindow = null;
let tabManager = null;
let store = null;

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
  tabManager = new TabManager(mainWindow, store);

  // Load the browser chrome UI
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    // Open the initial tab
    tabManager.createTab('', true);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    tabManager = null;
  });
}

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

ipcMain.handle('bookmarks:remove', (_event, url) => {
  return store.removeBookmark(url);
});

ipcMain.handle('bookmarks:is-bookmarked', (_event, url) => {
  return store.isBookmarked(url);
});

// IPC Handlers: History
ipcMain.handle('history:get', () => {
  return store.getHistory();
});

ipcMain.handle('history:clear', () => {
  return store.clearHistory();
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
