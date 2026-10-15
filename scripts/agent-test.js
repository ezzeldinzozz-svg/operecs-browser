'use strict';

// Agent control test: turns on Settings → AI agents in a throwaway profile, then talks MCP to it
// over HTTP like Claude Code would. Checks access rules, the tools, and how small snapshots are
// compared with the page's HTML. Run after `npm run build`:  node scripts/agent-test.js

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// a local site: a form and a link
const PAGE = `<!doctype html><title>Agent test</title><h1>Shop</h1><p>Welcome to a page with a fair amount of text that an agent might want to read.</p>
<nav><a href="/next">Next page</a> <a href="https://example.com/">Elsewhere</a></nav>
<form action="/next"><label>Search <input name="q"></label><label>Password <input type="password" name="pw"></label>
<select name="size"><option>Small</option><option>Large</option></select><button>Go</button></form>
${'<div class="filler"><span>decoration</span></div>'.repeat(200)}`;
const site = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(req.url.startsWith('/next') ? `<title>Next</title><h1>Arrived</h1><p>query: ${new URL(req.url, 'http://x').searchParams.get('q') || ''}</p>` : PAGE);
});

function rpc(port, token, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } },
      (res) => {
        let out = '';
        res.on('data', (c) => (out += c));
        res.on('end', () => resolve({ status: res.statusCode, body: out ? JSON.parse(out) : null }));
      },
    );
    req.on('error', reject);
    req.end(data);
  });
}

(async () => {
  await new Promise((r) => site.listen(8799, r));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'operecs-agent-test-'));
  fs.writeFileSync(path.join(profile, 'browser-data.json'), JSON.stringify({ settings: { agentAccess: true }, agent: { token: 'test-token-0123456789', port: 47900 } }));
  const app = spawn(require('electron'), ['.'], { cwd: ROOT, env: { ...process.env, BROWSER_PROFILE_DIR: profile }, stdio: 'ignore' });
  const port = 47900;
  const token = 'test-token-0123456789';
  let id = 1;
  const call = async (name, args = {}) => {
    const r = await rpc(port, token, { jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name, arguments: args } });
    const c = r.body.result;
    return { text: c.content.map((x) => x.text || `[${x.type}]`).join('\n'), error: !!c.isError, content: c.content };
  };
  try {
    for (let i = 0; i < 60; i++) {
      try {
        await rpc(port, token, { jsonrpc: '2.0', id: 0, method: 'ping' });
        break;
      } catch {
        await sleep(500);
      }
    }
    console.log('Access');
    check('no token is refused', (await rpc(port, null, { jsonrpc: '2.0', id: 1, method: 'ping' })).status === 401);
    check('a web page (Origin header) is refused', (await rpc(port, token, { jsonrpc: '2.0', id: 1, method: 'ping' }, { origin: 'https://evil.example' })).status === 403);
    check('a foreign Host (DNS rebinding) is refused', (await rpc(port, token, { jsonrpc: '2.0', id: 1, method: 'ping' }, { host: 'evil.example:47900' })).status === 403);

    console.log('MCP');
    const init = await rpc(port, token, { jsonrpc: '2.0', id: id++, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
    check('initialize', init.body.result && init.body.result.serverInfo.name === 'operecs', init.body.result && init.body.result.protocolVersion);
    check('initialized notification gets 202', (await rpc(port, token, { jsonrpc: '2.0', method: 'notifications/initialized' })).status === 202);
    const list = await rpc(port, token, { jsonrpc: '2.0', id: id++, method: 'tools/list' });
    const names = list.body.result.tools.map((t) => t.name);
    check('tools/list', ['open', 'snapshot', 'click', 'type', 'read', 'find'].every((n) => names.includes(n)), names.join(','));

    console.log('Tools');
    const opened = await call('open', { url: 'http://localhost:8799/' });
    check('open a page in the Agent window', !opened.error && opened.text.includes('Agent test'), opened.text);
    check('browser:// pages are refused', (await call('open', { url: 'browser://settings' })).error);
    const snap = await call('snapshot');
    check('snapshot lists controls with refs', /\[e\d+\] link "Next page"/.test(snap.text) && /\[e\d+\] textbox "Search"/.test(snap.text) && /# Shop/.test(snap.text), snap.text.split('\n').slice(0, 6).join(' | '));
    check(`snapshot is small: ${snap.text.length} characters vs ${PAGE.length} of HTML`, snap.text.length * 5 < PAGE.length);
    const search = /\[(e\d+)\] textbox "Search"/.exec(snap.text)[1];
    const pw = /\[(e\d+)\] password "Password"/.exec(snap.text)[1];
    const size = /\[(e\d+)\] select/.exec(snap.text)[1];
    check('typing into a password field is refused', (await call('type', { ref: pw, text: 'hunter2' })).error);
    check('select an option', (await call('select', { ref: size, value: 'Large' })).text.includes('Large'));
    const typed = await call('type', { ref: search, text: 'shoes', submit: true });
    check('type and submit navigates', typed.text.includes('Next') && typed.text.includes('q=shoes'), typed.text);
    const read = await call('read');
    check('read returns page text', read.text.includes('query: shoes'), read.text.slice(0, 80));
    await call('navigate', { url: 'back' });
    const found = await call('find', { query: 'next page' });
    check('find returns matching controls only', /\[e\d+\] link "Next page"/.test(found.text) && found.text.split('\n').length <= 3, found.text);
    const ref = /\[(e\d+)\]/.exec(found.text)[1];
    const clicked = await call('click', { ref });
    check('click a link (real mouse input)', clicked.text.includes('Page is now') && clicked.text.includes('/next'), clicked.text);
    const shot = await call('screenshot');
    check('screenshot is a JPEG image', shot.content[0].type === 'image' && shot.content[0].mimeType === 'image/jpeg');
    check('user tabs need permission', (await call('user_tabs')).error);
    const tabs = await call('tabs');
    check('tabs lists the agent tab', /\d+ \(active\): /.test(tabs.text), tabs.text);
  } catch (err) {
    failures++;
    console.log(`  FAIL test run stopped: ${err.stack || err.message}`);
  } finally {
    app.kill();
    site.close();
    await sleep(1000);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    console.log(failures ? `\n${failures} check(s) failed.` : '\nAll agent checks passed.');
    process.exit(failures ? 1 : 0);
  }
})();
