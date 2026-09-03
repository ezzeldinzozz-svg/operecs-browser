const { WebContentsView } = require('electron');
const path = require('path');

class TabManager {
  constructor(mainWindow, store) {
    this.mainWindow = mainWindow;
    this.store = store;
    this.tabs = new Map(); // id -> tab object
    this.activeTabId = null;
    this.nextTabId = 1;

    // Layout dimensions
    this.sidebarWidth = 240; // Default expanded sidebar width in pixels
    this.topBarHeight = 46;  // Slim top omnibox & navigation bar height in pixels
    this.newTabPath = `file://${path.join(__dirname, '../renderer/newtab.html').replace(/\\/g, '/')}`;

    // Split View State
    this.isSplitView = false;
    this.leftTabId = null;
    this.rightTabId = null;
    this.focusedPane = 'left'; // 'left' | 'right'

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

  setSidebarWidth(width) {
    this.sidebarWidth = Number(width) || 240;
    this.updateActiveTabBounds();
  }

  updateActiveTabBounds() {
    if (this.mainWindow.isDestroyed()) return;
    const [winWidth, winHeight] = this.mainWindow.getContentSize();
    const stageWidth = Math.max(0, winWidth - this.sidebarWidth);
    const stageHeight = Math.max(0, winHeight - this.topBarHeight);

    if (this.isSplitView) {
      const leftTab = this.tabs.get(this.leftTabId);
      const rightTab = this.tabs.get(this.rightTabId);
      const halfWidth = Math.floor(stageWidth / 2);

      if (leftTab && leftTab.view) {
        leftTab.view.setBounds({
          x: this.sidebarWidth,
          y: this.topBarHeight,
          width: Math.max(0, halfWidth - 1),
          height: stageHeight
        });
      }

      if (rightTab && rightTab.view) {
        rightTab.view.setBounds({
          x: this.sidebarWidth + halfWidth + 1,
          y: this.topBarHeight,
          width: Math.max(0, stageWidth - halfWidth - 1),
          height: stageHeight
        });
      }
    } else {
      const activeTab = this.tabs.get(this.activeTabId);
      if (activeTab && activeTab.view) {
        activeTab.view.setBounds({
          x: this.sidebarWidth,
          y: this.topBarHeight,
          width: stageWidth,
          height: stageHeight
        });
      }
    }
  }

  resolveUrl(input) {
    if (!input || input.trim() === '' || input === 'browser://newtab' || input === 'operecs://newtab') {
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
      url: initialUrl || 'operecs://newtab',
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
        tab.url = 'operecs://newtab';
        tab.displayUrl = '';
      } else {
        tab.url = currentUrl;
        tab.displayUrl = currentUrl;
        this.store.addHistory({ title: tab.title, url: currentUrl });
      }
      this.notifyTabUpdated(tab);
    });

    wc.on('page-title-updated', (event, title) => {
      if (tab.url === 'operecs://newtab') {
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
        tab.url = 'operecs://newtab';
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

    if (this.isSplitView) {
      if (makeActive) {
        // If in split view, assign newly created tab to the focused pane
        if (this.focusedPane === 'left') {
          this.leftTabId = id;
        } else {
          this.rightTabId = id;
        }
        this.activeTabId = id;
        this.attachViewSafely(view);
        this.updateActiveTabBounds();
        this.notifyTabsChanged();
        this.notifyActiveTabChanged(tab);
        this.notifySplitViewChanged();
      } else {
        this.notifyTabsChanged();
      }
    } else {
      if (makeActive || this.tabs.size === 1) {
        this.switchTab(id);
      } else {
        this.notifyTabsChanged();
      }
    }

    return tab;
  }

  attachViewSafely(view) {
    try {
      const children = this.mainWindow.contentView.children || [];
      if (!children.includes(view)) {
        this.mainWindow.contentView.addChildView(view);
      }
    } catch (err) {
      console.error('Failed to attach view:', err);
    }
  }

  removeViewSafely(view) {
    if (!view) return;
    try {
      this.mainWindow.contentView.removeChildView(view);
    } catch (e) {}
  }

  switchTab(id) {
    const nextTab = this.tabs.get(id);
    if (!nextTab) return;

    if (this.isSplitView) {
      // If in split view, replace the focused pane with this tab
      if (this.focusedPane === 'left') {
        const prevLeft = this.tabs.get(this.leftTabId);
        if (prevLeft && prevLeft.id !== id && prevLeft.id !== this.rightTabId) {
          this.removeViewSafely(prevLeft.view);
        }
        this.leftTabId = id;
      } else {
        const prevRight = this.tabs.get(this.rightTabId);
        if (prevRight && prevRight.id !== id && prevRight.id !== this.leftTabId) {
          this.removeViewSafely(prevRight.view);
        }
        this.rightTabId = id;
      }
      this.activeTabId = id;
      this.attachViewSafely(nextTab.view);
      this.updateActiveTabBounds();
      this.notifyTabsChanged();
      this.notifyActiveTabChanged(nextTab);
      this.notifySplitViewChanged();
      return;
    }

    // Single-pane mode switch
    const prevTab = this.tabs.get(this.activeTabId);
    if (prevTab && prevTab.view && prevTab.id !== id) {
      this.removeViewSafely(prevTab.view);
    }

    this.activeTabId = id;
    this.attachViewSafely(nextTab.view);
    this.updateActiveTabBounds();

    this.notifyTabsChanged();
    this.notifyActiveTabChanged(nextTab);
  }

  toggleSplitView(targetTabId = null) {
    if (this.isSplitView) {
      this.closeSplitView();
      return;
    }

    // Enter split view
    this.isSplitView = true;
    this.leftTabId = this.activeTabId;

    // Pick right tab
    if (targetTabId && this.tabs.has(targetTabId) && targetTabId !== this.leftTabId) {
      this.rightTabId = targetTabId;
    } else {
      // Find another available tab
      const otherKey = Array.from(this.tabs.keys()).find(k => k !== this.leftTabId);
      if (otherKey) {
        this.rightTabId = otherKey;
      } else {
        // Create new tab for the right pane
        const newTab = this.createTab('operecs://newtab', false);
        this.rightTabId = newTab.id;
      }
    }

    const leftTab = this.tabs.get(this.leftTabId);
    const rightTab = this.tabs.get(this.rightTabId);

    if (leftTab) this.attachViewSafely(leftTab.view);
    if (rightTab) this.attachViewSafely(rightTab.view);

    this.focusedPane = 'right';
    this.activeTabId = this.rightTabId;

    this.updateActiveTabBounds();
    this.notifyTabsChanged();
    this.notifySplitViewChanged();
    if (rightTab) this.notifyActiveTabChanged(rightTab);
  }

  closeSplitView() {
    if (!this.isSplitView) return;

    const rightTab = this.tabs.get(this.rightTabId);
    const leftTab = this.tabs.get(this.leftTabId);

    // Keep the focused pane tab active, remove the other
    let remainingTabId = this.focusedPane === 'right' && this.rightTabId ? this.rightTabId : this.leftTabId;
    let closingTabId = remainingTabId === this.leftTabId ? this.rightTabId : this.leftTabId;

    const closingTab = this.tabs.get(closingTabId);
    if (closingTab) {
      this.removeViewSafely(closingTab.view);
    }

    this.isSplitView = false;
    this.leftTabId = null;
    this.rightTabId = null;
    this.focusedPane = 'left';
    this.activeTabId = remainingTabId;

    const activeTab = this.tabs.get(this.activeTabId);
    if (activeTab) {
      this.attachViewSafely(activeTab.view);
    }

    this.updateActiveTabBounds();
    this.notifyTabsChanged();
    this.notifySplitViewChanged();
    if (activeTab) this.notifyActiveTabChanged(activeTab);
  }

  focusSplitPane(pane) {
    if (!this.isSplitView) return;
    this.focusedPane = pane === 'right' ? 'right' : 'left';
    const targetId = this.focusedPane === 'right' ? this.rightTabId : this.leftTabId;
    const tab = this.tabs.get(targetId);
    if (tab) {
      this.activeTabId = tab.id;
      this.notifyActiveTabChanged(tab);
      this.notifySplitViewChanged();
    }
  }

  closeTab(id) {
    const tabToClose = this.tabs.get(id);
    if (!tabToClose) return;

    if (this.isSplitView) {
      // If closing one of the split panes
      if (id === this.leftTabId || id === this.rightTabId) {
        this.closeSplitView();
      }
    }

    // Normal closing logic
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

      this.removeViewSafely(tabToClose.view);
      this.tabs.delete(id);

      if (nextId) {
        this.switchTab(nextId);
      } else {
        this.createTab('', true);
      }
    } else {
      this.removeViewSafely(tabToClose.view);
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
      isActive: t.id === this.activeTabId,
      isSplitLeft: this.isSplitView && t.id === this.leftTabId,
      isSplitRight: this.isSplitView && t.id === this.rightTabId
    }));
  }

  notifyTabsChanged() {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('tabs-updated', {
        tabs: this.getSerializedTabs(),
        activeTabId: this.activeTabId,
        isSplitView: this.isSplitView,
        leftTabId: this.leftTabId,
        rightTabId: this.rightTabId,
        focusedPane: this.focusedPane
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
        canGoForward: tab.canGoForward,
        isSplitView: this.isSplitView,
        focusedPane: this.focusedPane
      });
    }
  }

  notifySplitViewChanged() {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('split-view-changed', {
        isSplitView: this.isSplitView,
        leftTabId: this.leftTabId,
        rightTabId: this.rightTabId,
        focusedPane: this.focusedPane
      });
    }
  }
}

module.exports = TabManager;
