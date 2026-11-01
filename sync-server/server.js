'use strict';

// Operecs sync server. Stores end-to-end encrypted records for "sync chains" and hands them to
// the other devices of the same chain. It never sees what is synced: every record is encrypted on
// the device with a key derived from the chain's sync code, and record ids are keyed hashes. The
// server only knows a chain id, a hash of its access token, record sizes and times.
//
//   PUT    /v1/chains/:chain/records   { records: [{ id, blob }] }  -> { seq }
//   GET    /v1/chains/:chain/records?since=N&limit=M                -> { records: [{ id, blob, seq }], seq, more }
//   DELETE /v1/chains/:chain                                         -> 204 (everything of the chain is deleted;
//                                                                      later requests for it get 410 Gone)
//   GET    /v1/health                                                -> { ok: true }
//
// Anything outside /v1 is the Operecs website, served from WEBSITE (a folder of static files; the
// Docker image copies the repository's website/ there). Without WEBSITE those paths are 404.
//
// Every chain request carries "Authorization: Bearer <token>". The first request for a new chain
// registers the token's SHA-256; later requests must match it.
//
// Run: node server.js   (env: PORT=8787, HOST=127.0.0.1, DATA=./data). Put HTTPS in front of it
// (Caddy, nginx); the browser only syncs over https. Node 22.5 or later (node:sqlite).

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const DATA = process.env.DATA || path.join(__dirname, 'data');
const MAX_BODY = 8 * 1024 * 1024; // one upload
const MAX_BLOB = 256 * 1024; // one record (base64)
const MAX_RECORDS_PER_PUT = 1000;
const MAX_RECORDS_PER_CHAIN = 500000;
const MAX_BYTES_PER_CHAIN = 512 * 1024 * 1024;
const MAX_CHAINS = Number(process.env.MAX_CHAINS || 1000);
const WEBSITE = process.env.WEBSITE ? path.resolve(process.env.WEBSITE) : '';
const RATE_PER_MINUTE = 240; // requests per chain per minute

fs.mkdirSync(DATA, { recursive: true });
const db = new DatabaseSync(path.join(DATA, 'sync.sqlite'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS chains (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL,
    created INTEGER NOT NULL,
    used INTEGER NOT NULL,
    bytes INTEGER NOT NULL DEFAULT 0,
    records INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS records (
    chain TEXT NOT NULL,
    id TEXT NOT NULL,
    blob TEXT NOT NULL,
    seq INTEGER NOT NULL,
    PRIMARY KEY (chain, id)
  );
  CREATE INDEX IF NOT EXISTS records_seq ON records (chain, seq);
  CREATE TABLE IF NOT EXISTS counters (chain TEXT PRIMARY KEY, seq INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS deleted (chain TEXT PRIMARY KEY, at INTEGER NOT NULL);
`);

const q = {
  chain: db.prepare('SELECT * FROM chains WHERE id = ?'),
  chainCount: db.prepare('SELECT COUNT(*) AS n FROM chains'),
  addChain: db.prepare('INSERT INTO chains (id, token_hash, created, used) VALUES (?, ?, ?, ?)'),
  touch: db.prepare('UPDATE chains SET used = ? WHERE id = ?'),
  stats: db.prepare('UPDATE chains SET bytes = bytes + ?, records = records + ? WHERE id = ?'),
  existing: db.prepare('SELECT length(blob) AS size FROM records WHERE chain = ? AND id = ?'),
  upsert: db.prepare(
    'INSERT INTO records (chain, id, blob, seq) VALUES (?, ?, ?, ?) ON CONFLICT (chain, id) DO UPDATE SET blob = excluded.blob, seq = excluded.seq',
  ),
  nextSeq: db.prepare(
    'INSERT INTO counters (chain, seq) VALUES (?, 1) ON CONFLICT (chain) DO UPDATE SET seq = seq + 1 RETURNING seq',
  ),
  seq: db.prepare('SELECT seq FROM counters WHERE chain = ?'),
  since: db.prepare('SELECT id, blob, seq FROM records WHERE chain = ? AND seq > ? ORDER BY seq LIMIT ?'),
  dropRecords: db.prepare('DELETE FROM records WHERE chain = ?'),
  dropCounter: db.prepare('DELETE FROM counters WHERE chain = ?'),
  dropChain: db.prepare('DELETE FROM chains WHERE id = ?'),
  wasDeleted: db.prepare('SELECT 1 FROM deleted WHERE chain = ?'),
  markDeleted: db.prepare('INSERT OR REPLACE INTO deleted (chain, at) VALUES (?, ?)'),
};

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const sameHash = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const CHAIN_RE = /^[0-9a-f]{32}$/;
const ID_RE = /^[0-9a-f]{32,64}$/;
const BLOB_RE = /^[A-Za-z0-9+/=]+$/;

const hits = new Map(); // chain -> { minute, count }
function rateLimited(chain) {
  const minute = Math.floor(Date.now() / 60000);
  const h = hits.get(chain);
  if (!h || h.minute !== minute) {
    hits.set(chain, { minute, count: 1 });
    return false;
  }
  return ++h.count > RATE_PER_MINUTE;
}
setInterval(() => hits.clear(), 10 * 60 * 1000).unref();

function send(res, status, body) {
  const json = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
      } else parts.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
}

// The chain for this request, registering it on first use. Returns null after answering.
function authorize(req, res, chain) {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization || '');
  if (!m) return send(res, 401, { error: 'token required' }), null;
  const hash = sha256(m[1]);
  // a chain deleted by one of its devices stays deleted: the others are told to stop
  if (q.wasDeleted.get(chain)) return send(res, 410, { error: 'deleted' }), null;
  let row = q.chain.get(chain);
  if (!row) {
    if (q.chainCount.get().n >= MAX_CHAINS) return send(res, 503, { error: 'server full' }), null;
    const now = Date.now();
    q.addChain.run(chain, hash, now, now);
    row = q.chain.get(chain);
  } else if (!sameHash(row.token_hash, hash)) {
    return send(res, 403, { error: 'wrong token' }), null;
  }
  if (rateLimited(chain)) return send(res, 429, { error: 'slow down' }), null;
  q.touch.run(Date.now(), chain);
  return row;
}

async function putRecords(req, res, chain, row) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (err) {
    return send(res, err.status || 400, { error: err.status ? 'too large' : 'bad json' });
  }
  const records = body && Array.isArray(body.records) ? body.records : null;
  if (!records || records.length > MAX_RECORDS_PER_PUT) return send(res, 400, { error: 'records: array of at most ' + MAX_RECORDS_PER_PUT });
  for (const r of records) {
    if (!r || typeof r.id !== 'string' || !ID_RE.test(r.id) || typeof r.blob !== 'string' || r.blob.length > MAX_BLOB || !BLOB_RE.test(r.blob)) {
      return send(res, 400, { error: 'bad record' });
    }
  }
  let bytes = 0;
  let added = 0;
  db.exec('BEGIN');
  try {
    for (const r of records) {
      const old = q.existing.get(chain, r.id);
      bytes += r.blob.length - (old ? old.size : 0);
      if (!old) added++;
    }
    if (row.records + added > MAX_RECORDS_PER_CHAIN || row.bytes + bytes > MAX_BYTES_PER_CHAIN) {
      db.exec('ROLLBACK');
      return send(res, 507, { error: 'chain storage full' });
    }
    let seq = 0;
    for (const r of records) {
      seq = q.nextSeq.get(chain).seq;
      q.upsert.run(chain, r.id, r.blob, seq);
    }
    q.stats.run(bytes, added, chain);
    db.exec('COMMIT');
    send(res, 200, { seq: seq || (q.seq.get(chain) || { seq: 0 }).seq });
  } catch (err) {
    db.exec('ROLLBACK');
    console.error(err);
    send(res, 500, { error: 'storage error' });
  }
}

function getRecords(res, chain, url) {
  const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
  const limit = Math.min(2000, Math.max(1, Number(url.searchParams.get('limit')) || 500));
  const rows = q.since.all(chain, since, limit + 1);
  const more = rows.length > limit;
  const records = rows.slice(0, limit);
  const seq = records.length ? records[records.length - 1].seq : since;
  send(res, 200, { records, seq, more });
}

function deleteChain(res, chain) {
  db.exec('BEGIN');
  q.dropRecords.run(chain);
  q.dropCounter.run(chain);
  q.dropChain.run(chain);
  q.markDeleted.run(chain, Date.now());
  db.exec('COMMIT');
  res.writeHead(204).end();
}

// The website: static files, "/changes" finds changes.html, unknown paths get the 404 page.
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon',
  '.xml': 'application/atom+xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json',
};
function serveWebsite(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method not allowed' });
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, { error: 'bad path' }); }
  if (rel.endsWith('/')) rel += 'index.html';
  const candidates = path.extname(rel) ? [rel] : [`${rel}.html`, `${rel}/index.html`];
  for (const c of candidates) {
    const file = path.join(WEBSITE, path.normalize(c));
    if (!file.startsWith(WEBSITE + path.sep)) break;
    let stat;
    try { stat = fs.statSync(file); } catch { continue; }
    if (!stat.isFile()) continue;
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      // File names aren't versioned, so only fonts and images (which rarely change) cache long.
      'Cache-Control': ['.woff2', '.png', '.ico'].includes(ext) ? 'public, max-age=86400' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file).pipe(res);
  }
  const notFound = path.join(WEBSITE, '404.html');
  if (fs.existsSync(notFound)) {
    res.writeHead(404, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'public, max-age=300' });
    return req.method === 'HEAD' ? res.end() : fs.createReadStream(notFound).pipe(res);
  }
  return send(res, 404, { error: 'not found' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/v1/health') return send(res, 200, { ok: true });
    if (WEBSITE && !url.pathname.startsWith('/v1/')) return serveWebsite(req, res, url);
    const m = /^\/v1\/chains\/([^/]+)(\/records)?$/.exec(url.pathname);
    if (!m || !CHAIN_RE.test(m[1])) return send(res, 404, { error: 'not found' });
    const chain = m[1];
    const records = !!m[2];
    if (!(records && (req.method === 'GET' || req.method === 'PUT')) && !(!records && req.method === 'DELETE')) {
      return send(res, 405, { error: 'method not allowed' });
    }
    const row = authorize(req, res, chain);
    if (!row) return;
    if (req.method === 'PUT') return putRecords(req, res, chain, row);
    if (req.method === 'GET') return getRecords(res, chain, url);
    return deleteChain(res, chain);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, 500, { error: 'server error' });
  }
});

server.requestTimeout = 60000;
server.listen(PORT, HOST, () => console.log(`Operecs sync server on http://${HOST}:${PORT}`));
module.exports = server;
