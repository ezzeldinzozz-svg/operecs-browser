'use strict';

// DRM test: castlabs' Electron must install Widevine and let a page use it. Run after
// `npm run build`:  node scripts/drm-test.js   (the first Widevine download can take a minute)

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdp(wsUrl, method, params) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  return new Promise((res) => {
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id === 1) {
        ws.close();
        res(d.result);
      }
    };
    ws.send(JSON.stringify({ id: 1, method, params }));
  });
}
async function main(expr) {
  const list = await (await fetch('http://127.0.0.1:9251/json')).json();
  const r = await cdp(list[0].webSocketDebuggerUrl, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result && r.result.value;
}

(async () => {
  let failed = false;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'operecs-drm-test-'));
  const app = spawn(require('electron'), ['--inspect=9251', '.'], { cwd: ROOT, env: { ...process.env, BROWSER_PROFILE_DIR: profile }, stdio: 'ignore' });
  const E = "process.mainModule.require('electron')";
  try {
    for (let i = 0; i < 60; i++) {
      try {
        await main('1');
        break;
      } catch {
        await sleep(500);
      }
    }
    const ready = await main(
      `Promise.race([${E}.components.whenReady().then((r) => 'ok ' + r.map((c) => c.title + ' ' + c.version).join(', ')).catch((e) => 'failed ' + (e && e.message)), new Promise((r) => setTimeout(() => r('timed out'), 120000))])`,
    );
    console.log(`  ${ready.startsWith('ok') ? 'ok  ' : 'FAIL'} Widevine installs — ${ready}`);
    failed ||= !ready.startsWith('ok');
    await main(`(async () => { const wc = ${E}.webContents.getAllWebContents().find((w) => /^browser:[/][/](welcome|newtab)/.test(w.getURL())); await wc.loadURL('https://example.com/').catch(() => {}); return 1; })()`);
    await sleep(1500);
    const pageCode = `navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{ initDataTypes: ['cenc'], videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }] }]).then((a) => 'ok ' + a.keySystem).catch((e) => 'failed ' + e.name)`;
    const access = String(
      await main(`(async () => { const wc = ${E}.webContents.getAllWebContents().find((w) => w.getURL().startsWith('https://example.com')); return wc ? await wc.executeJavaScript(${JSON.stringify(pageCode)}) : 'failed: no page'; })()`),
    );
    console.log(`  ${access.startsWith('ok') ? 'ok  ' : 'FAIL'} a page can use Widevine — ${access}`);
    failed ||= !access.startsWith('ok');
  } catch (err) {
    failed = true;
    console.log(`  FAIL test run stopped: ${err.message}`);
  } finally {
    app.kill();
    setTimeout(() => app.kill('SIGKILL'), 3000).unref();
    await sleep(1500);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    console.log(failed ? '\nDRM check failed.' : '\nDRM works.');
    process.exit(failed ? 1 : 0);
  }
})();
