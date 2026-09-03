const { session, shell } = require('electron');

class DownloadsManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.downloads = []; // Array of download items
    this.activeDownloads = new Map(); // id -> DownloadItem

    this.init();
  }

  init() {
    session.defaultSession.on('will-download', (_event, item, _webContents) => {
      const id = `dl-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const fileName = item.getFilename();
      const totalBytes = item.getTotalBytes();

      const record = {
        id,
        fileName,
        savePath: item.getSavePath(),
        totalBytes,
        receivedBytes: 0,
        state: 'progressing',
        percentage: 0,
        startTime: Date.now()
      };

      this.downloads.unshift(record);
      this.activeDownloads.set(id, item);
      this.notifyUpdate();

      item.on('updated', (_evt, state) => {
        if (state === 'interrupted') {
          record.state = 'interrupted';
        } else if (state === 'progressing') {
          if (item.isPaused()) {
            record.state = 'paused';
          } else {
            record.state = 'progressing';
            record.receivedBytes = item.getReceivedBytes();
            record.percentage = totalBytes > 0 ? Math.floor((record.receivedBytes / totalBytes) * 100) : 0;
          }
        }
        this.notifyUpdate();
      });

      item.once('done', (_evt, state) => {
        record.state = state; // 'completed' | 'cancelled' | 'interrupted'
        record.receivedBytes = item.getReceivedBytes();
        record.savePath = item.getSavePath();
        record.percentage = 100;
        this.activeDownloads.delete(id);
        this.notifyUpdate();
      });
    });
  }

  notifyUpdate() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('downloads:updated', this.getDownloads());
    }
  }

  getDownloads() {
    return this.downloads.slice(0, 50);
  }

  cancelDownload(id) {
    const item = this.activeDownloads.get(id);
    if (item) {
      item.cancel();
      return true;
    }
    return false;
  }

  openDownload(id) {
    const record = this.downloads.find(d => d.id === id);
    if (record && record.savePath) {
      shell.openPath(record.savePath);
      return true;
    }
    return false;
  }

  showInFolder(id) {
    const record = this.downloads.find(d => d.id === id);
    if (record && record.savePath) {
      shell.showItemInFolder(record.savePath);
      return true;
    }
    return false;
  }
}

module.exports = DownloadsManager;
