const { WebContentsView } = require('electron');
const path = require('path');

class TabManager {
  constructor(mainWindow, store) {
    this.mainWindow = mainWindow;
    this.store = store;
    this.tabs = new Map(); // id -> tab object
    this.activeTabId = null;
    this.nextTabId = 1;
    this.toolbarHeight = 118; // Height in pixels for tab strip + omnibar + bookmarks bar
    this.newTabPath = `file://${path.join(__dirname, '../renderer/newtab.html').replace(/\\/g, '/')}`;

    // Handle window resizing and maximize states to adjust active view bounds
    this.mainWindow.on('resize', () => this.updateActiveTabBounds());
    this.mainWindow.on('maximize', () => setTimeout(() => this.updateActiveTabBounds(), 50));
    this.mainWindow.on('unmaximize', () => setTimeout(() => this.updateActiveTabBounds(), 50));
  }

  canGoBack(wc) {
    if (wc.navigationHistory && typeof wc.navigationHistory.canGoBack === 'function') {
      return wc.navigationHistory.canGoBack();
    }
    return typeof wc.canGoBack === 'function' ? wc.canGoBack() : false;
  }

  canGoForward(wc) {
    if (wc.navigationHistory && typeof wc.navigationHistory.canGoForward === 'function') {
      return wc.navigationHistory.canGoForward();
    }
    return typeof wc.canGoForward === 'function' ? wc.canGoForward() : false;
  }

  doGoBack(wc) {
    if (wc.navigationHistory && typeof wc.navigationHistory.goBack === 'function') {
      wc.navigationHistory.goBack();
    } else if (typeof wc.goBack === 'function') {
      wc.goBack();
    }
  }

  doGoForward(wc) {
    if (wc.navigationHistory && typeof wc.navigationHistory.goForward === 'function') {
      wc.navigationHistory.goForward();
    } else if (typeof wc.goForward === 'function') {
      wc.goForward();
    }
  }

  getTabBounds() {
    const [width, height] = this.mainWindow.getContentSize();
    return {
      x: 0,
      y: this.toolbarHeight,
      width: width,
      height: Math.max(0, height - this.toolbarHeight)
    };
  }

  updateActiveTabBounds() {
    const activeTab = this.tabs.get(this.activeTabId);
    if (activeTab && activeTab.view) {
      const bounds = this.getTabBounds();
      activeTab.view.setBounds(bounds);
    }
  }

  setToolbarHeight(height) {
    this.toolbarHeight = height;
    this.updateActiveTabBounds();
  }

  resolveUrl(input) {
    if (!input || input.trim() === '' || input === 'browser://newtab') {
      return this.newTabPath;
    }
    const trimmed = input.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('file://')) {
      return trimmed;
    }
    // Check if it resembles a domain (contains dot without spaces)
    const domainRegex = /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(\/[^\s]*)?$/;
    if (domainRegex.test(trimmed)) {
      return `https://${trimmed}`;
    }
    // Otherwise it's a search query
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }

  createTab(initialUrl = '', makeActive = true) {
    const id = `tab-${this.nextTabId++}`;
    const targetUrl = this.resolveUrl(initialUrl);

    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        spellcheck: true
      }
    });

    const tab = {
      id,
      view,
      url: initialUrl || 'browser://newtab',
      displayUrl: initialUrl || '',
      title: 'New Tab',
      favicon: '',
      isLoading: false,
      canGoBack: false,
      canGoForward: false
    };

    this.tabs.set(id, tab);

    // Setup lifecycle listeners on the webContents
    const wc = view.webContents;

    wc.on('did-start-loading', () => {
      tab.isLoading = true;
      this.notifyTabUpdated(tab);
    });

    wc.on('did-stop-loading', () => {
      tab.isLoading = false;
      tab.canGoBack = this.canGoBack(wc);
      tab.canGoForward = this.canGoForward(wc);
      const currentUrl = wc.getURL();
      if (currentUrl.startsWith('file://') && currentUrl.includes('newtab.html')) {
        tab.url = 'browser://newtab';
        tab.displayUrl = '';
      } else {
        tab.url = currentUrl;
        tab.displayUrl = currentUrl;
        this.store.addHistory({ title: tab.title, url: currentUrl });
      }
      this.notifyTabUpdated(tab);
    });

    wc.on('page-title-updated', (event, title) => {
      if (tab.url === 'browser://newtab') {
        tab.title = 'New Tab';
      } else {
        tab.title = title || 'Untitled';
      }
      this.notifyTabUpdated(tab);
    });

    wc.on('page-favicon-updated', (event, favicons) => {
      if (favicons && favicons.length > 0) {
        tab.favicon = favicons[0];
        this.notifyTabUpdated(tab);
      }
    });

    wc.on('did-navigate', (event, url) => {
      tab.canGoBack = this.canGoBack(wc);
      tab.canGoForward = this.canGoForward(wc);
      if (url.startsWith('file://') && url.includes('newtab.html')) {
        tab.url = 'browser://newtab';
        tab.displayUrl = '';
      } else {
        tab.url = url;
        tab.displayUrl = url;
      }
      this.notifyTabUpdated(tab);
    });

    wc.on('did-navigate-in-page', (event, url) => {
      tab.canGoBack = this.canGoBack(wc);
      tab.canGoForward = this.canGoForward(wc);
      if (!url.startsWith('file://')) {
        tab.url = url;
        tab.displayUrl = url;
      }
      this.notifyTabUpdated(tab);
    });

    // Handle new-window / target="_blank" to open in a new tab inside Operecs
    wc.setWindowOpenHandler(({ url }) => {
      this.createTab(url, true);
      return { action: 'deny' };
    });

    // Load initial URL
    wc.loadURL(targetUrl).catch(err => {
      console.warn(`Tab ${id} failed loading initial URL: ${targetUrl}`, err.message);
    });

    if (makeActive || this.tabs.size === 1) {
      this.switchTab(id);
    } else {
      this.notifyTabsChanged();
    }

    return tab;
  }

  switchTab(id) {
    const nextTab = this.tabs.get(id);
    if (!nextTab) return;

    const prevTab = this.tabs.get(this.activeTabId);
    if (prevTab && prevTab.view && prevTab.id !== id) {
      try {
        this.mainWindow.contentView.removeChildView(prevTab.view);
      } catch (e) {}
    }

    this.activeTabId = id;
    try {
      const children = this.mainWindow.contentView.children || [];
      if (!children.includes(nextTab.view)) {
        this.mainWindow.contentView.addChildView(nextTab.view);
      }
      this.updateActiveTabBounds();
    } catch (err) {
      console.error('Failed to attach tab view:', err);
    }

    this.notifyTabsChanged();
    this.notifyActiveTabChanged(nextTab);
  }

  closeTab(id) {
    const tabToClose = this.tabs.get(id);
    if (!tabToClose) return;

    // If closing active tab, find next tab to activate
    if (this.activeTabId === id) {
      const keys = Array.from(this.tabs.keys());
      const currentIndex = keys.indexOf(id);
      let nextId = null;

      if (keys.length > 1) {
        if (currentIndex < keys.length - 1) {
          nextId = keys[currentIndex + 1];
        } else {
          nextId = keys[currentIndex - 1];
        }
      }

      if (tabToClose.view) {
        try {
          this.mainWindow.contentView.removeChildView(tabToClose.view);
        } catch (e) {}
      }

      this.tabs.delete(id);

      if (nextId) {
        this.switchTab(nextId);
      } else {
        // If all tabs were closed, open a fresh new tab
        this.createTab('', true);
      }
    } else {
      if (tabToClose.view) {
        try {
          this.mainWindow.contentView.removeChildView(tabToClose.view);
        } catch (e) {}
      }
      this.tabs.delete(id);
      this.notifyTabsChanged();
    }
  }

  navigateTab(id, input) {
    const tab = this.tabs.get(id || this.activeTabId);
    if (!tab) return;
    const targetUrl = this.resolveUrl(input);
    tab.view.webContents.loadURL(targetUrl).catch(err => {
      console.warn(`Tab ${tab.id} load error:`, err.message);
    });
  }

  goBack(id) {
    const tab = this.tabs.get(id || this.activeTabId);
    if (tab) {
      this.doGoBack(tab.view.webContents);
    }
  }

  goForward(id) {
    const tab = this.tabs.get(id || this.activeTabId);
    if (tab) {
      this.doGoForward(tab.view.webContents);
    }
  }

  reloadTab(id) {
    const tab = this.tabs.get(id || this.activeTabId);
    if (tab) {
      tab.view.webContents.reload();
    }
  }

  stopTab(id) {
    const tab = this.tabs.get(id || this.activeTabId);
    if (tab) {
      tab.view.webContents.stop();
    }
  }

  openDevTools(id) {
    const tab = this.tabs.get(id || this.activeTabId);
    if (tab) {
      tab.view.webContents.openDevTools({ mode: 'detach' });
    }
  }

  getActiveTab() {
    return this.tabs.get(this.activeTabId);
  }

  getSerializedTabs() {
    return Array.from(this.tabs.values()).map(t => ({
      id: t.id,
      url: t.url,
      displayUrl: t.displayUrl,
      title: t.title,
      favicon: t.favicon,
      isLoading: t.isLoading,
      canGoBack: t.canGoBack,
      canGoForward: t.canGoForward,
      isActive: t.id === this.activeTabId
    }));
  }

  notifyTabsChanged() {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('tabs-updated', {
        tabs: this.getSerializedTabs(),
        activeTabId: this.activeTabId
      });
    }
  }

  notifyTabUpdated(tab) {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('tab-status-updated', {
        id: tab.id,
        url: tab.url,
        displayUrl: tab.displayUrl,
        title: tab.title,
        favicon: tab.favicon,
        isLoading: tab.isLoading,
        canGoBack: tab.canGoBack,
        canGoForward: tab.canGoForward,
        isActive: tab.id === this.activeTabId
      });
    }
  }

  notifyActiveTabChanged(tab) {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('active-tab-changed', {
        id: tab.id,
        url: tab.url,
        displayUrl: tab.displayUrl,
        title: tab.title,
        favicon: tab.favicon,
        isLoading: tab.isLoading,
        canGoBack: tab.canGoBack,
        canGoForward: tab.canGoForward
      });
    }
  }
}

module.exports = TabManager;
