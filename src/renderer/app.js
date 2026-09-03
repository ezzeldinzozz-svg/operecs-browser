// Operecs Browser Renderer UI Logic

// DOM Elements
const tabStrip = document.getElementById('tab-strip');
const newTabBtn = document.getElementById('new-tab-btn');
const omniboxInput = document.getElementById('omnibox-input');
const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnReload = document.getElementById('btn-reload');
const reloadIcon = document.getElementById('reload-icon');
const stopIcon = document.getElementById('stop-icon');
const btnHome = document.getElementById('btn-home');
const btnBookmark = document.getElementById('btn-bookmark');
const starIcon = document.getElementById('star-icon');
const bookmarksBar = document.getElementById('bookmarks-bar');
const btnHistoryToggle = document.getElementById('btn-history-toggle');
const historyDropdown = document.getElementById('history-dropdown');
const historyList = document.getElementById('history-list');
const btnClearHistory = document.getElementById('btn-clear-history');
const btnDevtools = document.getElementById('btn-devtools');

// Window Controls
const btnMinimize = document.getElementById('btn-minimize');
const btnMaximize = document.getElementById('btn-maximize');
const btnClose = document.getElementById('btn-close');

// State
let currentTabs = [];
let activeTabId = null;
let activeTab = null;
let isOmniboxFocused = false;

// ================= INITIALIZATION =================
async function init() {
  setupEventListeners();
  setupIpcListeners();
  loadBookmarks();

  // Fetch initial tabs if already loaded
  try {
    const tabs = await window.browserAPI.getTabs();
    if (tabs && tabs.length > 0) {
      currentTabs = tabs;
      const active = tabs.find(t => t.isActive);
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
  // Tabs
  newTabBtn.addEventListener('click', () => {
    window.browserAPI.createTab('');
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
  btnHome.addEventListener('click', () => window.browserAPI.navigate('browser://newtab'));
  btnDevtools.addEventListener('click', () => window.browserAPI.openDevTools());

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
    if (!activeTab || !activeTab.url || activeTab.url === 'browser://newtab') return;
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
    await loadBookmarks();
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

  // Close history dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!historyDropdown.contains(e.target) && e.target !== btnHistoryToggle) {
      historyDropdown.classList.add('hidden');
    }
  });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 't') {
      e.preventDefault();
      window.browserAPI.createTab('');
    } else if (e.ctrlKey && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      if (activeTabId) window.browserAPI.closeTab(activeTabId);
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
    } else if (e.key === 'F12') {
      e.preventDefault();
      window.browserAPI.openDevTools();
    }
  });
}

// ================= IPC LISTENERS =================
function setupIpcListeners() {
  window.browserAPI.onTabsUpdated(({ tabs, activeTabId: newActiveId }) => {
    currentTabs = tabs;
    activeTabId = newActiveId;
    activeTab = tabs.find(t => t.id === activeTabId) || null;
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
    renderTabs();
    updateToolbar();
  });

  window.browserAPI.onFocusOmnibox(() => {
    omniboxInput.focus();
    omniboxInput.select();
  });
}

// ================= TAB RENDERING =================
function renderTabs() {
  tabStrip.innerHTML = '';
  currentTabs.forEach(tab => {
    const tabEl = document.createElement('div');
    tabEl.className = `tab ${tab.id === activeTabId ? 'active' : ''}`;
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

    tabEl.appendChild(iconContainer);
    tabEl.appendChild(titleEl);
    tabEl.appendChild(closeBtn);

    tabEl.addEventListener('click', () => {
      if (tab.id !== activeTabId) {
        window.browserAPI.switchTab(tab.id);
      }
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

  // Bookmark status
  await checkBookmarkStatus(activeTab.url);
}

async function checkBookmarkStatus(url) {
  if (!url || url === 'browser://newtab') {
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

// ================= BOOKMARKS =================
async function loadBookmarks() {
  const bookmarks = await window.browserAPI.getBookmarks();
  bookmarksBar.innerHTML = '';

  bookmarks.forEach(bm => {
    const bmBtn = document.createElement('button');
    bmBtn.className = 'bookmark-item';
    bmBtn.title = `${bm.title}\n${bm.url}`;

    const icon = bm.favicon 
      ? `<img class="bookmark-favicon" src="${bm.favicon}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'14\\' height=\\'14\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%23909bb0\\' stroke-width=\\'2\\'><circle cx=\\'12\\' cy=\\'12\\' r=\\'10\\'/></svg>'">`
      : `<svg class="bookmark-favicon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`;

    bmBtn.innerHTML = `
      ${icon}
      <span>${bm.title}</span>
    `;

    bmBtn.addEventListener('click', () => {
      window.browserAPI.navigate(bm.url);
    });

    bookmarksBar.appendChild(bmBtn);
  });
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

// Start app
init();
