const { session } = require('electron');

class PrivacyShield {
  constructor(store, mainWindow) {
    this.store = store;
    this.mainWindow = mainWindow;
    this.enabled = true;
    this.blockedPerTab = new Map(); // wcId -> count

    // Comprehensive list of high-impact tracker, ad, and telemetry patterns
    this.blockedPatterns = [
      '*://*.google-analytics.com/*',
      '*://*.analytics.google.com/*',
      '*://*.googletagmanager.com/*',
      '*://*.googletagservices.com/*',
      '*://*.doubleclick.net/*',
      '*://*.adservice.google.com/*',
      '*://*.adnxs.com/*',
      '*://*.facebook.net/*',
      '*://*.connect.facebook.net/*',
      '*://*.ads.twitter.com/*',
      '*://*.analytics.twitter.com/*',
      '*://*.criteo.com/*',
      '*://*.criteo.net/*',
      '*://*.outbrain.com/*',
      '*://*.taboola.com/*',
      '*://*.scorecardresearch.com/*',
      '*://*.hotjar.com/*',
      '*://*.clarity.ms/*',
      '*://*.mixpanel.com/*',
      '*://*.segment.io/*',
      '*://*.segment.com/*',
      '*://*.amplitude.com/*',
      '*://*.quantserve.com/*',
      '*://*.rubiconproject.com/*',
      '*://*.pubmatic.com/*',
      '*://*.casalemedia.com/*',
      '*://*.openx.net/*',
      '*://*.amazon-adsystem.com/*',
      '*://*.advertising.com/*',
      '*://*.moatads.com/*',
      '*://*.chartbeat.com/*',
      '*://*.newrelic.com/*',
      '*://*.nr-data.net/*',
      '*://*.branch.io/*',
      '*://*.appsflyer.com/*',
      '*://*.adjust.com/*',
      '*://*.smartadserver.com/*',
      '*://*.zemanta.com/*',
      '*://*.revcontent.com/*',
      '*://*.adroll.com/*',
      '*://*.bidswitch.net/*',
      '*://*.popads.net/*',
      '*://*.popcash.net/*',
      '*://*.exoclick.com/*',
      '*://*.adcolony.com/*'
    ];

    this.init();
  }

  init() {
    const ses = session.defaultSession;
    ses.webRequest.onBeforeRequest({ urls: this.blockedPatterns }, (details, callback) => {
      if (!this.enabled) {
        return callback({ cancel: false });
      }

      const wcId = details.webContentsId;
      const count = (this.blockedPerTab.get(wcId) || 0) + 1;
      this.blockedPerTab.set(wcId, count);

      // Notify renderer of updated count
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('shield:count-updated', {
          wcId,
          count
        });
      }

      callback({ cancel: true });
    });
  }

  toggleShield() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  isShieldEnabled() {
    return this.enabled;
  }

  getBlockedCount(wcId) {
    return this.blockedPerTab.get(wcId) || 0;
  }

  resetTabCount(wcId) {
    this.blockedPerTab.delete(wcId);
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('shield:count-updated', {
        wcId,
        count: 0
      });
    }
  }
}

module.exports = PrivacyShield;
