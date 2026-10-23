'use strict';

// End-to-end sync test: a local sync server (sync-server/server.js) and two Operecs instances
// ("A" and "B", throwaway profiles). A starts a chain, B joins with A's code; then changes on each
// side must show up on the other. Run after `npm run build`:  node scripts/sync-test.js

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SERVER_PORT = 8797;
// SYNC_TEST_SERVER=https://operecs.ezzeddin.work tests against the real server instead of a local one
const SERVER = process.env.SYNC_TEST_SERVER || `http://127.0.0.1:${SERVER_PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

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

function launch(name, inspectPort) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `operecs-sync-${name}-`));
  // Linux test machines have no keyring; Chromium's basic store stands in for it there
  // and on the Mac a stand-in keychain, so a new Electron build never stops at macOS's keychain prompt
  const extra = process.platform === 'linux' ? ['--password-store=basic'] : process.platform === 'darwin' ? ['--use-mock-keychain'] : [];
  const proc = spawn(require('electron'), [`--inspect=${inspectPort}`, '.', ...extra], {
    cwd: ROOT,
    env: { ...process.env, BROWSER_PROFILE_DIR: profile },
    stdio: process.env.SYNC_TEST_VERBOSE ? ['ignore', 'inherit', 'inherit'] : 'ignore',
  });
  // evaluate in the main process; `S` is sync.js, `M` main's helpers via require cache
  const main = async (expr) => {
    const list = await (await fetch(`http://127.0.0.1:${inspectPort}/json`)).json();
    const r = await cdp(list[0].webSocketDebuggerUrl, 'Runtime.evaluate', {
      expression: `(async () => { const S = process.mainModule.require('./sync'); const E = process.mainModule.require('electron'); const H = process.mainModule.require('./history-db'); const B = process.mainModule.require('./bookmarks'); ${expr} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.exception?.description || 'eval failed'}\n    in: ${expr.trim().slice(0, 120)}`);
    return r.result.value;
  };
  const ready = async () => {
    for (let i = 0; i < 60; i++) {
      try {
        await main('return 1');
        await sleep(3000);
        return;
      } catch {
        await sleep(500);
      }
    }
    throw new Error(`${name} didn't start`);
  };
  return { name, proc, profile, main, ready };
}

(async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'operecs-sync-server-'));
  const server = process.env.SYNC_TEST_SERVER
    ? { kill() {} }
    : spawn(process.execPath, [path.join(ROOT, 'sync-server', 'server.js')], {
        env: { ...process.env, PORT: String(SERVER_PORT), DATA: data },
        stdio: 'ignore',
      });
  const a = launch('A', 9241);
  const b = launch('B', 9242);
  try {
    await Promise.all([a.ready(), b.ready()]);

    console.log('Sync');
    // A: some data, then a new chain
    await a.main(`
      B.add({ url: 'https://sync-test.example/one', title: 'Synced bookmark' });
      const folder = B.addFolder('Synced folder');
      B.add({ url: 'https://sync-test.example/two', title: 'In a folder', parentId: folder.id });
      H.addVisit('https://sync-test.example/visited', 'Visited page', Date.now() - 60000);
      return 1;`);
    const started = await a.main(`return await S.start({ server: '${SERVER}', deviceName: 'Device A' })`);
    check('A starts a chain', started && started.ok, JSON.stringify(started));
    const code = await a.main('return S.code()');
    check('A has a sync code', /^[0-9A-Z]{4}(-[0-9A-Z]{1,4}){12}$/.test(code), code);

    // settings: A changes two, then syncs
    await a.main(`const st = S._test.store(); st.data.settings.theme = 'dark'; st.data.settings.defaultZoom = 125; st.save(); return await S.round();`);

    // B joins
    const joined = await b.main(`return await S.start({ server: '${SERVER}', code: '${code}', deviceName: 'Device B' })`);
    check('B joins with the code', joined && joined.ok, JSON.stringify(joined));
    await b.main('return await S.round()');

    const bTree = await b.main(`return JSON.stringify(B.tree())`);
    check('bookmarks arrive on B', bTree.includes('Synced bookmark') && bTree.includes('Synced folder') && bTree.includes('In a folder'));
    const bVisit = await b.main(`return H.list({ query: 'Visited page' }).length`);
    check('history arrives on B', bVisit >= 1, `visits: ${bVisit}`);
    const bSettings = await b.main(`const st = S._test.store(); return [st.data.settings.theme, st.data.settings.defaultZoom].join(',')`);
    check('settings arrive on B', bSettings === 'dark,125', bSettings);
    const devices = await b.main(`return S.status().devices.map((d) => d.name).join(',')`);
    check('B sees device A', devices.includes('Device A'), devices);

    // B changes things; A gets them
    await b.main(`
      const bm = B.all().find((x) => x.title === 'Synced bookmark');
      B.update(bm.id, { title: 'Renamed on B' });
      H.removeUrl('https://sync-test.example/visited');
      S.historyDeleted({ op: 'url', url: 'https://sync-test.example/visited' });
      return await S.round();`);
    await a.main('return await S.round()');
    const aTree = await a.main(`return JSON.stringify(B.tree())`);
    check('a rename on B reaches A', aTree.includes('Renamed on B') && !aTree.includes('"Synced bookmark"'));
    const aVisit = await a.main(`return H.list({ query: 'Visited page' }).length`);
    check('a history deletion on B reaches A', aVisit === 0, `visits left: ${aVisit}`);

    // a bookmark deleted on A disappears on B
    await a.main(`const bm = B.all().find((x) => x.title === 'In a folder'); B.remove(bm.id); return await S.round();`);
    await b.main('return await S.round()');
    const bTree2 = await b.main(`return JSON.stringify(B.tree())`);
    check('a deletion on A reaches B', !bTree2.includes('In a folder') && bTree2.includes('Synced folder'));

    // B leaves and erases the chain; the server forgets it
    const erased = await b.main(`return await S.stop({ erase: true })`);
    check('B deletes the chain from the server', erased && erased.ok, JSON.stringify(erased));
    await a.main('return await S.round()');
    const aStatus = await a.main('return S.status()');
    check('A stops syncing once the chain is deleted', aStatus.on === false, JSON.stringify(aStatus));
  } catch (err) {
    failures++;
    console.log(`  FAIL test run stopped: ${err.stack || err.message}`);
  } finally {
    for (const x of [a, b]) {
      x.proc.kill();
      setTimeout(() => x.proc.kill('SIGKILL'), 3000).unref(); // one stuck at a system prompt
    }
    server.kill();
    await sleep(1000);
    for (const dir of [a.profile, b.profile, data]) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
    console.log(failures ? `\n${failures} check(s) failed.` : '\nAll sync checks passed.');
    process.exit(failures ? 1 : 0);
  }
})();
