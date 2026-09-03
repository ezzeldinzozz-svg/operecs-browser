const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class BrowserStore {
  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'orbit-browser-data.json');
    this.data = {
      bookmarks: [
        { title: 'Google', url: 'https://www.google.com', favicon: 'https://www.google.com/favicon.ico' },
        { title: 'YouTube', url: 'https://www.youtube.com', favicon: 'https://www.youtube.com/favicon.ico' },
        { title: 'GitHub', url: 'https://github.com', favicon: 'https://github.githubassets.com/favicons/favicon.png' },
        { title: 'Wikipedia', url: 'https://www.wikipedia.org', favicon: 'https://www.wikipedia.org/static/favicon/wikipedia.ico' },
        { title: 'Reddit', url: 'https://www.reddit.com', favicon: 'https://www.redditstatic.com/shreddit/assets/favicon/192x192.png' }
      ],
      history: [],
      settings: {
        searchEngine: 'https://www.google.com/search?q=',
        homeUrl: 'browser://newtab'
      }
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = {
          bookmarks: parsed.bookmarks || this.data.bookmarks,
          history: parsed.history || [],
          settings: { ...this.data.settings, ...(parsed.settings || {}) }
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

  getBookmarks() {
    return this.data.bookmarks;
  }

  addBookmark({ title, url, favicon }) {
    if (!url) return this.data.bookmarks;
    const exists = this.data.bookmarks.find(b => b.url === url);
    if (!exists) {
      this.data.bookmarks.push({
        title: title || url,
        url,
        favicon: favicon || ''
      });
      this.save();
    }
    return this.data.bookmarks;
  }

  removeBookmark(url) {
    this.data.bookmarks = this.data.bookmarks.filter(b => b.url !== url);
    this.save();
    return this.data.bookmarks;
  }

  isBookmarked(url) {
    if (!url) return false;
    return this.data.bookmarks.some(b => b.url === url);
  }

  getHistory() {
    return this.data.history.slice(0, 100); // Return recent 100 entries
  }

  addHistory({ title, url }) {
    if (!url || url.startsWith('browser://') || url.startsWith('file://')) return;
    // Remove if already in recent to bump to top
    this.data.history = this.data.history.filter(h => h.url !== url);
    this.data.history.unshift({
      title: title || url,
      url,
      visitedAt: new Date().toISOString()
    });
    // Keep max 200 items
    if (this.data.history.length > 200) {
      this.data.history = this.data.history.slice(0, 200);
    }
    this.save();
  }

  clearHistory() {
    this.data.history = [];
    this.save();
    return [];
  }
}

module.exports = BrowserStore;
