// Operecs Browser Renderer UI Logic - Complete Chrome Architecture

// DOM Elements: Header & Horizontal Tabs
const chromeHeader = document.getElementById('chrome-header');
const tabStripRow = document.getElementById('tab-strip-row');
const chromeTabsList = document.getElementById('chrome-tabs-list');
const btnTopNewTab = document.getElementById('btn-top-new-tab');
const incognitoBadge = document.getElementById('incognito-badge');

// DOM Elements: Bookmarks Bar
const bookmarksBar = document.getElementById('bookmarks-bar');
const bookmarksChipsList = document.getElementById('bookmarks-chips-list');
const btnOtherBookmarks = document.getElementById('btn-other-bookmarks');

// DOM Elements: Sidebar (Vertical Mode)
const sidebar = document.getElementById('sidebar');
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const tabStrip = document.getElementById('tab-strip');
const btnSidebarNewTab = document.getElementById('btn-sidebar-new-tab');

// DOM Elements: Top Navigation & Omnibox
const omniboxWrapper = document.getElementById('omnibox-wrapper');
const omniboxInput = document.getElementById('omnibox-input');
const omniboxDropdown = document.getElementById('omnibox-dropdown');
const securityBadge = document.getElementById('security-badge');
const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnReload = document.getElementById('btn-reload');
const reloadIcon = document.getElementById('reload-icon');
const stopIcon = document.getElementById('stop-icon');
const btnHome = document.getElementById('btn-home');
const btnBookmark = document.getElementById('btn-bookmark');
const starIcon = document.getElementById('star-icon');
const btnZoomReset = document.getElementById('btn-zoom-reset');

// DOM Elements: Utility Controls
const btnSplitToggle = document.getElementById('btn-split-toggle');
const btnCmdPalette = document.getElementById('btn-cmd-palette');
const btnDownloads = document.getElementById('btn-downloads');
const downloadsBadge = document.getElementById('downloads-badge');
const btnProfileMenu = document.getElementById('btn-profile-menu');
const btnChromeMenu = document.getElementById('btn-chrome-menu');

// DOM Elements: Windows Controls
const btnMinimize = document.getElementById('btn-minimize');
const btnMaximize = document.getElementById('btn-maximize');
const btnClose = document.getElementById('btn-close');

// DOM Elements: Popups & Flyouts
const chromeMenuDropdown = document.getElementById('chrome-menu-dropdown');
const siteInfoPopup = document.getElementById('site-info-popup');
const bookmarkPopup = document.getElementById('bookmark-popup');
const bmPopupName = document.getElementById('bm-popup-name');
const bmPopupFolder = document.getElementById('bm-popup-folder');
const btnBmRemove = document.getElementById('btn-bm-remove');
const btnBmDone = document.getElementById('btn-bm-done');

// DOM Elements: Clear Data Modal
const clearDataModal = document.getElementById('clear-data-modal');
const btnCloseClearModal = document.getElementById('btn-close-clear-modal');
const btnCancelClearData = document.getElementById('btn-cancel-clear-data');
const btnConfirmClearData = document.getElementById('btn-confirm-clear-data');
const clearDataRange = document.getElementById('clear-data-range');
const chkClearHistory = document.getElementById('chk-clear-history');
const chkClearCookies = document.getElementById('chk-clear-cookies');
const chkClearCache = document.getElementById('chk-clear-cache');

// DOM Elements: Privacy Shield & Downloads Shelf
const btnShield = document.getElementById('btn-shield');
const shieldCounter = document.getElementById('shield-counter');
const shieldPopup = document.getElementById('shield-popup');
const shieldToggleInput = document.getElementById('shield-toggle-input');
const shieldStatCount = document.getElementById('shield-stat-count');
const downloadsPopup = document.getElementById('downloads-popup');
const btnOpenDownloadsTab = document.getElementById('btn-open-downloads-tab');
const downloadsList = document.getElementById('downloads-list');

// DOM Elements: Command Palette
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
const ctxNewTab = document.getElementById('ctx-new-tab');
const ctxPin = document.getElementById('ctx-pin');
const ctxDuplicate = document.getElementById('ctx-duplicate');
const ctxMute = document.getElementById('ctx-mute');
const ctxReload = document.getElementById('ctx-reload');
const ctxClose = document.getElementById('ctx-close');
const ctxCloseOthers = document.getElementById('ctx-close-others');
const ctxCloseRight = document.getElementById('ctx-close-right');

// DOM Elements: Split Divider
const splitDivider = document.getElementById('split-divider');

// Application State
let currentTabs = [];
let activeTabId = null;
let activeTab = null;
let isOmniboxFocused = false;
let isSidebarCollapsed = false;
let contextMenuTargetTab = null;
let selectedCmdIndex = 0;
let currentCmdItems = [];
let omniboxSuggestions = [];
let selectedSuggestionIndex = -1;
let currentSettings = {
  tabLayout: 'horizontal',
  showBookmarksBar: true,
  showHomeButton: true,
  searchEngine: 'https://www.google.com/search?q='
};

let splitState = {
  isSplitView: false,
  leftTabId: null,
  rightTabId: null,
  focusedPane: 'left'
};

// Check if running as incognito window
const isIncognito = window.location.search.includes('incognito=true');
if (isIncognito && incognitoBadge) {
  incognitoBadge.classList.remove('hidden');
}

// ================= INITIALIZATION =================
async function init() {
  await loadAndApplySettings();
  setupEventListeners();
  setupIpcListeners();
  setupChromeMenu();
  setupSiteInfoPopup();
  setupBookmarkPopup();
  setupClearDataModal();
  setupOmniboxSuggestions();
  renderBookmarksBar();

  // Fetch initial tabs if already created
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

// ================= SETTINGS & LAYOUT =================
async function loadAndApplySettings() {
  try {
    const s = await window.browserAPI.getSettings();
    if (s) {
      currentSettings = { ...currentSettings, ...s };
    }
  } catch (err) {
    console.warn('Could not load settings:', err);
  }

  applyLayout();
}

function applyLayout() {
  const isHorizontal = currentSettings.tabLayout !== 'vertical';

  if (isHorizontal) {
    if (tabStripRow) tabStripRow.style.display = 'flex';
    if (sidebar) sidebar.classList.add('hidden');
  } else {
    if (tabStripRow) tabStripRow.style.display = 'none';
    if (sidebar) sidebar.classList.remove('hidden');
  }

  // Bookmarks Bar
  if (currentSettings.showBookmarksBar) {
    bookmarksBar.classList.remove('hidden');
  } else {
    bookmarksBar.classList.add('hidden');
  }

  // Home Button
  if (currentSettings.showHomeButton === false) {
    btnHome.classList.add('hidden');
  } else {
    btnHome.classList.remove('hidden');
  }

  // Calculate pixel bounds for active WebContentsView
  let sidebarWidth = 0;
  let topBarHeight = 84; // 40px tab strip + 44px nav bar

  if (isHorizontal) {
    sidebarWidth = 0;
    topBarHeight = currentSettings.showBookmarksBar ? 116 : 84;
  } else {
    sidebarWidth = isSidebarCollapsed ? 56 : 240;
    topBarHeight = currentSettings.showBookmarksBar ? 76 : 44;
  }

  if (window.browserAPI.setLayoutBounds) {
    window.browserAPI.setLayoutBounds({ sidebarWidth, topBarHeight });
  }
}

// ================= EVENT LISTENERS =================
function setupEventListeners() {
  // Top New Tab (+)
  if (btnTopNewTab) {
    btnTopNewTab.addEventListener('click', () => {
      window.browserAPI.createTab('');
    });
  }

  // Sidebar New Tab
  if (btnSidebarNewTab) {
    btnSidebarNewTab.addEventListener('click', () => {
      window.browserAPI.createTab('');
    });
  }

  // Sidebar Toggle
  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', toggleSidebar);
  }

  // Navigation Buttons
  btnBack.addEventListener('click', () => window.browserAPI.goBack());
  btnForward.addEventListener('click', () => window.browserAPI.goForward());
  btnReload.addEventListener('click', () => {
    if (activeTab && activeTab.isLoading) {
      window.browserAPI.stop();
    } else {
      window.browserAPI.reload();
    }
  });

  btnHome.addEventListener('click', () => {
    const home = currentSettings.homeUrl || 'operecs://newtab';
    window.browserAPI.navigate(home);
  });

  // Split View
  btnSplitToggle.addEventListener('click', () => {
    window.browserAPI.toggleSplitView();
  });

  // Window Controls
  btnMinimize.addEventListener('click', () => window.browserAPI.minimizeWindow());
  btnMaximize.addEventListener('click', () => window.browserAPI.maximizeWindow());
  btnClose.addEventListener('click', () => window.browserAPI.closeWindow());

  // Downloads Button & Shelf
  btnDownloads.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDownloadsPopup();
  });

  btnOpenDownloadsTab.addEventListener('click', () => {
    window.browserAPI.createTab('operecs://downloads');
    downloadsPopup.classList.add('hidden');
  });

  // Profile Button
  if (btnProfileMenu) {
    btnProfileMenu.addEventListener('click', () => {
      window.browserAPI.createTab('operecs://settings#section-profile');
    });
  }

  // Other Bookmarks Button
  if (btnOtherBookmarks) {
    btnOtherBookmarks.addEventListener('click', () => {
      window.browserAPI.createTab('operecs://bookmarks');
    });
  }

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

  // Zoom Reset Badge
  btnZoomReset.addEventListener('click', () => {
    window.browserAPI.resetZoom();
  });

  // Command Palette
  btnCmdPalette.addEventListener('click', () => {
    openCommandPalette();
  });

  // Find in Page
  btnFindPrev.addEventListener('click', () => findNext(false));
  btnFindNext.addEventListener('click', () => findNext(true));
  btnFindClose.addEventListener('click', () => closeFindBar());

  findInput.addEventListener('input', () => doFind());
  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      findNext(!e.shiftKey);
    } else if (e.key === 'Escape') {
      closeFindBar();
    }
  });

  // Tab Context Menu Actions
  if (ctxNewTab) {
    ctxNewTab.addEventListener('click', () => {
      window.browserAPI.createTab('');
      hideTabContextMenu();
    });
  }

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

  // Close all popovers on outside click
  document.addEventListener('click', (e) => {
    if (chromeMenuDropdown && !chromeMenuDropdown.contains(e.target) && !btnChromeMenu.contains(e.target)) {
      chromeMenuDropdown.classList.add('hidden');
    }
    if (siteInfoPopup && !siteInfoPopup.contains(e.target) && !securityBadge.contains(e.target)) {
      siteInfoPopup.classList.add('hidden');
    }
    if (bookmarkPopup && !bookmarkPopup.contains(e.target) && !btnBookmark.contains(e.target)) {
      bookmarkPopup.classList.add('hidden');
    }
    if (shieldPopup && !shieldPopup.contains(e.target) && !btnShield.contains(e.target)) {
      shieldPopup.classList.add('hidden');
    }
    if (downloadsPopup && !downloadsPopup.contains(e.target) && !btnDownloads.contains(e.target)) {
      downloadsPopup.classList.add('hidden');
    }
    if (omniboxDropdown && !omniboxWrapper.contains(e.target)) {
      omniboxDropdown.classList.add('hidden');
    }
    if (tabContextMenu && !tabContextMenu.contains(e.target)) {
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
    } else if (e.ctrlKey && e.key.toLowerCase() === 'n' && !e.shiftKey) {
      e.preventDefault();
      if (window.browserAPI.newWindow) window.browserAPI.newWindow();
    } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      if (window.browserAPI.newIncognitoWindow) window.browserAPI.newIncognitoWindow();
    } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      toggleBookmarksBar();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      window.browserAPI.createTab('operecs://history');
    } else if (e.ctrlKey && e.key.toLowerCase() === 'j') {
      e.preventDefault();
      window.browserAPI.createTab('operecs://downloads');
    } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      window.browserAPI.createTab('operecs://bookmarks');
    } else if (e.ctrlKey && e.key === ',') {
      e.preventDefault();
      window.browserAPI.createTab('operecs://settings');
    } else if (e.ctrlKey && e.shiftKey && e.key === 'Delete') {
      e.preventDefault();
      openClearDataModal();
    } else if (e.ctrlKey && (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'p')) {
      e.preventDefault();
      openCommandPalette();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      openFindBar();
    } else if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      window.browserAPI.goBack();
    } else if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      window.browserAPI.goForward();
    }
  });
}

function toggleSidebar() {
  isSidebarCollapsed = !isSidebarCollapsed;
  if (isSidebarCollapsed) {
    sidebar.classList.add('collapsed');
  } else {
    sidebar.classList.remove('collapsed');
  }
  applyLayout();
}

function toggleBookmarksBar() {
  currentSettings.showBookmarksBar = !currentSettings.showBookmarksBar;
  window.browserAPI.saveSettings({ showBookmarksBar: currentSettings.showBookmarksBar });
  applyLayout();
}

// ================= IPC LISTENERS =================
function setupIpcListeners() {
  window.browserAPI.onTabsUpdated(({ tabs, activeTabId: newActiveId, isSplitView, leftTabId, rightTabId, focusedPane }) => {
    currentTabs = tabs;
    activeTabId = newActiveId;
    activeTab = tabs.find(t => t.id === activeTabId) || null;
    splitState = { isSplitView, leftTabId, rightTabId, focusedPane };

    renderTabs();
    updateToolbar();
  });

  window.browserAPI.onTabStatusUpdated((updatedTab) => {
    const idx = currentTabs.findIndex(t => t.id === updatedTab.id);
    if (idx !== -1) currentTabs[idx] = updatedTab;
    if (updatedTab.id === activeTabId) {
      activeTab = updatedTab;
      updateToolbar();
    }
    updateTabElement(updatedTab);
  });

  window.browserAPI.onActiveTabChanged((tab) => {
    activeTabId = tab.id;
    activeTab = tab;
    renderTabs();
    updateToolbar();
  });

  window.browserAPI.onFocusOmnibox(() => {
    omniboxInput.focus();
    omniboxInput.select();
  });

  if (window.browserAPI.onToggleBookmarksBar) {
    window.browserAPI.onToggleBookmarksBar(() => toggleBookmarksBar());
  }

  if (window.browserAPI.onOpenClearBrowsingData) {
    window.browserAPI.onOpenClearBrowsingData(() => openClearDataModal());
  }

  if (window.browserAPI.onSettingsUpdated) {
    window.browserAPI.onSettingsUpdated((newSettings) => {
      currentSettings = { ...currentSettings, ...newSettings };
      applyLayout();
    });
  }

  if (window.browserAPI.onOpenCommandPalette) {
    window.browserAPI.onOpenCommandPalette(() => openCommandPalette());
  }

  if (window.browserAPI.onDownloadsUpdated) {
    window.browserAPI.onDownloadsUpdated((downloads) => {
      updateDownloadsUi(downloads);
    });
  }
}

// ================= TAB RENDERING =================
function renderTabs() {
  renderChromeHorizontalTabs();
  renderSidebarVerticalTabs();
}

// 1. Chrome Horizontal Top Tabs
function renderChromeHorizontalTabs() {
  if (!chromeTabsList) return;
  chromeTabsList.innerHTML = '';

  currentTabs.forEach(tab => {
    const isActive = tab.id === activeTabId;
    const tabEl = document.createElement('div');
    let classes = ['chrome-tab'];
    if (isActive) classes.push('active');
    if (tab.isPinned) classes.push('pinned');
    tabEl.className = classes.join(' ');
    tabEl.id = `chrome-tab-${tab.id}`;

    // Favicon or Spinner
    if (tab.isLoading) {
      const spinner = document.createElement('div');
      spinner.className = 'tab-spinner';
      tabEl.appendChild(spinner);
    } else if (tab.favicon) {
      const img = document.createElement('img');
      img.className = 'chrome-tab-favicon';
      img.src = tab.favicon;
      img.onerror = () => { img.style.display = 'none'; };
      tabEl.appendChild(img);
    } else {
      const icon = document.createElement('div');
      icon.innerHTML = `
        <svg class="chrome-tab-favicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
        </svg>`;
      tabEl.appendChild(icon.firstElementChild);
    }

    // Title
    const titleEl = document.createElement('span');
    titleEl.className = 'chrome-tab-title';
    titleEl.textContent = tab.title || 'New Tab';
    tabEl.appendChild(titleEl);

    // Audio Indicator
    if (tab.isAudible) {
      const audioBtn = document.createElement('div');
      audioBtn.className = 'chrome-tab-audio';
      audioBtn.title = tab.isMuted ? 'Unmute tab' : 'Mute tab';
      if (tab.isMuted) {
        audioBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <line x1="23" y1="9" x2="17" y2="15"></line>
          </svg>`;
      } else {
        audioBtn.innerHTML = `
          <div class="sound-waves">
            <span></span><span></span><span></span>
          </div>`;
      }
      audioBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.browserAPI.toggleMuteTab(tab.id);
      });
      tabEl.appendChild(audioBtn);
    }

    // Close Button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'chrome-tab-close';
    closeBtn.title = 'Close tab';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.browserAPI.closeTab(tab.id);
    });
    tabEl.appendChild(closeBtn);

    // Click to switch
    tabEl.addEventListener('click', () => {
      window.browserAPI.switchTab(tab.id);
    });

    // Middle click to close
    tabEl.addEventListener('mouseup', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        window.browserAPI.closeTab(tab.id);
      }
    });

    // Right-click context menu
    tabEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openTabContextMenu(e.clientX, e.clientY, tab);
    });

    chromeTabsList.appendChild(tabEl);
  });
}

// 2. Sidebar Vertical Tabs
function renderSidebarVerticalTabs() {
  if (!tabStrip) return;
  tabStrip.innerHTML = '';

  currentTabs.forEach(tab => {
    const isActive = tab.id === activeTabId;
    const tabEl = document.createElement('div');
    let classes = ['tab'];
    if (isActive) classes.push('active');
    if (tab.isPinned) classes.push('pinned');
    tabEl.className = classes.join(' ');
    tabEl.id = `sidebar-tab-${tab.id}`;

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
        </svg>`;
    }

    const titleEl = document.createElement('span');
    titleEl.className = 'tab-title';
    titleEl.textContent = tab.title || 'New Tab';

    tabEl.appendChild(iconContainer);
    tabEl.appendChild(titleEl);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.title = 'Close tab';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.browserAPI.closeTab(tab.id);
    });
    tabEl.appendChild(closeBtn);

    tabEl.addEventListener('click', () => {
      window.browserAPI.switchTab(tab.id);
    });

    tabEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openTabContextMenu(e.clientX, e.clientY, tab);
    });

    tabStrip.appendChild(tabEl);
  });
}

function updateTabElement(tab) {
  // Update horizontal tab title & favicon
  const hTab = document.getElementById(`chrome-tab-${tab.id}`);
  if (hTab) {
    const titleEl = hTab.querySelector('.chrome-tab-title');
    if (titleEl) titleEl.textContent = tab.title || 'New Tab';
  }
}

// ================= BOOKMARKS BAR =================
async function renderBookmarksBar() {
  if (!bookmarksChipsList) return;
  try {
    const bookmarks = await window.browserAPI.getBookmarks();
    bookmarksChipsList.innerHTML = '';

    const barItems = (bookmarks || []).filter(b => (b.folder || 'bookmarks-bar') === 'bookmarks-bar');
    barItems.forEach(bm => {
      const chip = document.createElement('button');
      chip.className = 'bookmark-chip';
      chip.title = `${bm.title}\n${bm.url}`;

      const icon = document.createElement('img');
      icon.src = bm.favicon || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(bm.url)}`;
      icon.onerror = () => { icon.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="%23948fa3"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'; };

      const span = document.createElement('span');
      span.textContent = bm.title || bm.url;

      chip.appendChild(icon);
      chip.appendChild(span);

      chip.addEventListener('click', () => {
        window.browserAPI.navigate(bm.url);
      });

      chip.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (confirm(`Remove "${bm.title}" from bookmarks?`)) {
          window.browserAPI.removeBookmark(bm.id || bm.url).then(() => renderBookmarksBar());
        }
      });

      bookmarksChipsList.appendChild(chip);
    });
  } catch (err) {
    console.warn('Failed to load bookmarks bar:', err);
  }
}

// ================= TOOLBAR & OMNIBOX =================
async function updateToolbar() {
  if (!activeTab) return;

  if (!isOmniboxFocused) {
    omniboxInput.value = activeTab.displayUrl || '';
  }

  btnBack.disabled = !activeTab.canGoBack;
  btnForward.disabled = !activeTab.canGoForward;

  if (activeTab.isLoading) {
    reloadIcon.classList.add('hidden');
    stopIcon.classList.remove('hidden');
    btnReload.title = 'Stop loading';
  } else {
    reloadIcon.classList.remove('hidden');
    stopIcon.classList.add('hidden');
    btnReload.title = 'Reload (Ctrl+R)';
  }

  if (activeTab.zoomLevel && activeTab.zoomLevel !== 0) {
    btnZoomReset.classList.remove('hidden');
    const pct = Math.round((1 + activeTab.zoomLevel * 0.2) * 100);
    btnZoomReset.textContent = `${pct}%`;
  } else {
    btnZoomReset.classList.add('hidden');
  }

  if (activeTab.wcId) {
    window.browserAPI.getBlockedCount(activeTab.wcId).then(count => {
      shieldCounter.textContent = count || 0;
      shieldStatCount.textContent = count || 0;
    });
  }

  await checkBookmarkStatus(activeTab.url);
}

async function checkBookmarkStatus(url) {
  if (!url || url === 'operecs://newtab') {
    btnBookmark.classList.remove('bookmarked');
    btnBookmark.title = 'Bookmark this tab';
    return;
  }
  const isBm = await window.browserAPI.isBookmarked(url);
  if (isBm) {
    btnBookmark.classList.add('bookmarked');
    btnBookmark.title = 'Bookmark added';
  } else {
    btnBookmark.classList.remove('bookmarked');
    btnBookmark.title = 'Bookmark this tab';
  }
}

// ================= OMNIBOX AUTOCOMPLETE & SUGGESTIONS =================
function setupOmniboxSuggestions() {
  omniboxInput.addEventListener('focus', () => {
    isOmniboxFocused = true;
    omniboxInput.select();
  });

  omniboxInput.addEventListener('blur', () => {
    isOmniboxFocused = false;
  });

  omniboxInput.addEventListener('input', async () => {
    const q = omniboxInput.value.trim();
    if (!q || q.startsWith('operecs://') || q.startsWith('file://')) {
      omniboxDropdown.classList.add('hidden');
      return;
    }
    await fetchAndRenderSuggestions(q);
  });

  omniboxInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (omniboxSuggestions.length > 0) {
        selectedSuggestionIndex = (selectedSuggestionIndex + 1) % omniboxSuggestions.length;
        highlightSuggestion();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (omniboxSuggestions.length > 0) {
        selectedSuggestionIndex = (selectedSuggestionIndex - 1 + omniboxSuggestions.length) % omniboxSuggestions.length;
        highlightSuggestion();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < omniboxSuggestions.length) {
        navigateSuggestion(omniboxSuggestions[selectedSuggestionIndex]);
      } else {
        const query = omniboxInput.value.trim();
        if (query) window.browserAPI.navigate(query);
      }
      omniboxDropdown.classList.add('hidden');
      omniboxInput.blur();
    } else if (e.key === 'Escape') {
      omniboxDropdown.classList.add('hidden');
      if (activeTab) omniboxInput.value = activeTab.displayUrl || '';
      omniboxInput.blur();
    }
  });
}

async function fetchAndRenderSuggestions(query) {
  omniboxSuggestions = [];
  selectedSuggestionIndex = -1;

  // 1. Google Search suggestion
  omniboxSuggestions.push({
    type: 'search',
    text: query,
    url: `${currentSettings.searchEngine || 'https://www.google.com/search?q='}${encodeURIComponent(query)}`,
    icon: '🔍',
    label: 'Search'
  });

  // 2. Matching Bookmarks
  try {
    const bms = await window.browserAPI.searchBookmarks(query);
    (bms || []).slice(0, 3).forEach(b => {
      omniboxSuggestions.push({
        type: 'bookmark',
        text: b.title || b.url,
        url: b.url,
        icon: '⭐',
        label: 'Bookmark'
      });
    });
  } catch (err) {}

  // 3. Matching History
  try {
    const hist = await window.browserAPI.searchHistory(query);
    (hist || []).slice(0, 4).forEach(h => {
      if (!omniboxSuggestions.some(s => s.url === h.url)) {
        omniboxSuggestions.push({
          type: 'history',
          text: h.title || h.url,
          url: h.url,
          icon: '🕒',
          label: 'History'
        });
      }
    });
  } catch (err) {}

  renderSuggestionsList();
}

function renderSuggestionsList() {
  omniboxDropdown.innerHTML = '';
  if (omniboxSuggestions.length === 0) {
    omniboxDropdown.classList.add('hidden');
    return;
  }

  omniboxSuggestions.forEach((sug, idx) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.innerHTML = `
      <span class="suggestion-icon">${sug.icon}</span>
      <span class="suggestion-text">${escapeHtml(sug.text)}</span>
      <span class="suggestion-type">${sug.label}</span>
    `;

    item.addEventListener('click', () => {
      navigateSuggestion(sug);
      omniboxDropdown.classList.add('hidden');
    });

    item.addEventListener('mouseenter', () => {
      selectedSuggestionIndex = idx;
      highlightSuggestion();
    });

    omniboxDropdown.appendChild(item);
  });

  omniboxDropdown.classList.remove('hidden');
}

function highlightSuggestion() {
  const items = omniboxDropdown.querySelectorAll('.suggestion-item');
  items.forEach((item, idx) => {
    if (idx === selectedSuggestionIndex) {
      item.classList.add('selected');
      omniboxInput.value = omniboxSuggestions[idx].text;
    } else {
      item.classList.remove('selected');
    }
  });
}

function navigateSuggestion(sug) {
  window.browserAPI.navigate(sug.url);
}

// ================= SITE INFO / SECURITY FLYOUT =================
function setupSiteInfoPopup() {
  securityBadge.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!siteInfoPopup.classList.contains('hidden')) {
      siteInfoPopup.classList.add('hidden');
      return;
    }

    // Populate site info
    const url = (activeTab && activeTab.url) ? activeTab.url : '';
    const statusEl = document.getElementById('site-security-status');
    const descEl = document.getElementById('site-domain-desc');

    if (url.startsWith('https://')) {
      statusEl.textContent = 'Connection is secure';
      descEl.textContent = 'Your information (passwords, cookies, messages) is encrypted with 256-bit SSL.';
    } else if (url.startsWith('http://')) {
      statusEl.textContent = 'Not secure';
      descEl.textContent = 'You should not enter any sensitive information on this site.';
    } else {
      statusEl.textContent = 'Operecs Internal Page';
      descEl.textContent = 'This is a secure native Operecs Browser component.';
    }

    siteInfoPopup.classList.remove('hidden');
  });
}

// ================= BOOKMARK POPUP =================
function setupBookmarkPopup() {
  btnBookmark.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!activeTab || !activeTab.url || activeTab.url === 'operecs://newtab') return;

    if (!bookmarkPopup.classList.contains('hidden')) {
      bookmarkPopup.classList.add('hidden');
      return;
    }

    bmPopupName.value = activeTab.title || activeTab.url;
    bmPopupFolder.value = 'bookmarks-bar';
    bookmarkPopup.classList.remove('hidden');
  });

  btnBmDone.addEventListener('click', async () => {
    if (!activeTab) return;
    const title = bmPopupName.value.trim() || activeTab.url;
    const folder = bmPopupFolder.value;

    await window.browserAPI.addBookmark({
      title,
      url: activeTab.url,
      favicon: activeTab.favicon,
      folder
    });

    bookmarkPopup.classList.add('hidden');
    checkBookmarkStatus(activeTab.url);
    renderBookmarksBar();
  });

  btnBmRemove.addEventListener('click', async () => {
    if (!activeTab) return;
    await window.browserAPI.removeBookmark(activeTab.url);
    bookmarkPopup.classList.add('hidden');
    checkBookmarkStatus(activeTab.url);
    renderBookmarksBar();
  });
}

// ================= CHROME 3-DOT KEBAB MENU =================
function setupChromeMenu() {
  btnChromeMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    chromeMenuDropdown.classList.toggle('hidden');
  });

  document.getElementById('menu-new-tab').addEventListener('click', () => {
    window.browserAPI.createTab('');
    chromeMenuDropdown.classList.add('hidden');
  });

  document.getElementById('menu-new-window').addEventListener('click', () => {
    if (window.browserAPI.newWindow) window.browserAPI.newWindow();
    chromeMenuDropdown.classList.add('hidden');
  });

  document.getElementById('menu-new-incognito').addEventListener('click', () => {
    if (window.browserAPI.newIncognitoWindow) window.browserAPI.newIncognitoWindow();
    chromeMenuDropdown.classList.add('hidden');
  });

  document.getElementById('menu-history').addEventListener('click', () => {
    window.browserAPI.createTab('operecs://history');
    chromeMenuDropdown.classList.add('hidden');
  });

  document.getElementById('menu-downloads').addEventListener('click', () => {
    window.browserAPI.createTab('operecs://downloads');
    chromeMenuDropdown.classList.add('hidden');
  });

  document.getElementById('menu-bookmarks').addEventListener('click', () => {
    window.browserAPI.createTab('operecs://bookmarks');
    chromeMenuDropdown.classList.add('hidden');
  });

  document.getElementById('menu-zoom-in').addEventListener('click', () => {
    window.browserAPI.zoomIn();
  });

  document.getElementById('menu-zoom-out').addEventListener('click', () => {
    window.browserAPI.zoomOut();
  });

  document.getElementById('menu-zoom-full').addEventListener('click', () => {
    window.browserAPI.maximizeWindow();
    chromeMenuDropdown.classList.add('hidden');
  });

  document.getElementById('menu-print').addEventListener('click', () => {
    if (window.browserAPI.print) window.browserAPI.print();
    chromeMenuDropdown.classList.add('hidden');
  });

  document.getElementById('menu-find').addEventListener('click', () => {
    openFindBar();
    chromeMenuDropdown.classList.add('hidden');
  });

  document.getElementById('menu-settings').addEventListener('click', () => {
    window.browserAPI.createTab('operecs://settings');
    chromeMenuDropdown.classList.add('hidden');
  });

  document.getElementById('menu-clear-data').addEventListener('click', () => {
    openClearDataModal();
    chromeMenuDropdown.classList.add('hidden');
  });

  document.getElementById('menu-about').addEventListener('click', () => {
    window.browserAPI.createTab('operecs://settings#section-about');
    chromeMenuDropdown.classList.add('hidden');
  });

  document.getElementById('menu-exit').addEventListener('click', () => {
    window.browserAPI.closeWindow();
  });
}

// ================= CLEAR BROWSING DATA MODAL =================
function setupClearDataModal() {
  btnCloseClearModal.addEventListener('click', () => clearDataModal.classList.add('hidden'));
  btnCancelClearData.addEventListener('click', () => clearDataModal.classList.add('hidden'));

  btnConfirmClearData.addEventListener('click', async () => {
    const timeRange = clearDataRange.value;
    const clearHistory = chkClearHistory.checked;
    const clearCookies = chkClearCookies.checked;
    const clearCache = chkClearCache.checked;

    btnConfirmClearData.textContent = 'Clearing...';
    btnConfirmClearData.disabled = true;

    try {
      await window.browserAPI.clearBrowsingData({
        timeRange,
        clearHistory,
        clearCookies,
        clearCache
      });
      setTimeout(() => {
        clearDataModal.classList.add('hidden');
        btnConfirmClearData.textContent = 'Clear data';
        btnConfirmClearData.disabled = false;
      }, 500);
    } catch (err) {
      console.error('Error clearing data:', err);
      btnConfirmClearData.textContent = 'Clear data';
      btnConfirmClearData.disabled = false;
    }
  });
}

function openClearDataModal() {
  clearDataModal.classList.remove('hidden');
}

// ================= PRIVACY SHIELD POPOVER =================
function toggleShieldPopup() {
  if (shieldPopup.classList.contains('hidden')) {
    shieldPopup.classList.remove('hidden');
  } else {
    shieldPopup.classList.add('hidden');
  }
}

// ================= DOWNLOADS SHELF =================
function toggleDownloadsPopup() {
  if (downloadsPopup.classList.contains('hidden')) {
    downloadsPopup.classList.remove('hidden');
  } else {
    downloadsPopup.classList.add('hidden');
  }
}

function updateDownloadsUi(downloads) {
  if (!downloads || downloads.length === 0) {
    downloadsBadge.classList.add('hidden');
    downloadsList.innerHTML = '<div class="empty-downloads">No recent downloads</div>';
    return;
  }

  const activeCount = downloads.filter(d => d.state === 'progressing').length;
  if (activeCount > 0) {
    downloadsBadge.classList.remove('hidden');
    downloadsBadge.textContent = activeCount;
  } else {
    downloadsBadge.classList.add('hidden');
  }

  downloadsList.innerHTML = '';
  downloads.slice(0, 5).forEach(item => {
    const card = document.createElement('div');
    card.className = 'download-item-card';

    const pct = item.totalBytes > 0 ? Math.round((item.receivedBytes / item.totalBytes) * 100) : 0;
    const isDone = item.state === 'completed';

    card.innerHTML = `
      <div class="download-item-name">${escapeHtml(item.filename)}</div>
      <div class="download-progress-track">
        <div class="download-progress-fill" style="width: ${isDone ? 100 : pct}%"></div>
      </div>
      <div class="download-item-meta">
        <span>${isDone ? 'Completed' : (item.speed || 'Downloading...')}</span>
        <div style="display:flex; gap:6px;">
          ${isDone ? `<button class="action-btn" onclick="window.browserAPI.openDownload('${item.id}')">Open</button>` : ''}
          <button class="action-btn" onclick="window.browserAPI.showDownloadInFolder('${item.id}')">Folder</button>
        </div>
      </div>
    `;
    downloadsList.appendChild(card);
  });
}

// ================= FIND IN PAGE =================
function openFindBar() {
  findBar.classList.remove('hidden');
  findInput.focus();
  findInput.select();
  if (findInput.value) doFind();
}

function closeFindBar() {
  findBar.classList.add('hidden');
  window.browserAPI.stopFindInPage('clearSelection');
}

function doFind() {
  const text = findInput.value;
  if (!text) {
    findCount.textContent = '0/0';
    window.browserAPI.stopFindInPage('clearSelection');
    return;
  }
  window.browserAPI.findInPage(text, { forward: true, findNext: false });
}

function findNext(forward = true) {
  const text = findInput.value;
  if (!text) return;
  window.browserAPI.findInPage(text, { forward, findNext: true });
}

function updateFindResult(res) {
  if (!res || !res.matches) {
    findCount.textContent = '0/0';
  } else {
    findCount.textContent = `${res.activeMatchOrdinal || 0}/${res.matches}`;
  }
}

// ================= COMMAND PALETTE =================
function openCommandPalette() {
  cmdBackdrop.classList.remove('hidden');
  cmdInput.value = '';
  cmdInput.focus();
  filterCommandPalette('');
}

function closeCommandPalette() {
  cmdBackdrop.classList.add('hidden');
}

async function filterCommandPalette(query) {
  const q = query.toLowerCase().trim();
  currentCmdItems = [];

  const baseCommands = [
    { title: 'New Tab', group: 'Navigation', icon: '＋', shortcut: 'Ctrl+T', action: () => window.browserAPI.createTab('') },
    { title: 'New Window', group: 'Navigation', icon: '🪟', shortcut: 'Ctrl+N', action: () => window.browserAPI.newWindow && window.browserAPI.newWindow() },
    { title: 'New Incognito Window', group: 'Navigation', icon: '🕶️', shortcut: 'Ctrl+Shift+N', action: () => window.browserAPI.newIncognitoWindow && window.browserAPI.newIncognitoWindow() },
    { title: 'Open Settings', group: 'Browser', icon: '⚙️', shortcut: 'Ctrl+,', action: () => window.browserAPI.createTab('operecs://settings') },
    { title: 'Open History', group: 'Browser', icon: '🕒', shortcut: 'Ctrl+H', action: () => window.browserAPI.createTab('operecs://history') },
    { title: 'Open Bookmarks', group: 'Browser', icon: '⭐', shortcut: 'Ctrl+Shift+O', action: () => window.browserAPI.createTab('operecs://bookmarks') },
    { title: 'Open Downloads', group: 'Browser', icon: '📥', shortcut: 'Ctrl+J', action: () => window.browserAPI.createTab('operecs://downloads') },
    { title: 'Clear Browsing Data', group: 'Privacy', icon: '🧹', shortcut: 'Ctrl+Shift+Del', action: () => openClearDataModal() },
    { title: 'Toggle Privacy Shield', group: 'Privacy', icon: '🛡️', shortcut: '', action: () => window.browserAPI.toggleShield() },
    { title: 'Toggle Bookmarks Bar', group: 'Appearance', icon: '🔖', shortcut: 'Ctrl+Shift+B', action: () => toggleBookmarksBar() },
    { title: 'Find in Page', group: 'Tools', icon: '🔍', shortcut: 'Ctrl+F', action: () => openFindBar() },
    { title: 'Print Page', group: 'Tools', icon: '🖨️', shortcut: 'Ctrl+P', action: () => window.browserAPI.print && window.browserAPI.print() }
  ];

  baseCommands.forEach(cmd => {
    if (!q || cmd.title.toLowerCase().includes(q) || cmd.group.toLowerCase().includes(q)) {
      currentCmdItems.push(cmd);
    }
  });

  // Open Tabs
  currentTabs.forEach(t => {
    const tTitle = t.title || t.url;
    if (!q || tTitle.toLowerCase().includes(q) || (t.url && t.url.toLowerCase().includes(q))) {
      currentCmdItems.push({
        title: tTitle,
        group: 'Open Tabs',
        icon: '📄',
        shortcut: 'Switch',
        action: () => window.browserAPI.switchTab(t.id)
      });
    }
  });

  selectedCmdIndex = 0;
  renderCommandResults();
}

function renderCommandResults() {
  cmdResults.innerHTML = '';
  if (currentCmdItems.length === 0) {
    cmdResults.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-secondary);">No results</div>';
    return;
  }

  currentCmdItems.forEach((item, index) => {
    const itemEl = document.createElement('div');
    itemEl.className = `cmd-item ${index === selectedCmdIndex ? 'selected' : ''}`;
    itemEl.innerHTML = `
      <div class="cmd-item-left">
        <span class="cmd-item-icon">${item.icon}</span>
        <span class="cmd-item-title">${escapeHtml(item.title)}</span>
      </div>
      ${item.shortcut ? `<span class="cmd-item-shortcut">${escapeHtml(item.shortcut)}</span>` : ''}
    `;

    itemEl.addEventListener('click', () => executeCommand(index));
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
  tabContextMenu.style.left = `${x}px`;
  tabContextMenu.style.top = `${y}px`;
}

function hideTabContextMenu() {
  tabContextMenu.classList.add('hidden');
  contextMenuTargetTab = null;
}

// ================= UTILITIES =================
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Start application
init();
