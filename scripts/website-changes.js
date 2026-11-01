// Builds the website's Changes page (website/changes.html, between the releases markers) and its
// Atom feed (website/changes.xml) from pages/changelog.json. Dates come from the release tags; a
// version without a tag yet (the one being released) gets today's date. `npm run release` runs this
// after it turns "next" into the new version, so the page ships with every release.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://operecs.ezzeddin.work';
const pagePath = path.join(ROOT, 'website', 'changes.html');
const feedPath = path.join(ROOT, 'website', 'changes.xml');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const today = () => new Date().toISOString().slice(0, 10);

function tagDate(version) {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cs', `v${version}`], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || today();
  } catch { return today(); }
}

// "Fixed: …" and "Security: …" lines get their own groups; everything else is new or improved.
function classify(text) {
  let m = /^Fixed:?\s*/i.exec(text);
  if (m) return { type: 'fix', text: cap(text.slice(m[0].length)) };
  m = /^Security:?\s*/i.exec(text);
  if (m) return { type: 'security', text: cap(text.slice(m[0].length)) };
  return { type: 'new', text };
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// A short lead-in before ": " reads as the item's title ("Sync (Settings → Sync): …").
function itemHtml(text) {
  const i = text.indexOf(': ');
  if (i > 0 && i <= 48 && !text.slice(0, i).includes('. ')) {
    return `<strong>${esc(text.slice(0, i))}</strong> — ${esc(cap(text.slice(i + 2)))}`;
  }
  return esc(text);
}

const GROUPS = [
  ['new', 'New and improved'],
  ['fix', 'Fixed'],
  ['security', 'Security'],
];

const longDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

function releaseHtml(r, latest) {
  const groups = GROUPS.map(([type, label]) => {
    const items = r.items.filter((it) => it.type === type);
    if (!items.length) return '';
    return `
        <div class="grp" data-type="${type}">
          <h3 class="grp-h"><i></i>${label}<span>${items.length}</span></h3>
          <ul>${items.map((it) => `\n            <li>${itemHtml(it.text)}</li>`).join('')}
          </ul>
        </div>`;
  }).join('');
  const n = r.items.length;
  return `
    <article class="rel reveal" id="v${esc(r.version)}">
      <header class="rel-side">
        <time datetime="${r.date}">${longDate(r.date)}</time>
        <div class="rel-tags"><a class="ver mono" href="#v${esc(r.version)}">v${esc(r.version)}</a>${latest ? '<span class="latest">Latest</span>' : ''}</div>
        <p class="rel-count mono">${n} ${n === 1 ? 'change' : 'changes'}</p>
      </header>
      <div class="rel-card">${groups}
      </div>
    </article>`;
}

function build() {
  const log = JSON.parse(fs.readFileSync(path.join(ROOT, 'pages', 'changelog.json'), 'utf8'));
  const releases = Object.keys(log)
    .filter((k) => /^\d+\.\d+\.\d+$/.test(k))
    .map((version) => ({ version, date: tagDate(version), items: log[version].map(classify) }));
  const upcoming = (log.next || []).map(classify);

  const counts = { all: 0, new: 0, fix: 0, security: 0 };
  for (const r of releases) for (const it of r.items) { counts.all++; counts[it.type]++; }

  const next = upcoming.length ? `
    <article class="rel rel-next reveal" id="next">
      <header class="rel-side">
        <time>In the works</time>
        <div class="rel-tags"><span class="ver mono">next</span></div>
        <p class="rel-count mono">Comes with the next update</p>
      </header>
      <div class="rel-card">
        <ul>${upcoming.map((it) => `\n          <li data-type="${it.type}">${itemHtml(it.text)}</li>`).join('')}
        </ul>
      </div>
    </article>` : '';

  const filters = `
    <div class="filters reveal" role="group" aria-label="Show">
      <button type="button" aria-pressed="true" data-filter="all">All <span>${counts.all}</span></button>
      <button type="button" aria-pressed="false" data-filter="new"><i class="dot-new"></i>New <span>${counts.new}</span></button>
      <button type="button" aria-pressed="false" data-filter="fix"><i class="dot-fix"></i>Fixes <span>${counts.fix}</span></button>
      <button type="button" aria-pressed="false" data-filter="security"><i class="dot-security"></i>Security <span>${counts.security}</span></button>
    </div>`;

  const body = `${filters}
    <div class="timeline" id="timeline">${next}${releases.map((r, i) => releaseHtml(r, i === 0)).join('')}
      <p class="empty" hidden>Nothing here yet.</p>
    </div>
    `;
  const page = fs.readFileSync(pagePath, 'utf8');
  const out = page.replace(/(<!-- releases:start -->)[\s\S]*?(<!-- releases:end -->)/, `$1${body}$2`);
  if (out === page && !page.includes('<!-- releases:start -->')) throw new Error('website/changes.html has no releases markers');
  fs.writeFileSync(pagePath, out);

  const updated = releases[0] ? `${releases[0].date}T12:00:00Z` : new Date().toISOString();
  const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Operecs changes</title>
  <subtitle>Every feature, fix and security update in Operecs, newest first.</subtitle>
  <link href="${SITE}/changes.xml" rel="self"/>
  <link href="${SITE}/changes"/>
  <id>${SITE}/changes</id>
  <updated>${updated}</updated>
${releases.slice(0, 30).map((r) => `  <entry>
    <title>Operecs ${esc(r.version)}</title>
    <link href="${SITE}/changes#v${esc(r.version)}"/>
    <id>${SITE}/changes#v${esc(r.version)}</id>
    <updated>${r.date}T12:00:00Z</updated>
    <content type="html">${esc(`<ul>${r.items.map((it) => `<li>${itemHtml(it.text)}</li>`).join('')}</ul>`)}</content>
  </entry>`).join('\n')}
</feed>
`;
  fs.writeFileSync(feedPath, feed);
  console.log(`website: ${releases.length} releases, ${counts.all} changes${upcoming.length ? `, ${upcoming.length} upcoming` : ''}`);
}

build();
