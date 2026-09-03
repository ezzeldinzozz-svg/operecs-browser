// Operecs Browser Renderer UI Logic

// DOM Elements: Sidebar
const sidebar = document.getElementById('sidebar');
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const tabStrip = document.getElementById('tab-strip');
const btnNewTab = document.getElementById('btn-new-tab');
const btnHistoryToggle = document.getElementById('btn-history-toggle');
const btnSettings = document.getElementById('btn-settings');
const pinnedItems = document.querySelectorAll('.pinned-item');

// DOM Elements: Top Navigation & Omnibox
const omniboxInput = document.getElementById('omnibox-input');
const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnReload = document.getElementById('btn-reload');
const reloadIcon = document.getElementById('reload-icon');
const stopIcon = document.getElementById('stop-icon');
const btnHome = document.getElementById('btn-home');
const btnBookmark = document.getElementById('btn-bookmark');
const starIcon = document.getElementById('star-icon');

// DOM Elements: Split View
const btnSplitToggle = document.getElementById('btn-split-toggle');
const splitPaneBadges = document.getElementById('split-pane-badges');
const badgePaneLeft = document.getElementById('badge-pane-left');
const badgePaneRight = document.getElementById('badge-pane-right');
const splitDivider = document.getElementById('split-divider');

// DOM Elements: Windows Controls
const btnMinimize = document.getElementById('btn-minimize');
const btnMaximize = document.getElementById('btn-maximize');
const btnClose = document.getElementById('btn-close');

// DOM Elements: History Modal
const historyDropdown = document.getElementById('history-dropdown');
const historyList = document.getElementById('history-list');
const btnClearHistory = document.getElementById('btn-clear-history');

// DOM Elements: Omnibox Shield & Zoom
const btnShield = document.getElementById('btn-shield');
const shieldCounter = document.getElementById('shield-counter');
const shieldPopup = document.getElementById('shield-popup');
const shieldToggleInput = document.getElementById('shield-toggle-input');
const shieldStatCount = document.getElementById('shield-stat-count');
const btnZoomReset = document.getElementById('btn-zoom-reset');

// DOM Elements: Downloads
const btnDownloads = document.getElementById('btn-downloads');
const downloadsBadge = document.getElementById('downloads-badge');
const downloadsPopup = document.getElementById('downloads-popup');
const btnOpenDownloadsTab = document.getElementById('btn-open-downloads-tab');
const downloadsList = document.getElementById('downloads-list');

// DOM Elements: Command Palette
const btnCmdPalette = document.getElementById('btn-cmd-palette');
const cmdBackdrop = document.getElementById('cmd-backdrop');
const cmdInput = document.getElementById('cmd-input');
const cmdResults = document.getElementById('cmd-results');

// DOM Elements: Find Bar
const findBar = document.getElementById('find-bar');
const findInput = document.getElementById('find-input');
const findCount = document.getElementById('find-count');
const btnFindPrev = document.getElementById('btn-find-prev');
const btnFindNext = document.getElementById('btn-find-next');
const btnFindClose = document.getElementById('btn-find-close');

// DOM Elements: Tab Context Menu
const tabContextMenu = document.getElementById('tab-context-menu');
const ctxPin = document.getElementById('ctx-pin');
const ctxDuplicate = document.getElementById('ctx-duplicate');
const ctxMute = document.getElementById('ctx-mute');
const ctxReload = document.getElementById('ctx-reload');
const ctxClose = document.getElementById('ctx-close');
const ctxCloseOthers = document.getElementById('ctx-close-others');
const ctxCloseRight = document.getElementById('ctx-close-right');

// Application State
let currentTabs = [];
let activeTabId = null;
let activeTab = null;
let isOmniboxFocused = false;
let isSidebarCollapsed = false;
let contextMenuTargetTab = null;
let selectedCmdIndex = 0;
let currentCmdItems = [];
let splitState = {
  isSplitView: false,
  leftTabId: null,
  rightTabId: null,
  focusedPane: 'left'
};

// ================= INITIALIZATION =================
async function init() {
  setupEventListeners();
  setupIpcListeners();

  // Fetch initial tabs if already loaded
  try {
    const tabs = await window.browserAPI.getTabs();
    if (tabs && tabs.length > 0) {
      currentTabs = tabs;
      const active = tabs.find(t => t.isActive) || tabs[0];
      if (active) {
        activeTabId = active.id;
        activeTab = active;
        updateToolbar();
      }
      renderTabs();
    }
  } catch (err) {
    console.error('Error fetching initial tabs:', err);
  }
}

// ================= EVENT LISTENERS =================
function setupEventListeners() {
  // Sidebar Collapse / Expand
  btnToggleSidebar.addEventListener('click', toggleSidebar);

  // New Tab
  btnNewTab.addEventListener('click', () => {
    window.browserAPI.createTab('');
  });

  // Pinned Items
  pinnedItems.forEach(item => {
    item.addEventListener('click', () => {
      const url = item.getAttribute('data-url');
      if (url) window.browserAPI.navigate(url);
    });
  });

  // Navigation
  btnBack.addEventListener('click', () => window.browserAPI.goBack());
  btnForward.addEventListener('click', () => window.browserAPI.goForward());
  btnReload.addEventListener('click', () => {
    if (activeTab && activeTab.isLoading) {
      window.browserAPI.stop();
    } else {
      window.browserAPI.reload();
    }
  });
  btnHome.addEventListener('click', () => window.browserAPI.navigate('operecs://newtab'));
  if (btnSettings) {
    btnSettings.addEventListener('click', () => {
      const existingTab = currentTabs.find(t => t.url === 'operecs://settings' || (t.url && t.url.includes('settings.html')));
      if (existingTab) {
        window.browserAPI.switchTab(existingTab.id);
      } else {
        window.browserAPI.createTab('operecs://settings');
      }
    });
  }

  // Split View Controls
  btnSplitToggle.addEventListener('click', () => {
    window.browserAPI.toggleSplitView();
  });

  badgePaneLeft.addEventListener('click', () => {
    window.browserAPI.focusSplitPane('left');
  });

  badgePaneRight.addEventListener('click', () => {
    window.browserAPI.focusSplitPane('right');
  });

  // Window Controls
  btnMinimize.addEventListener('click', () => window.browserAPI.minimizeWindow());
  btnMaximize.addEventListener('click', () => window.browserAPI.maximizeWindow());
  btnClose.addEventListener('click', () => window.browserAPI.closeWindow());

  // Omnibox
  omniboxInput.addEventListener('focus', () => {
    isOmniboxFocused = true;
    omniboxInput.select();
  });

  omniboxInput.addEventListener('blur', () => {
    isOmniboxFocused = false;
    if (activeTab) {
      omniboxInput.value = activeTab.displayUrl || '';
    }
  });

  omniboxInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const input = omniboxInput.value.trim();
      if (input) {
        window.browserAPI.navigate(input);
        omniboxInput.blur();
      }
    } else if (e.key === 'Escape') {
      if (activeTab) {
        omniboxInput.value = activeTab.displayUrl || '';
      }
      omniboxInput.blur();
    }
  });

  // Bookmark Toggle
  btnBookmark.addEventListener('click', async () => {
    if (!activeTab || !activeTab.url || activeTab.url === 'operecs://newtab') return;
    const isBookmarked = await window.browserAPI.isBookmarked(activeTab.url);
    if (isBookmarked) {
      await window.browserAPI.removeBookmark(activeTab.url);
    } else {
      await window.browserAPI.addBookmark({
        title: activeTab.title || activeTab.url,
        url: activeTab.url,
        favicon: activeTab.favicon
      });
    }
    await checkBookmarkStatus(activeTab.url);
  });

  // History Dropdown Toggle
  btnHistoryToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleHistoryDropdown();
  });

  btnClearHistory.addEventListener('click', async () => {
    await window.browserAPI.clearHistory();
    renderHistoryList([]);
  });

  // Privacy Shield Toggle Popover
  btnShield.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleShieldPopup();
  });

  shieldToggleInput.addEventListener('change', async () => {
    const enabled = await window.browserAPI.toggleShield();
    shieldToggleInput.checked = enabled;
    if (enabled) {
      btnShield.classList.remove('shield-disabled');
    } else {
      btnShield.classList.add('shield-disabled');
    }
  });

  // Zoom Reset
  btnZoomReset.addEventListener('click', () => {
    window.browserAPI.resetZoom();
  });

  // Downloads Toggle Popover
  btnDownloads.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDownloadsPopup();
  });

  btnOpenDownloadsTab.addEventListener('click', () => {
    window.browserAPI.createTab('operecs://downloads');
    downloadsPopup.classList.add('hidden');
  });

  // Command Palette
  btnCmdPalette.addEventListener('click', () => {
    openCommandPalette();
  });

  cmdBackdrop.addEventListener('click', (e) => {
    if (e.target === cmdBackdrop) closeCommandPalette();
  });

  cmdInput.addEventListener('input', () => {
    filterCommandPalette(cmdInput.value);
  });

  cmdInput.addEventListener('keydown', (e) => {
    handleCommandPaletteKey(e);
  });

  // Find in Page
  btnFindPrev.addEventListener('click', () => findNext(false));
  btnFindNext.addEventListener('click', () => findNext(true));
  btnFindClose.addEventListener('click', () => closeFindBar());

  findInput.addEventListener('input', () => {
    doFind();
  });

  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      findNext(!e.shiftKey);
    } else if (e.key === 'Escape') {
      closeFindBar();
    }
  });

  // Tab Context Menu Actions
  ctxPin.addEventListener('click', () => {
    if (contextMenuTargetTab) window.browserAPI.togglePinTab(contextMenuTargetTab.id);
    hideTabContextMenu();
  });

  ctxDuplicate.addEventListener('click', () => {
    if (contextMenuTargetTab) window.browserAPI.duplicateTab(contextMenuTargetTab.id);
    hideTabContextMenu();
  });

  ctxMute.addEventListener('click', () => {
    if (contextMenuTargetTab) window.browserAPI.toggleMuteTab(contextMenuTargetTab.id);
    hideTabContextMenu();
  });

  ctxReload.addEventListener('click', () => {
    if (contextMenuTargetTab) window.browserAPI.reload();
    hideTabContextMenu();
  });

  ctxClose.addEventListener('click', () => {
    if (contextMenuTargetTab) window.browserAPI.closeTab(contextMenuTargetTab.id);
    hideTabContextMenu();
  });

  ctxCloseOthers.addEventListener('click', () => {
    if (contextMenuTargetTab) window.browserAPI.closeOtherTabs(contextMenuTargetTab.id);
    hideTabContextMenu();
  });

  ctxCloseRight.addEventListener('click', () => {
    if (contextMenuTargetTab) window.browserAPI.closeTabsToRight(contextMenuTargetTab.id);
    hideTabContextMenu();
  });

  // Close all popovers and context menus on outside click
  document.addEventListener('click', (e) => {
    if (!historyDropdown.contains(e.target) && e.target !== btnHistoryToggle) {
      historyDropdown.classList.add('hidden');
    }
    if (!shieldPopup.contains(e.target) && !btnShield.contains(e.target)) {
      shieldPopup.classList.add('hidden');
    }
    if (!downloadsPopup.contains(e.target) && !btnDownloads.contains(e.target)) {
      downloadsPopup.classList.add('hidden');
    }
    if (!tabContextMenu.contains(e.target)) {
      hideTabContextMenu();
    }
  });

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 't') {
      e.preventDefault();
      window.browserAPI.createTab('');
    } else if (e.ctrlKey && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      if (activeTabId) window.browserAPI.closeTab(activeTabId);
    } else if (e.ctrlKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      toggleSidebar();
    } else if (e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      window.browserAPI.toggleSplitView();
    } else if (e.ctrlKey && (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'p')) {
      e.preventDefault();
      openCommandPalette();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      openFindBar();
    } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 't') {
      e.preventDefault();
      window.browserAPI.reopenClosedTab();
    } else if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      window.browserAPI.zoomIn();
    } else if (e.ctrlKey && e.key === '-') {
      e.preventDefault();
      window.browserAPI.zoomOut();
    } else if (e.ctrlKey && e.key === '0') {
      e.preventDefault();
      window.browserAPI.resetZoom();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      window.browserAPI.reload();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      omniboxInput.focus();
      omniboxInput.select();
    } else if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      window.browserAPI.goBack();
    } else if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      window.browserAPI.goForward();
    }
  });
}

// ================= SIDEBAR TOGGLE =================
function toggleSidebar() {
  isSidebarCollapsed = !isSidebarCollapsed;
  if (isSidebarCollapsed) {
    sidebar.classList.add('collapsed');
    window.browserAPI.setSidebarWidth(56);
  } else {
    sidebar.classList.remove('collapsed');
    window.browserAPI.setSidebarWidth(240);
  }
}

// ================= IPC LISTENERS =================
function setupIpcListeners() {
  window.browserAPI.onTabsUpdated(({ tabs, activeTabId: newActiveId, isSplitView, leftTabId, rightTabId, focusedPane }) => {
    currentTabs = tabs;
    activeTabId = newActiveId;
    activeTab = tabs.find(t => t.id === activeTabId) || null;
    splitState = { isSplitView, leftTabId, rightTabId, focusedPane };

    updateSplitUi();
    renderTabs();
    updateToolbar();
  });

  window.browserAPI.onTabStatusUpdated((updatedTab) => {
    const idx = currentTabs.findIndex(t => t.id === updatedTab.id);
    if (idx !== -1) {
      currentTabs[idx] = updatedTab;
    }
    if (updatedTab.id === activeTabId) {
      activeTab = updatedTab;
      updateToolbar();
    }
    updateTabElement(updatedTab);
  });

  window.browserAPI.onActiveTabChanged((tab) => {
    activeTabId = tab.id;
    activeTab = tab;
    if (tab.isSplitView !== undefined) {
      splitState.isSplitView = tab.isSplitView;
      splitState.focusedPane = tab.focusedPane || 'left';
      updateSplitUi();
    }
    renderTabs();
    updateToolbar();
  });

  window.browserAPI.onSplitViewChanged((state) => {
    splitState = state;
    updateSplitUi();
    renderTabs();
    if (activeTabId) {
      activeTab = currentTabs.find(t => t.id === activeTabId) || null;
      updateToolbar();
    }
  });

  window.browserAPI.onFocusOmnibox(() => {
    omniboxInput.focus();
    omniboxInput.select();
  });

  if (window.browserAPI.onToggleSidebar) {
    window.browserAPI.onToggleSidebar(() => toggleSidebar());
  }

  if (window.browserAPI.onOpenCommandPalette) {
    window.browserAPI.onOpenCommandPalette(() => openCommandPalette());
  }

  if (window.browserAPI.onOpenFindBar) {
    window.browserAPI.onOpenFindBar(() => openFindBar());
  }

  if (window.browserAPI.onFindResult) {
    window.browserAPI.onFindResult((res) => updateFindResult(res));
  }

  if (window.browserAPI.onShieldCountUpdated) {
    window.browserAPI.onShieldCountUpdated(({ wcId, count }) => {
      if (activeTab && activeTab.wcId === wcId) {
        shieldCounter.textContent = count;
        shieldStatCount.textContent = count;
      }
    });
  }

  if (window.browserAPI.onDownloadsUpdated) {
    window.browserAPI.onDownloadsUpdated((downloads) => {
      updateDownloadsUi(downloads);
    });
  }
}

// ================= SPLIT VIEW UI =================
function updateSplitUi() {
  if (splitState.isSplitView) {
    btnSplitToggle.classList.add('active');
    btnSplitToggle.querySelector('.split-label').textContent = 'Exit Split';
    splitPaneBadges.classList.remove('hidden');
    splitDivider.classList.remove('hidden');

    if (splitState.focusedPane === 'left') {
      badgePaneLeft.classList.add('active');
      badgePaneRight.classList.remove('active');
    } else {
      badgePaneLeft.classList.remove('active');
      badgePaneRight.classList.add('active');
    }
  } else {
    btnSplitToggle.classList.remove('active');
    btnSplitToggle.querySelector('.split-label').textContent = 'Split';
    splitPaneBadges.classList.add('hidden');
    splitDivider.classList.add('hidden');
  }
}

// ================= TAB RENDERING =================
function renderTabs() {
  tabStrip.innerHTML = '';

  currentTabs.forEach(tab => {
    const isLeft = splitState.isSplitView && tab.id === splitState.leftTabId;
    const isRight = splitState.isSplitView && tab.id === splitState.rightTabId;
    const isActive = tab.id === activeTabId;

    const tabEl = document.createElement('div');
    let classes = ['tab'];
    if (isActive) classes.push('active');
    if (isLeft) classes.push('split-left');
    if (isRight) classes.push('split-right');
    if (tab.isPinned) classes.push('pinned');
    tabEl.className = classes.join(' ');
    tabEl.id = `tab-el-${tab.id}`;

    // Icon or Spinner
    const iconContainer = document.createElement('div');
    iconContainer.className = 'tab-icon-container';
    if (tab.isLoading) {
      iconContainer.innerHTML = '<div class="tab-spinner"></div>';
    } else if (tab.favicon) {
      iconContainer.innerHTML = `<img class="tab-favicon" src="${tab.favicon}" onerror="this.style.display='none'" />`;
    } else {
      iconContainer.innerHTML = `
        <svg class="tab-favicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>`;
    }

    // Title
    const titleEl = document.createElement('span');
    titleEl.className = 'tab-title';
    titleEl.textContent = tab.title || 'New Tab';
    titleEl.title = tab.title || 'New Tab';

    tabEl.appendChild(iconContainer);
    tabEl.appendChild(titleEl);

    // Audio / Mute Indicator
    if (tab.isAudible) {
      const audioBtn = document.createElement('button');
      audioBtn.className = 'tab-audio-btn';
      audioBtn.title = tab.isMuted ? 'Unmute tab' : 'Mute tab';
      if (tab.isMuted) {
        audioBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <line x1="23" y1="9" x2="17" y2="15"></line>
            <line x1="17" y1="9" x2="23" y2="15"></line>
          </svg>`;
      } else {
        audioBtn.innerHTML = `
          <div class="sound-waves">
            <span></span>
            <span></span>
            <span></span>
          </div>`;
      }
      audioBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.browserAPI.toggleMuteTab(tab.id);
      });
      tabEl.appendChild(audioBtn);
    }

    // Split Badge if active in split view
    if (isLeft) {
      const badge = document.createElement('span');
      badge.className = 'tab-badge';
      badge.textContent = 'Left';
      tabEl.appendChild(badge);
    } else if (isRight) {
      const badge = document.createElement('span');
      badge.className = 'tab-badge';
      badge.textContent = 'Right';
      tabEl.appendChild(badge);
    }

    // Close Button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.title = 'Close tab (Ctrl+W)';
    closeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>`;

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.browserAPI.closeTab(tab.id);
    });

    tabEl.appendChild(closeBtn);

    tabEl.addEventListener('click', () => {
      window.browserAPI.switchTab(tab.id);
    });

    // Right-click Context Menu
    tabEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openTabContextMenu(e.clientX, e.clientY, tab);
    });

    tabStrip.appendChild(tabEl);
  });
}

function updateTabElement(tab) {
  const tabEl = document.getElementById(`tab-el-${tab.id}`);
  if (!tabEl) return;

  const iconContainer = tabEl.querySelector('.tab-icon-container');
  if (iconContainer) {
    if (tab.isLoading) {
      iconContainer.innerHTML = '<div class="tab-spinner"></div>';
    } else if (tab.favicon) {
      iconContainer.innerHTML = `<img class="tab-favicon" src="${tab.favicon}" onerror="this.style.display='none'" />`;
    } else {
      iconContainer.innerHTML = `
        <svg class="tab-favicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>`;
    }
  }

  const titleEl = tabEl.querySelector('.tab-title');
  if (titleEl) {
    titleEl.textContent = tab.title || 'New Tab';
    titleEl.title = tab.title || 'New Tab';
  }
}

// ================= TOOLBAR & OMNIBOX =================
async function updateToolbar() {
  if (!activeTab) return;

  // Update Omnibox value if not currently typing
  if (!isOmniboxFocused) {
    omniboxInput.value = activeTab.displayUrl || '';
  }

  // Navigation states
  btnBack.disabled = !activeTab.canGoBack;
  btnForward.disabled = !activeTab.canGoForward;

  // Loading icon
  if (activeTab.isLoading) {
    reloadIcon.classList.add('hidden');
    stopIcon.classList.remove('hidden');
    btnReload.title = 'Stop loading';
  } else {
    reloadIcon.classList.remove('hidden');
    stopIcon.classList.add('hidden');
    btnReload.title = 'Reload (Ctrl+R)';
  }

  // Zoom Reset Badge
  if (activeTab.zoomLevel && activeTab.zoomLevel !== 0) {
    btnZoomReset.classList.remove('hidden');
    const pct = Math.round((1 + activeTab.zoomLevel * 0.2) * 100);
    btnZoomReset.textContent = `${pct}%`;
  } else {
    btnZoomReset.classList.add('hidden');
  }

  // Privacy Shield Count
  if (activeTab.wcId) {
    window.browserAPI.getBlockedCount(activeTab.wcId).then(count => {
      shieldCounter.textContent = count || 0;
      shieldStatCount.textContent = count || 0;
    });
  }

  // Bookmark status
  await checkBookmarkStatus(activeTab.url);
}

async function checkBookmarkStatus(url) {
  if (!url || url === 'operecs://newtab') {
    btnBookmark.classList.remove('bookmarked');
    btnBookmark.title = 'Bookmark this tab';
    return;
  }
  const isBookmarked = await window.browserAPI.isBookmarked(url);
  if (isBookmarked) {
    btnBookmark.classList.add('bookmarked');
    btnBookmark.title = 'Remove bookmark';
  } else {
    btnBookmark.classList.remove('bookmarked');
    btnBookmark.title = 'Bookmark this tab';
  }
}

// ================= HISTORY =================
async function toggleHistoryDropdown() {
  if (historyDropdown.classList.contains('hidden')) {
    const history = await window.browserAPI.getHistory();
    renderHistoryList(history);
    historyDropdown.classList.remove('hidden');
  } else {
    historyDropdown.classList.add('hidden');
  }
}

function renderHistoryList(history) {
  historyList.innerHTML = '';
  if (!history || history.length === 0) {
    historyList.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-secondary); font-size: 0.8rem;">No browsing history yet</div>';
    return;
  }

  history.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = 'history-item';
    itemEl.innerHTML = `
      <div class="history-item-title">${escapeHtml(item.title || item.url)}</div>
      <div class="history-item-url">${escapeHtml(item.url)}</div>
    `;

    itemEl.addEventListener('click', () => {
      window.browserAPI.navigate(item.url);
      historyDropdown.classList.add('hidden');
    });

    historyList.appendChild(itemEl);
  });
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

// ================= PRIVACY SHIELD =================
function toggleShieldPopup() {
  if (shieldPopup.classList.contains('hidden')) {
    shieldPopup.classList.remove('hidden');
    historyDropdown.classList.add('hidden');
    downloadsPopup.classList.add('hidden');
    if (activeTab && activeTab.wcId) {
      window.browserAPI.getBlockedCount(activeTab.wcId).then(count => {
        shieldStatCount.textContent = count || 0;
      });
    }
  } else {
    shieldPopup.classList.add('hidden');
  }
}

// ================= DOWNLOADS =================
function toggleDownloadsPopup() {
  if (downloadsPopup.classList.contains('hidden')) {
    downloadsPopup.classList.remove('hidden');
    historyDropdown.classList.add('hidden');
    shieldPopup.classList.add('hidden');
    window.browserAPI.getDownloads().then(updateDownloadsUi);
  } else {
    downloadsPopup.classList.add('hidden');
  }
}

function updateDownloadsUi(downloads) {
  if (!downloads) downloads = [];
  const activeCount = downloads.filter(d => d.state === 'progressing').length;
  if (activeCount > 0) {
    downloadsBadge.textContent = activeCount;
    downloadsBadge.classList.remove('hidden');
  } else {
    downloadsBadge.classList.add('hidden');
  }

  if (downloads.length === 0) {
    downloadsList.innerHTML = '<div class="empty-downloads">No recent downloads</div>';
    return;
  }

  downloadsList.innerHTML = '';
  downloads.slice(0, 10).forEach(d => {
    const item = document.createElement('div');
    item.className = 'download-item';
    item.innerHTML = `
      <div class="download-item-top">
        <span class="download-filename" title="${escapeHtml(d.fileName)}">${escapeHtml(d.fileName)}</span>
        <div class="download-actions">
          ${d.savePath ? `<button class="download-action-btn" title="Open" data-id="${d.id}" data-action="open">📂</button>` : ''}
          ${d.savePath ? `<button class="download-action-btn" title="Show in folder" data-id="${d.id}" data-action="folder">🔍</button>` : ''}
          ${d.state === 'progressing' ? `<button class="download-action-btn" title="Cancel" data-id="${d.id}" data-action="cancel">✕</button>` : ''}
        </div>
      </div>
      ${d.state === 'progressing' ? `
        <div class="download-progress-bar-bg">
          <div class="download-progress-bar-fill" style="width: ${d.percentage}%"></div>
        </div>
      ` : ''}
      <div class="download-status-line">
        <span style="color: ${d.state === 'completed' ? '#4ade80' : d.state === 'progressing' ? '#c7adff' : '#f87171'}">${d.state.toUpperCase()}</span>
        <span>${formatBytes(d.receivedBytes)} / ${formatBytes(d.totalBytes)}</span>
      </div>
    `;

    // Action clicks
    item.querySelectorAll('.download-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');
        if (action === 'open') window.browserAPI.openDownload(id);
        else if (action === 'folder') window.browserAPI.showDownloadInFolder(id);
        else if (action === 'cancel') window.browserAPI.cancelDownload(id);
      });
    });

    downloadsList.appendChild(item);
  });
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

// ================= IN-PAGE FIND (Ctrl+F) =================
function openFindBar() {
  findBar.classList.remove('hidden');
  findInput.focus();
  findInput.select();
  if (findInput.value) {
    doFind();
  }
}

function closeFindBar() {
  findBar.classList.add('hidden');
  window.browserAPI.stopFindInPage('clearSelection');
  findCount.textContent = '0/0';
}

function doFind() {
  const query = findInput.value.trim();
  if (query) {
    window.browserAPI.findInPage(query, { findNext: false });
  } else {
    window.browserAPI.stopFindInPage('clearSelection');
    findCount.textContent = '0/0';
  }
}

function findNext(forward = true) {
  const query = findInput.value.trim();
  if (query) {
    window.browserAPI.findInPage(query, { findNext: true, forward });
  }
}

function updateFindResult(result) {
  if (result.matches !== undefined) {
    findCount.textContent = `${result.activeMatchOrdinal || 0}/${result.matches}`;
  }
}

// ================= SPOTLIGHT COMMAND PALETTE (Ctrl+K) =================
const SYSTEM_COMMANDS = [
  { title: 'New Tab', group: 'Actions', icon: '➕', shortcut: 'Ctrl+T', action: () => window.browserAPI.createTab('') },
  { title: 'Toggle Split View', group: 'Actions', icon: '🪟', shortcut: 'Alt+S', action: () => window.browserAPI.toggleSplitView() },
  { title: 'Find in Page', group: 'Actions', icon: '🔍', shortcut: 'Ctrl+F', action: () => openFindBar() },
  { title: 'Open Settings', group: 'Actions', icon: '⚙️', shortcut: '', action: () => window.browserAPI.createTab('operecs://settings') },
  { title: 'Open Downloads', group: 'Actions', icon: '📥', shortcut: 'Ctrl+J', action: () => window.browserAPI.createTab('operecs://downloads') },
  { title: 'Toggle Privacy Shield', group: 'Actions', icon: '🛡️', shortcut: '', action: async () => {
    const enabled = await window.browserAPI.toggleShield();
    shieldToggleInput.checked = enabled;
  }},
  { title: 'Reopen Closed Tab', group: 'Actions', icon: '↺', shortcut: 'Ctrl+Shift+T', action: () => window.browserAPI.reopenClosedTab() },
  { title: 'Toggle Collapsible Sidebar', group: 'Actions', icon: '◀', shortcut: 'Ctrl+S', action: () => toggleSidebar() },
  { title: 'Zoom In', group: 'Actions', icon: '🔍+', shortcut: 'Ctrl++', action: () => window.browserAPI.zoomIn() },
  { title: 'Zoom Out', group: 'Actions', icon: '🔍-', shortcut: 'Ctrl+-', action: () => window.browserAPI.zoomOut() },
  { title: 'Reset Zoom (100%)', group: 'Actions', icon: '🔍100', shortcut: 'Ctrl+0', action: () => window.browserAPI.resetZoom() },
  { title: 'Clear Browsing History', group: 'Actions', icon: '🧹', shortcut: '', action: () => window.browserAPI.clearHistory() }
];

async function openCommandPalette() {
  cmdBackdrop.classList.remove('hidden');
  cmdInput.value = '';
  cmdInput.focus();
  await filterCommandPalette('');
}

function closeCommandPalette() {
  cmdBackdrop.classList.add('hidden');
}

async function filterCommandPalette(query) {
  const q = query.toLowerCase().trim();
  currentCmdItems = [];

  // 1. Actions
  const matchedActions = SYSTEM_COMMANDS.filter(cmd => !q || cmd.title.toLowerCase().includes(q));
  matchedActions.forEach(a => currentCmdItems.push({ ...a, type: 'action' }));

  // 2. Open Tabs
  const matchedTabs = currentTabs.filter(t => !q || (t.title && t.title.toLowerCase().includes(q)) || (t.url && t.url.toLowerCase().includes(q)));
  matchedTabs.forEach(t => currentCmdItems.push({
    title: t.title || t.url || 'Tab',
    group: 'Open Tabs',
    icon: '📑',
    shortcut: t.isActive ? 'Active' : 'Switch',
    action: () => window.browserAPI.switchTab(t.id)
  }));

  // 3. Bookmarks
  try {
    const bookmarks = await window.browserAPI.getBookmarks();
    if (bookmarks) {
      const matchedBm = bookmarks.filter(b => !q || (b.title && b.title.toLowerCase().includes(q)) || (b.url && b.url.toLowerCase().includes(q))).slice(0, 5);
      matchedBm.forEach(b => currentCmdItems.push({
        title: b.title || b.url,
        group: 'Bookmarks',
        icon: '🔖',
        shortcut: 'Navigate',
        action: () => window.browserAPI.navigate(b.url)
      }));
    }
  } catch (err) {}

  selectedCmdIndex = 0;
  renderCommandResults();
}

function renderCommandResults() {
  cmdResults.innerHTML = '';
  if (currentCmdItems.length === 0) {
    cmdResults.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-secondary); font-size: 0.85rem;">No matching commands or pages</div>';
    return;
  }

  let currentGroup = null;
  currentCmdItems.forEach((item, index) => {
    if (item.group !== currentGroup) {
      currentGroup = item.group;
      const groupEl = document.createElement('div');
      groupEl.className = 'cmd-group-label';
      groupEl.textContent = currentGroup;
      cmdResults.appendChild(groupEl);
    }

    const itemEl = document.createElement('div');
    itemEl.className = `cmd-item ${index === selectedCmdIndex ? 'selected' : ''}`;
    itemEl.innerHTML = `
      <div class="cmd-item-left">
        <span class="cmd-item-icon">${item.icon}</span>
        <span class="cmd-item-title">${escapeHtml(item.title)}</span>
      </div>
      ${item.shortcut ? `<span class="cmd-item-shortcut">${escapeHtml(item.shortcut)}</span>` : ''}
    `;

    itemEl.addEventListener('click', () => {
      executeCommand(index);
    });

    itemEl.addEventListener('mouseenter', () => {
      selectedCmdIndex = index;
      updateCmdSelection();
    });

    cmdResults.appendChild(itemEl);
  });
}

function updateCmdSelection() {
  const items = cmdResults.querySelectorAll('.cmd-item');
  items.forEach((el, idx) => {
    if (idx === selectedCmdIndex) {
      el.classList.add('selected');
      el.scrollIntoView({ block: 'nearest' });
    } else {
      el.classList.remove('selected');
    }
  });
}

function handleCommandPaletteKey(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (currentCmdItems.length > 0) {
      selectedCmdIndex = (selectedCmdIndex + 1) % currentCmdItems.length;
      updateCmdSelection();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (currentCmdItems.length > 0) {
      selectedCmdIndex = (selectedCmdIndex - 1 + currentCmdItems.length) % currentCmdItems.length;
      updateCmdSelection();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    executeCommand(selectedCmdIndex);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeCommandPalette();
  }
}

function executeCommand(index) {
  const item = currentCmdItems[index];
  if (item && item.action) {
    closeCommandPalette();
    item.action();
  }
}

// ================= TAB CONTEXT MENU =================
function openTabContextMenu(x, y, tab) {
  contextMenuTargetTab = tab;
  tabContextMenu.classList.remove('hidden');

  const maxX = window.innerWidth - 180;
  const maxY = window.innerHeight - 240;
  tabContextMenu.style.left = `${Math.min(x, maxX)}px`;
  tabContextMenu.style.top = `${Math.min(y, maxY)}px`;

  ctxPin.querySelector('.ctx-label').textContent = tab.isPinned ? 'Unpin Tab' : 'Pin Tab';
  ctxMute.querySelector('.ctx-label').textContent = tab.isMuted ? 'Unmute Tab' : 'Mute Tab';
}

function hideTabContextMenu() {
  tabContextMenu.classList.add('hidden');
  contextMenuTargetTab = null;
}

// Start app
init();
