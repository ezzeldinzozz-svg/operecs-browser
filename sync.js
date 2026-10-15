'use strict';

// Sync: settings, bookmarks, history, open tabs, addresses, site permissions, zoom, ad-block
// exceptions and the extension list, between your devices, through a sync server (sync-server/,
// on our VPS). End-to-end encrypted: the server stores only encrypted records.
//
// A "sync chain" is a 32-byte secret, the sync code. Every device of the chain derives from it:
//   chain id   (public, names the chain on the server)
//   token      (proves to the server that a device belongs to the chain; it keeps its hash)
//   enc key    (AES-256-GCM key for every record; never leaves the device)
//   id key     (record ids are HMACs, so the server can't tell what a record is about)
// The code is kept in the macOS keychain (safeStorage), never in the profile file.
//
// Records: { t: type, k: key, m: modified (Unix ms), d: deleted?, v: value }. Each device keeps
// `known[t\nk] = [m, hash]` for what it last sent or applied. A round: push what changed locally
// (current state vs `known`), then pull everything newer than the last server sequence number and
// apply records newer than what we know (last writer wins per key). Per-device records (open
// tabs, extension list, device name) are owned by one device each and never conflict.
// History is append-only: new visits since the last pushed row id, plus deletion events.

const crypto = require('crypto');
const os = require('os');
const { safeStorage, net } = require('electron');

const ROUND_EVERY = 2 * 60 * 1000; // background sync
const LOCAL_DEBOUNCE = 5000; // after a local change
const MAX_PUT = 500; // records per upload
const HISTORY_BATCH = 2000;

// Settings that belong to this computer, not to you
const LOCAL_SETTINGS = new Set(['downloadDir', 'proxyMode', 'proxyServer', 'proxyBypass', 'proxyPac', 'crashReports', 'disabledExtensions', 'installedApps', 'agentAccess', 'agentReadTabs']);

const TYPES = {
  settings: ['set'],
  bookmarks: ['bm'],
  history: ['hv', 'hx'],
  tabs: ['tabs'],
  addresses: ['adr'],
  sites: ['perm', 'zoom', 'allow'],
  extensions: ['ext'],
};
const PER_DEVICE = new Set(['tabs', 'ext', 'dev']);

let ctx = null; // { store, bookmarks, historyDb, settingKeys, applySetting, openTabs, extensions, changed }
let keys = null; // derived from the code
let timer = null;
let roundTimer = null;
let running = null;
let suspended = false; // while applying remote changes

// ---- keys and records

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32
function encodeCode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out.match(/.{1,4}/g).join('-');
}
function decodeCode(text) {
  const clean = String(text || '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (!/^[0-9A-HJKMNP-TV-Z]{52}$/.test(clean)) return null;
  let bits = 0;
  let value = 0;
  const out = [];
  for (const c of clean) {
    value = (value << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out.slice(0, 32));
}

function deriveKeys(secret) {
  const hk = (info, len) => Buffer.from(crypto.hkdfSync('sha256', secret, 'operecs-sync-v1', info, len));
  return {
    chain: hk('chain', 16).toString('hex'),
    token: hk('token', 32).toString('hex'),
    enc: hk('enc', 32),
    id: hk('id', 32),
  };
}

const recordId = (t, k) => crypto.createHmac('sha256', keys.id).update(`${t}\n${k}`).digest('hex');

function seal(id, record) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keys.enc, iv);
  c.setAAD(Buffer.from(id));
  const body = Buffer.concat([c.update(JSON.stringify(record), 'utf8'), c.final()]);
  return Buffer.concat([iv, body, c.getAuthTag()]).toString('base64');
}
function open(id, blob) {
  try {
    const buf = Buffer.from(blob, 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', keys.enc, buf.subarray(0, 12));
    d.setAAD(Buffer.from(id));
    d.setAuthTag(buf.subarray(buf.length - 16));
    const json = Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]).toString('utf8');
    return JSON.parse(json);
  } catch {
    return null; // not ours or damaged: ignored
  }
}

// JSON with sorted keys, so the same value always hashes the same
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v === undefined ? null : v);
}
const hashOf = (v) => crypto.createHash('sha256').update(stable(v)).digest('hex').slice(0, 32);
const guid = () => crypto.randomBytes(12).toString('hex');

// ---- state

const state = () => ctx.store.data.sync;
function ensureState() {
  const s = (ctx.store.data.sync ||= {});
  s.deviceId ||= guid();
  s.deviceName ||= os.hostname().replace(/\.local$/, '') || 'This computer';
  s.types ||= { settings: true, bookmarks: true, history: true, tabs: true, addresses: true, sites: true, extensions: true };
  s.known ||= {};
  s.remote ||= {}; // per-device records of the other devices: { tabs: { dev: v }, ext: {...}, dev: {...} }
  s.lastSeq ||= 0;
  s.historyPushedId ||= 0;
  return s;
}

function secret() {
  const s = state();
  if (!s || !s.codeEnc) return null;
  keychainReady();
  try {
    return decodeCode(safeStorage.decryptString(Buffer.from(s.codeEnc, 'base64')));
  } catch {
    return null;
  }
}

const enabledTypes = () => {
  const s = state();
  const out = new Set(['dev']);
  for (const [group, on] of Object.entries(s.types)) if (on) (TYPES[group] || []).forEach((t) => out.add(t));
  return out;
};

// ---- local state as records { "t\nk": value }

function ensureBookmarkGuids() {
  let added = false;
  const visit = (node) => {
    if (!node.guid) {
      node.guid = node.id === 'bar' || node.id === 'other' ? node.id : guid();
      added = true;
    }
    if (node.type === 'folder') node.children.forEach(visit);
  };
  visit(ctx.store.data.bookmarkTree.bar);
  visit(ctx.store.data.bookmarkTree.other);
  return added;
}

function snapshot(types) {
  const out = new Map();
  const add = (t, k, v) => types.has(t) && out.set(`${t}\n${k}`, v);
  const data = ctx.store.data;
  if (types.has('set')) {
    for (const k of ctx.settingKeys()) if (!LOCAL_SETTINGS.has(k) && data.settings[k] !== undefined) add('set', k, data.settings[k]);
  }
  if (types.has('bm')) {
    ensureBookmarkGuids();
    const visit = (node, parent, index) => {
      if (parent) {
        add('bm', node.guid, node.type === 'folder'
          ? { p: parent.guid, i: index, type: 'folder', title: node.title }
          : { p: parent.guid, i: index, type: 'bookmark', title: node.title, url: node.url, added: node.added || 0 });
      }
      if (node.type === 'folder') node.children.forEach((c, i) => visit(c, node, i));
    };
    visit(data.bookmarkTree.bar, null, 0);
    visit(data.bookmarkTree.other, null, 0);
  }
  if (types.has('adr')) {
    for (const a of data.addresses || []) {
      a.guid ||= guid();
      const { id, guid: g, ...rest } = a;
      add('adr', g, rest);
    }
  }
  if (types.has('perm')) for (const [origin, site] of Object.entries(data.permissions || {})) add('perm', origin, site);
  if (types.has('zoom')) for (const [site, level] of Object.entries(data.zoom || {})) add('zoom', site, level);
  if (types.has('allow')) for (const site of data.adblockAllowlist || []) add('allow', site, true);
  const me = state().deviceId;
  add('dev', me, { name: state().deviceName, platform: process.platform });
  if (types.has('tabs')) add('tabs', me, ctx.openTabs());
  if (types.has('ext')) add('ext', me, ctx.extensions());
  return out;
}

// ---- applying remote records

function applyRecords(list) {
  const data = ctx.store.data;
  const s = state();
  const bm = [];
  let settingsChanged = false;
  let changed = false;
  const visits = [];
  for (const { r, key } of list) {
    if (PER_DEVICE.has(r.t)) {
      if (r.k === s.deviceId) continue;
      const bucket = (s.remote[r.t] ||= {});
      if (r.d) delete bucket[r.k];
      else bucket[r.k] = { ...r.v, m: r.m };
      changed = true;
      continue;
    }
    if (r.t === 'hv') {
      visits.push(r.v);
      continue;
    }
    if (r.t === 'hx') {
      applyHistoryDeletion(r.v);
      changed = true;
      continue;
    }
    const known = s.known[key];
    if (known && known[0] >= r.m) continue; // we have this or newer
    s.known[key] = [r.m, r.d ? 'deleted' : hashOf(r.v)];
    switch (r.t) {
      case 'set':
        if (!ctx.settingKeys().includes(r.k) || LOCAL_SETTINGS.has(r.k)) break;
        if (r.d) break;
        data.settings[r.k] = r.v;
        ctx.applySetting(r.k, r.v);
        settingsChanged = true;
        break;
      case 'bm':
        bm.push(r);
        break;
      case 'adr': {
        const list = (data.addresses ||= []);
        const i = list.findIndex((a) => a.guid === r.k);
        if (r.d) {
          if (i !== -1) list.splice(i, 1);
        } else if (i !== -1) list[i] = { ...r.v, id: list[i].id, guid: r.k };
        else list.push({ ...r.v, id: Math.max(0, ...list.map((a) => a.id || 0)) + 1, guid: r.k });
        changed = true;
        break;
      }
      case 'perm':
        if (r.d) delete data.permissions[r.k];
        else data.permissions[r.k] = r.v;
        changed = true;
        break;
      case 'zoom':
        if (r.d) delete data.zoom[r.k];
        else data.zoom[r.k] = r.v;
        changed = true;
        break;
      case 'allow': {
        const set = new Set(data.adblockAllowlist || []);
        if (r.d) set.delete(r.k);
        else set.add(r.k);
        data.adblockAllowlist = [...set];
        changed = true;
        break;
      }
    }
  }
  if (bm.length) {
    applyBookmarks(bm);
    changed = true;
  }
  if (visits.length) {
    const before = ctx.historyDb.maxVisitId();
    const unpushedLocal = before > s.historyPushedId;
    if (ctx.historyDb.importVisits(visits.filter((v) => v && typeof v.url === 'string' && v.time > 0)) > 0) changed = true;
    // remote visits shouldn't be sent back; local ones made meanwhile still go out next round
    if (!unpushedLocal) s.historyPushedId = ctx.historyDb.maxVisitId();
  }
  return { changed: changed || settingsChanged, settingsChanged };
}

function applyHistoryDeletion(v) {
  if (!v || typeof v !== 'object') return;
  const h = ctx.historyDb;
  if (v.op === 'url' && typeof v.url === 'string') h.removeUrl(v.url);
  else if (v.op === 'site' && typeof v.site === 'string') h.removeWhere((url) => ctx.siteOf(url) === v.site);
  else if (v.op === 'since' && v.time > 0) h.removeSince(v.time);
  else if (v.op === 'all') h.clear();
}

// Rebuild the bookmark tree from local nodes plus the newer remote ones.
function applyBookmarks(records) {
  const data = ctx.store.data;
  ensureBookmarkGuids();
  const nodes = new Map(); // guid -> { p, i, type, title, url, added, local }
  const visit = (node, parent, index) => {
    if (parent) nodes.set(node.guid, { p: parent.guid, i: index, type: node.type, title: node.title, url: node.url, added: node.added, local: node });
    if (node.type === 'folder') node.children.forEach((c, i) => visit(c, node, i));
  };
  visit(data.bookmarkTree.bar, null, 0);
  visit(data.bookmarkTree.other, null, 0);
  const firstMerge = !state().firstMergeDone;
  for (const r of records) {
    if (r.d) {
      nodes.delete(r.k);
      continue;
    }
    if (!r.v || !['folder', 'bookmark'].includes(r.v.type)) continue;
    // first time this device joins: a local bookmark the chain already has (same address, same
    // folder) is the same bookmark, not a second one
    if (firstMerge && r.v.type === 'bookmark') {
      for (const [g, n] of nodes) {
        if (g !== r.k && n.local && !n.remote && n.type === 'bookmark' && n.url === r.v.url && n.p === r.v.p) nodes.delete(g);
      }
    }
    nodes.set(r.k, { ...r.v, local: nodes.get(r.k)?.local, remote: true });
  }
  const children = new Map([['bar', []], ['other', []]]);
  for (const [g, n] of nodes) if (n.type === 'folder') children.set(g, []);
  // a parent that's gone (or a loop) puts the node in Other bookmarks
  const parentOf = (g, n) => {
    let p = n.p;
    const seen = new Set([g]);
    while (p && p !== 'bar' && p !== 'other') {
      if (seen.has(p) || !nodes.has(p)) return 'other';
      seen.add(p);
      p = nodes.get(p).p;
    }
    return children.has(n.p) ? n.p : 'other';
  };
  for (const [g, n] of nodes) children.get(parentOf(g, n)).push([g, n]);
  const build = (g) =>
    children
      .get(g)
      .sort((a, b) => a[1].i - b[1].i || (a[0] < b[0] ? -1 : 1))
      .map(([cg, n]) => {
        const id = n.local ? n.local.id : `b${data.bookmarkNextId++}`;
        const base = { id, guid: cg, type: n.type, title: n.title || '' };
        if (n.type === 'folder') return { ...base, children: build(cg) };
        return { ...base, url: n.url, added: n.added || Date.now(), ...(n.local && n.local.icon ? { icon: n.local.icon } : {}) };
      });
  data.bookmarkTree.bar.children = build('bar');
  data.bookmarkTree.other.children = build('other');
}

// ---- one round: push, then pull

async function request(method, path, body) {
  const s = state();
  const res = await net.fetch(`${s.server}/v1/chains/${keys.chain}${path}`, {
    method,
    headers: { authorization: `Bearer ${keys.token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  if (res.status === 410) throw Object.assign(new Error('Sync was turned off from another device.'), { gone: true });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `server answered ${res.status}`);
  return json;
}

async function putAll(records) {
  for (let i = 0; i < records.length; i += MAX_PUT) {
    await request('PUT', '/records', { records: records.slice(i, i + MAX_PUT) });
  }
}

async function push() {
  const s = state();
  const types = enabledTypes();
  const now = Date.now();
  const current = snapshot(types);
  const out = [];
  const sent = [];
  for (const [key, v] of current) {
    const h = hashOf(v);
    const known = s.known[key];
    if (known && known[1] === h) continue;
    const [t, k] = key.split('\n');
    const r = { t, k, m: Math.max(now, known ? known[0] + 1 : 0), v };
    out.push({ id: recordId(t, k), blob: seal(recordId(t, k), r) });
    sent.push([key, [r.m, h]]);
  }
  // gone locally: tell the others (only types we sync and own)
  for (const [key, known] of Object.entries(s.known)) {
    if (known[1] === 'deleted' || current.has(key)) continue;
    const [t, k] = key.split('\n');
    if (!types.has(t) || (PER_DEVICE.has(t) && k !== s.deviceId)) continue;
    const r = { t, k, m: Math.max(now, known[0] + 1), d: true };
    out.push({ id: recordId(t, k), blob: seal(recordId(t, k), r) });
    sent.push([key, [r.m, 'deleted']]);
  }
  // history: visits since the last pushed row
  if (types.has('hv')) {
    let rows;
    while ((rows = ctx.historyDb.visitsAfter(s.historyPushedId, HISTORY_BATCH)).length) {
      const batch = rows.map((row) => {
        const k = `${row.time}\n${row.url}`;
        const r = { t: 'hv', k, m: row.time, v: { url: row.url, title: row.title, time: row.time } };
        return { id: recordId('hv', k), blob: seal(recordId('hv', k), r) };
      });
      await putAll(batch);
      s.historyPushedId = rows[rows.length - 1].id;
      ctx.store.save();
    }
  }
  // history deletions waiting to go out
  for (const v of s.pendingHistoryDeletes || []) {
    const k = guid();
    out.push({ id: recordId('hx', k), blob: seal(recordId('hx', k), { t: 'hx', k, m: now, v }) });
  }
  if (out.length) await putAll(out);
  for (const [key, val] of sent) s.known[key] = val;
  s.pendingHistoryDeletes = [];
  return out.length;
}

async function pull() {
  const s = state();
  let more = true;
  let total = 0;
  const types = enabledTypes();
  while (more) {
    const page = await request('GET', `/records?since=${s.lastSeq}&limit=1000`);
    const list = [];
    for (const rec of page.records) {
      const r = open(rec.id, rec.blob);
      if (!r || typeof r.t !== 'string' || typeof r.k !== 'string' || typeof r.m !== 'number') continue;
      if (rec.id !== recordId(r.t, r.k)) continue; // a record moved to another id: ignore
      if (!types.has(r.t) && !PER_DEVICE.has(r.t)) continue;
      list.push({ r, key: `${r.t}\n${r.k}` });
    }
    if (list.length) {
      suspended = true;
      try {
        const res = applyRecords(list);
        if (res.changed) ctx.changed(res);
      } finally {
        suspended = false;
      }
    }
    total += list.length;
    s.lastSeq = page.seq;
    more = page.more;
    ctx.store.save();
  }
  s.firstMergeDone = true;
  return total;
}

async function round() {
  if (!keys) return;
  if (running) return running;
  const s = state();
  let gone = false;
  running = (async () => {
    try {
      // the first round of a device pulls first, so the chain's data wins over a fresh profile's
      if (!s.firstMergeDone) await pull();
      await push();
      await pull();
      s.lastSync = Date.now();
      s.lastError = '';
    } catch (err) {
      s.lastError = err && err.message ? err.message : String(err);
      gone = !!(err && err.gone);
    } finally {
      ctx.store.save();
      running = null;
      ctx.statusChanged();
    }
    // the chain was deleted from another device: sync stops here too (data on this device stays)
    if (gone) {
      await stop();
      ctx.store.data.sync.lastError = 'Sync was turned off from another device.';
      ctx.store.save();
    }
  })();
  return running;
}

// ---- public

function init(context) {
  ctx = context;
  if (!ctx.store.data.sync) return;
  ensureState();
  const code = secret();
  if (!code) return;
  keys = deriveKeys(code);
  roundTimer = setInterval(round, ROUND_EVERY);
  roundTimer.unref();
  setTimeout(round, 3000);
}

// Something changed locally (store saved, a page visited): sync a little later.
function localChanged() {
  if (!keys || suspended) return;
  clearTimeout(timer);
  timer = setTimeout(round, LOCAL_DEBOUNCE);
}

function validServer(url) {
  try {
    const u = new URL(String(url).trim());
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    return (u.protocol === 'https:' || (local && u.protocol === 'http:')) && !u.username && !u.password ? u.origin : null;
  } catch {
    return null;
  }
}

// Linux without a keyring (no GNOME Keyring / KWallet): keep the code like Chrome does there, in
// Chromium's basic store, rather than refusing to sync.
function keychainReady() {
  if (safeStorage.isEncryptionAvailable()) return true;
  if (process.platform === 'linux' && typeof safeStorage.setUsePlainTextEncryption === 'function') {
    safeStorage.setUsePlainTextEncryption(true);
    return safeStorage.isEncryptionAvailable();
  }
  return false;
}

async function start({ server, code, deviceName }) {
  if (!keychainReady()) return { error: 'The system keychain is not available.' };
  const origin = validServer(server);
  if (!origin) return { error: 'The sync server must be an https:// address.' };
  const bytes = code ? decodeCode(code) : crypto.randomBytes(32);
  if (!bytes) return { error: 'That sync code is not valid. Check it and try again.' };
  const text = encodeCode(bytes);
  const s = ensureState();
  s.server = origin;
  if (deviceName) s.deviceName = String(deviceName).slice(0, 60);
  s.codeEnc = safeStorage.encryptString(text).toString('base64');
  s.known = {};
  s.remote = {};
  s.lastSeq = 0;
  s.historyPushedId = 0;
  s.firstMergeDone = !code; // a new chain has nothing to merge
  s.lastError = '';
  keys = deriveKeys(bytes);
  ctx.store.save();
  clearInterval(roundTimer);
  roundTimer = setInterval(round, ROUND_EVERY);
  roundTimer.unref();
  await round();
  if (state().lastError) {
    const error = state().lastError;
    stop();
    return { error: `Couldn't reach the sync server: ${error}` };
  }
  return { ok: true };
}

// Turn sync off on this device; with `erase`, delete the chain from the server for every device.
async function stop({ erase = false } = {}) {
  let error = '';
  if (erase && keys) {
    try {
      await request('DELETE', '');
    } catch (err) {
      error = err.message;
    }
  }
  clearInterval(roundTimer);
  clearTimeout(timer);
  keys = null;
  const s = ctx.store.data.sync;
  if (s) {
    delete s.codeEnc;
    if (s.server) s.lastServer = s.server;
    delete s.server;
    s.known = {};
    s.remote = {};
    s.lastSeq = 0;
    s.historyPushedId = 0;
  }
  ctx.store.save();
  ctx.statusChanged();
  return error ? { error } : { ok: true };
}

function code() {
  const c = secret();
  return c ? encodeCode(c) : '';
}

function status() {
  const s = ctx.store.data.sync;
  if (!s || !keys) return { on: false, deviceName: (s && s.deviceName) || os.hostname().replace(/\.local$/, ''), server: (s && s.server) || (s && s.lastServer) || '', lastError: (s && s.lastError) || '' };
  const devices = Object.entries(s.remote.dev || {}).map(([id, d]) => ({ id, name: d.name, platform: d.platform, seen: d.m }));
  return {
    on: true,
    server: s.server,
    deviceName: s.deviceName,
    types: s.types,
    lastSync: s.lastSync || 0,
    lastError: s.lastError || '',
    syncing: !!running,
    devices,
  };
}

function setTypes(types) {
  const s = ensureState();
  for (const k of Object.keys(TYPES)) if (typeof types[k] === 'boolean') s.types[k] = types[k];
  // turned on again: compare everything once more
  if (keys) {
    for (const key of Object.keys(s.known)) if (!enabledTypes().has(key.split('\n')[0])) delete s.known[key];
    s.lastSeq = 0;
  }
  ctx.store.save();
  localChanged();
}

function setDeviceName(name) {
  const s = ensureState();
  s.deviceName = String(name || '').trim().slice(0, 60) || s.deviceName;
  ctx.store.save();
  localChanged();
}

// History deleted by the user (not by the "keep history for" setting): the other devices delete it too.
function historyDeleted(v) {
  const s = ctx.store.data.sync;
  if (!keys || !s || !s.types.history) return;
  (s.pendingHistoryDeletes ||= []).push(v);
  localChanged();
}

const otherTabs = () => {
  const s = ctx.store.data.sync;
  if (!keys || !s) return [];
  const names = s.remote.dev || {};
  return Object.entries(s.remote.tabs || {}).map(([id, v]) => ({ device: (names[id] && names[id].name) || 'Another device', updated: v.m, windows: v.windows || [] }));
};

const otherExtensions = () => {
  const s = ctx.store.data.sync;
  if (!keys || !s) return [];
  const out = new Map();
  for (const v of Object.values(s.remote.ext || {})) for (const e of v.list || []) out.set(e.id, e);
  return [...out.values()];
};

module.exports = { init, start, stop, round, code, status, setTypes, setDeviceName, localChanged, historyDeleted, otherTabs, otherExtensions, validServer, _test: { encodeCode, decodeCode, deriveKeys, stable, store: () => ctx.store } };
