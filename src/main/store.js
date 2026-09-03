const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class BrowserStore {
  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'operecs-browser-data.json');
    this.defaultSettings = {
      tabLayout: 'horizontal', // 'horizontal' (Chrome default) | 'vertical' (Sidebar)
      showBookmarksBar: true,
      showHomeButton: true,
      homeUrl: 'browser://newtab',
      searchEngine: 'https://www.google.com/search?q=',
      searchEngineName: 'Google',
      theme: 'operecs', // 'operecs' | 'chrome-dark' | 'chrome-light'
      fontSize: 'medium', // 'small' | 'medium' | 'large' | 'very-large'
      defaultZoom: 100,
      onStartup: 'newtab', // 'newtab' | 'restore' | 'custom'
      startupUrls: [],
      downloadPath: app.getPath('downloads'),
      askDownloadLocation: false,
      trackingProtection: 'standard', // 'standard' | 'strict' | 'off'
      memorySaver: false,
      hardwareAcceleration: true,
      profileName: 'User',
      profileAvatar: 'default'
    };

    this.data = {
      bookmarks: [
        { id: 'bm-1', title: 'Google', url: 'https://www.google.com', favicon: 'https://www.google.com/favicon.ico', folder: 'bookmarks-bar', createdAt: Date.now() },
        { id: 'bm-2', title: 'YouTube', url: 'https://www.youtube.com', favicon: 'https://www.youtube.com/favicon.ico', folder: 'bookmarks-bar', createdAt: Date.now() },
        { id: 'bm-3', title: 'GitHub', url: 'https://github.com', favicon: 'https://github.githubassets.com/favicons/favicon.png', folder: 'bookmarks-bar', createdAt: Date.now() },
        { id: 'bm-4', title: 'Wikipedia', url: 'https://www.wikipedia.org', favicon: 'https://www.wikipedia.org/static/favicon/wikipedia.ico', folder: 'bookmarks-bar', createdAt: Date.now() },
        { id: 'bm-5', title: 'Reddit', url: 'https://www.reddit.com', favicon: 'https://www.redditstatic.com/shreddit/assets/favicon/192x192.png', folder: 'bookmarks-bar', createdAt: Date.now() }
      ],
      bookmarkFolders: ['bookmarks-bar', 'other-bookmarks'],
      history: [],
      settings: { ...this.defaultSettings }
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = {
          bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks.map((b, i) => ({
            id: b.id || `bm-${i + 1}`,
            title: b.title || b.url,
            url: b.url,
            favicon: b.favicon || '',
            folder: b.folder || 'bookmarks-bar',
            createdAt: b.createdAt || Date.now()
          })) : this.data.bookmarks,
          bookmarkFolders: parsed.bookmarkFolders || this.data.bookmarkFolders,
          history: Array.isArray(parsed.history) ? parsed.history : [],
          settings: { ...this.defaultSettings, ...(parsed.settings || {}) }
        };
      } else {
        this.save();
      }
    } catch (err) {
      console.error('Failed to load store data:', err);
    }
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save store data:', err);
    }
  }

  // --- Bookmarks ---
  getBookmarks() {
    return this.data.bookmarks;
  }

  getBookmarkFolders() {
    return this.data.bookmarkFolders || ['bookmarks-bar', 'other-bookmarks'];
  }

  addBookmark({ title, url, favicon, folder = 'bookmarks-bar' }) {
    if (!url) return this.data.bookmarks;
    const existingIndex = this.data.bookmarks.findIndex(b => b.url === url);
    if (existingIndex >= 0) {
      // Update existing
      this.data.bookmarks[existingIndex] = {
        ...this.data.bookmarks[existingIndex],
        title: title || this.data.bookmarks[existingIndex].title,
        folder: folder || this.data.bookmarks[existingIndex].folder
      };
    } else {
      this.data.bookmarks.push({
        id: `bm-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        title: title || url,
        url,
        favicon: favicon || '',
        folder: folder || 'bookmarks-bar',
        createdAt: Date.now()
      });
    }
    this.save();
    return this.data.bookmarks;
  }

  updateBookmark(id, { title, url, folder }) {
    const item = this.data.bookmarks.find(b => b.id === id || b.url === id);
    if (item) {
      if (title !== undefined) item.title = title;
      if (url !== undefined) item.url = url;
      if (folder !== undefined) item.folder = folder;
      this.save();
    }
    return this.data.bookmarks;
  }

  removeBookmark(idOrUrl) {
    this.data.bookmarks = this.data.bookmarks.filter(b => b.id !== idOrUrl && b.url !== idOrUrl);
    this.save();
    return this.data.bookmarks;
  }

  isBookmarked(url) {
    if (!url) return false;
    return this.data.bookmarks.some(b => b.url === url);
  }

  searchBookmarks(query) {
    if (!query) return this.data.bookmarks;
    const q = query.toLowerCase();
    return this.data.bookmarks.filter(b => 
      b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
    );
  }

  // --- History ---
  getHistory() {
    return this.data.history.slice(0, 500);
  }

  addHistory({ title, url, favicon }) {
    if (!url || url.startsWith('browser://') || url.startsWith('operecs://') || url.startsWith('file://')) return;
    this.data.history = this.data.history.filter(h => h.url !== url);
    this.data.history.unshift({
      id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      title: title || url,
      url,
      favicon: favicon || '',
      visitedAt: new Date().toISOString()
    });
    if (this.data.history.length > 1000) {
      this.data.history = this.data.history.slice(0, 1000);
    }
    this.save();
  }

  removeHistoryItem(idOrUrl) {
    this.data.history = this.data.history.filter(h => h.id !== idOrUrl && h.url !== idOrUrl);
    this.save();
    return this.data.history;
  }

  clearHistory() {
    this.data.history = [];
    this.save();
    return [];
  }

  clearHistoryRange(range) {
    if (range === 'all') {
      return this.clearHistory();
    }
    const now = Date.now();
    let threshold = 0;
    if (range === 'hour') threshold = now - 60 * 60 * 1000;
    else if (range === 'day') threshold = now - 24 * 60 * 60 * 1000;
    else if (range === 'week') threshold = now - 7 * 24 * 60 * 60 * 1000;
    else if (range === 'month') threshold = now - 28 * 24 * 60 * 60 * 1000;

    this.data.history = this.data.history.filter(h => {
      const itemTime = new Date(h.visitedAt).getTime();
      return itemTime < threshold;
    });
    this.save();
    return this.data.history;
  }

  searchHistory(query) {
    if (!query) return this.getHistory();
    const q = query.toLowerCase();
    return this.data.history.filter(h => 
      h.title.toLowerCase().includes(q) || h.url.toLowerCase().includes(q)
    );
  }

  // --- Settings ---
  getSettings() {
    return this.data.settings;
  }

  updateSettings(newSettings) {
    this.data.settings = { ...this.data.settings, ...newSettings };
    this.save();
    return this.data.settings;
  }

  resetSettings() {
    this.data.settings = { ...this.defaultSettings };
    this.save();
    return this.data.settings;
  }
}

module.exports = BrowserStore;
