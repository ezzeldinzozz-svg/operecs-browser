'use strict';

// Browser control for AI agents (Claude Code, Codex, any MCP client), built to be cheap in tokens.
//
// Operecs runs a small MCP server (Streamable HTTP, JSON responses) on 127.0.0.1 when the user
// turns it on in Settings → Privacy & Security → AI agents. Agents get:
//   - their own window (an in-memory session: none of your logins, nothing in your history) that
//     you can watch and take over;
//   - compact page snapshots: one line per control or heading, each control with a short ref
//     ("e12") to act on, instead of HTML or a screenshot (typically 10–50x fewer tokens);
//   - readable page text in pages (offset/maxChars), and find-in-page that returns only matches;
//   - actions that answer in one line (what happened, where the page is now);
//   - screenshots only on request, small JPEGs.
// Rules: agents can't type into password, card or one-time-code fields, can't open browser:// or
// file:// pages, and only read your own tabs if you allow it (read-only).
//
// Security: listens on 127.0.0.1 only; every request needs the bearer token shown in Settings;
// requests with an Origin header (i.e. from web pages) or a foreign Host header are refused.

const http = require('http');
const crypto = require('crypto');

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const DEFAULT_PORT = 47821;
const WORLD = 1987; // isolated JS world for our page scripts (pages can't see or tamper with it)
const MAX_SNAPSHOT = 12000;
const TAB = { type: ['string', 'number'], description: 'tab id (default: the active agent tab)' };

let ctx = null; // { version, store, createAgentWindow, agentWindow, createTab, closeTab, userTabs, isWeb }
let server = null;
let port = 0;

// ---- page-side scripts (run in an isolated world of the page)

const PAGE_LIB = String.raw`
(() => {
  if (window.__op) return;
  const refs = new Map(); // ref -> WeakRef(element)
  const ids = new WeakMap(); // element -> ref
  let next = 1;
  const refOf = (el) => {
    let r = ids.get(el);
    if (!r) {
      r = 'e' + next++;
      ids.set(el, r);
      refs.set(r, new WeakRef(el));
    }
    return r;
  };
  const get = (ref) => {
    const w = refs.get(ref);
    const el = w && w.deref();
    return el && el.isConnected ? el : null;
  };
  const clip = (s, n) => {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  };
  const visible = (el) => {
    if (el.closest('[aria-hidden="true"], [hidden], [inert]')) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const ROLE_OF = { A: 'link', BUTTON: 'button', SELECT: 'select', TEXTAREA: 'textbox', SUMMARY: 'button', DETAILS: 'group' };
  const INPUT_ROLE = { checkbox: 'checkbox', radio: 'radio', submit: 'button', button: 'button', reset: 'button', image: 'button', range: 'slider', file: 'file', search: 'searchbox', email: 'textbox', password: 'password', tel: 'textbox', url: 'textbox', number: 'number', date: 'date', 'datetime-local': 'date', time: 'time', color: 'color' };
  const roleOf = (el) => {
    const aria = el.getAttribute('role');
    if (aria) return aria;
    if (el.tagName === 'INPUT') return INPUT_ROLE[(el.type || 'text').toLowerCase()] || 'textbox';
    if (el.tagName === 'A') return el.hasAttribute('href') ? 'link' : null;
    if (el.isContentEditable && el.contentEditable !== 'inherit') return 'textbox';
    return ROLE_OF[el.tagName] || null;
  };
  const INTERACTIVE_ROLES = new Set(['link', 'button', 'checkbox', 'radio', 'textbox', 'searchbox', 'password', 'select', 'combobox', 'listbox', 'option', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'switch', 'slider', 'spinbutton', 'number', 'date', 'time', 'color', 'file', 'treeitem']);
  const nameOf = (el) => {
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map((x) => x.innerText).join(' ');
      if (t.trim()) return t;
    }
    const n = el.getAttribute('aria-label') || el.getAttribute('alt') || '';
    if (n.trim()) return n;
    if (el.labels && el.labels.length) return [...el.labels].map((l) => l.innerText).join(' ');
    if (el.tagName === 'INPUT' && ['submit', 'button', 'reset'].includes(el.type)) return el.value;
    const text = el.innerText || el.textContent || '';
    if (text.trim()) return text;
    const img = el.querySelector && el.querySelector('img[alt], svg[aria-label], [title]');
    if (img) return img.getAttribute('alt') || img.getAttribute('aria-label') || img.getAttribute('title') || '';
    return el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || '';
  };
  const SENSITIVE = /pass|card|cc-|cvc|cvv|csc|one-time|otp|security.?code|pin\b/i;
  const sensitive = (el) => {
    if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return false;
    if ((el.type || '').toLowerCase() === 'password') return true;
    const hints = [el.autocomplete, el.name, el.id, el.getAttribute('aria-label'), el.placeholder].join(' ');
    return SENSITIVE.test(hints);
  };
  const stateOf = (el, role) => {
    const s = [];
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') s.push('disabled');
    if (role === 'checkbox' || role === 'radio' || role === 'switch' || role === 'menuitemcheckbox') {
      const c = el.checked !== undefined ? el.checked : el.getAttribute('aria-checked') === 'true';
      s.push(c ? 'checked' : 'unchecked');
    }
    if (el.getAttribute('aria-expanded')) s.push(el.getAttribute('aria-expanded') === 'true' ? 'expanded' : 'collapsed');
    if (el.getAttribute('aria-selected') === 'true') s.push('selected');
    if (el.tagName === 'SELECT') s.push('value "' + clip(el.selectedOptions[0] ? el.selectedOptions[0].text : '', 40) + '"');
    else if ('value' in el && el.tagName !== 'BUTTON' && role !== 'link' && role !== 'checkbox' && role !== 'radio' && el.value) {
      s.push(sensitive(el) ? 'filled' : 'value "' + clip(el.value, 60) + '"');
    }
    if (el.required) s.push('required');
    return s.length ? ' (' + s.join(', ') + ')' : '';
  };
  const linkHint = (el) => {
    try {
      const u = new URL(el.href, location.href);
      return u.origin === location.origin ? ' → ' + clip(u.pathname + u.search, 50) : ' → ' + clip(u.host + u.pathname, 50);
    } catch {
      return '';
    }
  };
  // Every element in document order, including open shadow roots.
  function* walk(root) {
    const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let n = it.currentNode;
    while (n) {
      if (n.nodeType === 1) {
        yield n;
        if (n.shadowRoot) yield* walk(n.shadowRoot);
      }
      n = it.nextNode();
    }
  }
  const TEXT_TAGS = new Set(['P', 'LI', 'TD', 'TH', 'DT', 'DD', 'BLOCKQUOTE', 'PRE', 'FIGCAPTION', 'LABEL', 'CAPTION']);
  const inView = (el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  };
  function snapshot({ text = false, viewport = false } = {}) {
    const lines = [];
    const seenText = new Set();
    for (const el of walk(document.body || document.documentElement)) {
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NOSCRIPT' || el.tagName === 'TEMPLATE') continue;
      const role = roleOf(el);
      const heading = /^H[1-6]$/.test(el.tagName) || role === 'heading';
      const interactive = role && INTERACTIVE_ROLES.has(role);
      const textBlock = text && TEXT_TAGS.has(el.tagName);
      if (!interactive && !heading && !textBlock && el.tagName !== 'IFRAME' && role !== 'dialog' && role !== 'alert') continue;
      if (!visible(el)) continue;
      if (viewport && !inView(el)) continue;
      if (heading) {
        const level = el.tagName[1] || el.getAttribute('aria-level') || '2';
        lines.push('#'.repeat(Number(level)) + ' ' + clip(el.innerText, 120));
      } else if (interactive) {
        if (role === 'option' && el.closest('select')) continue;
        lines.push('[' + refOf(el) + '] ' + role + ' "' + clip(nameOf(el), 80) + '"' + stateOf(el, role) + (role === 'link' ? linkHint(el) : ''));
      } else if (role === 'dialog' || role === 'alert') {
        lines.push('-- ' + role + ': ' + clip(el.getAttribute('aria-label') || el.innerText, 100));
      } else if (el.tagName === 'IFRAME') {
        lines.push('-- frame ' + clip(el.title || el.src, 80));
      } else {
        if (el.querySelector('p, li, td, th')) continue; // the inner block says it
        const t = clip(el.innerText, 240);
        if (t.length < 3 || seenText.has(t)) continue;
        seenText.add(t);
        lines.push(t);
      }
    }
    const scroll = document.scrollingElement || document.documentElement;
    const pct = scroll.scrollHeight > innerHeight ? Math.round(((scrollY + innerHeight) / scroll.scrollHeight) * 100) : 100;
    return { title: document.title, url: location.href, scroll: pct, lines };
  }
  function read({ offset = 0, max = 8000 } = {}) {
    const root = document.querySelector('article, main, [role=main]') || document.body;
    const t = (root ? root.innerText : '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
    return { title: document.title, url: location.href, total: t.length, text: t.slice(offset, offset + max) };
  }
  function find(query, limit = 20) {
    const q = String(query).toLowerCase();
    const out = [];
    for (const el of walk(document.body)) {
      const role = roleOf(el);
      const interactive = role && INTERACTIVE_ROLES.has(role);
      const textual = /^H[1-6]$/.test(el.tagName) || TEXT_TAGS.has(el.tagName);
      if (!interactive && !textual) continue;
      const name = interactive ? nameOf(el) : el.innerText;
      if (!String(name).toLowerCase().includes(q) || !visible(el)) continue;
      if (textual && !interactive && el.querySelector('p, li, td, th, a, button')) continue;
      out.push(interactive ? '[' + refOf(el) + '] ' + role + ' "' + clip(name, 80) + '"' + stateOf(el, role) : clip(name, 200));
      if (out.length >= limit) break;
    }
    return out;
  }
  // Where to click: scrolls the element into view, returns its center (CSS px in the viewport)
  function target(ref) {
    const el = get(ref);
    if (!el) return { error: 'No element ' + ref + ' (the page changed; take a new snapshot)' };
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, role: roleOf(el), name: clip(nameOf(el), 60), sensitive: sensitive(el) };
  }
  function focus(ref, clear) {
    const el = get(ref);
    if (!el) return { error: 'No element ' + ref + ' (the page changed; take a new snapshot)' };
    if (sensitive(el)) return { error: 'Agents may not type into password, card or one-time-code fields.' };
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    el.focus();
    if (clear && 'value' in el) {
      el.select && el.select();
    }
    return { ok: true, name: clip(nameOf(el), 60) };
  }
  function choose(ref, value) {
    const el = get(ref);
    if (!el || el.tagName !== 'SELECT') return { error: ref + ' is not a select' };
    const opt = [...el.options].find((o) => o.value === value || o.text.trim() === value) || [...el.options].find((o) => o.text.toLowerCase().includes(String(value).toLowerCase()));
    if (!opt) return { error: 'No option "' + value + '". Options: ' + [...el.options].map((o) => o.text.trim()).slice(0, 30).join(' | ') };
    el.value = opt.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, chosen: opt.text.trim() };
  }
  window.__op = { snapshot, read, find, target, focus, choose };
})();
`;

async function inPage(wc, call) {
  return wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: `${PAGE_LIB}\n;window.__op.${call}` }], false);
}

// ---- tabs

function agentTabs() {
  const w = ctx.agentWindow();
  return w ? w.tabs : [];
}

function tabById(id) {
  const tabs = agentTabs();
  if (id === undefined || id === null || id === '') {
    const w = ctx.agentWindow();
    return w ? tabs.find((t) => t.id === w.activeId) || tabs[0] : null;
  }
  return tabs.find((t) => String(t.id) === String(id)) || null;
}

const where = (wc) => `${wc.getTitle() || '(no title)'} — ${wc.getURL()}`;

function waitForLoad(wc, timeout = 15000) {
  return new Promise((resolve) => {
    if (!wc.isLoading()) return setTimeout(resolve, 150);
    const done = () => {
      clearTimeout(t);
      wc.removeListener('did-stop-loading', done);
      setTimeout(resolve, 150);
    };
    const t = setTimeout(done, timeout);
    wc.once('did-stop-loading', done);
  });
}

// After an action: give the page a moment to react (navigate, open a menu), then report.
async function settle(wc, before) {
  await new Promise((r) => setTimeout(r, 350));
  if (wc.isLoading()) await waitForLoad(wc);
  const now = wc.getURL();
  return now !== before ? `Page is now: ${where(wc)}` : 'Same page (take a snapshot to see changes).';
}

function checkUrl(url) {
  const u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) return { error: 'Only http(s) addresses can be opened.' };
  return { url: u };
}

// ---- tools

const TOOLS = [
  {
    name: 'tabs',
    description: 'List the agent window\'s tabs (id, title, url, which one is active).',
    inputSchema: { type: 'object', properties: {} },
    run: () => {
      const w = ctx.agentWindow();
      const list = agentTabs();
      if (!list.length) return 'No agent tabs yet. Use open to start.';
      return list.map((t) => `${t.id}${w && w.activeId === t.id ? ' (active)' : ''}: ${where(t.wc)}`).join('\n');
    },
  },
  {
    name: 'open',
    description: 'Open a URL in a new agent tab (the agent window has none of the user\'s logins). Returns the tab id and title.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    run: async ({ url }) => {
      const c = checkUrl(url);
      if (c.error) return { error: c.error };
      const w = ctx.agentWindow() || ctx.createAgentWindow();
      const tab = ctx.createTab(w, c.url);
      await waitForLoad(tab.wc);
      return `Tab ${tab.id}: ${where(tab.wc)}`;
    },
  },
  {
    name: 'navigate',
    description: 'Go to a URL in a tab, or "back" / "forward" / "reload".',
    inputSchema: { type: 'object', properties: { tab: TAB, url: { type: 'string' } }, required: ['url'] },
    run: async ({ tab, url }) => {
      const t = tabById(tab);
      if (!t) return { error: 'No such tab. Use open first.' };
      const nav = t.wc.navigationHistory;
      if (url === 'back') nav.canGoBack() && nav.goBack();
      else if (url === 'forward') nav.canGoForward() && nav.goForward();
      else if (url === 'reload') t.wc.reload();
      else {
        const c = checkUrl(url);
        if (c.error) return { error: c.error };
        t.wc.loadURL(c.url).catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 200));
      await waitForLoad(t.wc);
      return where(t.wc);
    },
  },
  {
    name: 'snapshot',
    description:
      'Compact outline of the page: one line per heading and control. Controls have refs like [e12] to use with click/type/select. Much cheaper than HTML or screenshots. Set text=true to include paragraphs, viewport=true for only what is on screen.',
    inputSchema: {
      type: 'object',
      properties: {
        tab: TAB,
        text: { type: 'boolean' },
        viewport: { type: 'boolean' },
        offset: { type: 'number', description: 'skip this many lines (for long pages)' },
        maxChars: { type: 'number' },
      },
    },
    run: async ({ tab, text = false, viewport = false, offset = 0, maxChars = 6000 }) => {
      const t = tabById(tab);
      if (!t) return { error: 'No such tab. Use open first.' };
      const s = await inPage(t.wc, `snapshot(${JSON.stringify({ text: !!text, viewport: !!viewport })})`);
      const max = Math.min(Math.max(500, Number(maxChars) || 6000), MAX_SNAPSHOT);
      const out = [];
      let size = 0;
      let i = Math.max(0, Number(offset) || 0);
      for (; i < s.lines.length; i++) {
        size += s.lines[i].length + 1;
        if (size > max) break;
        out.push(s.lines[i]);
      }
      const more = i < s.lines.length ? `\n… ${s.lines.length - i} more lines (snapshot offset=${i})` : '';
      return `${s.title} — ${s.url} (scrolled ${s.scroll}%)\n${out.join('\n')}${more}`;
    },
  },
  {
    name: 'read',
    description: 'The page\'s readable text (main content), in pages: offset and maxChars (default 8000).',
    inputSchema: { type: 'object', properties: { tab: TAB, offset: { type: 'number' }, maxChars: { type: 'number' } } },
    run: async ({ tab, offset = 0, maxChars = 8000 }) => {
      const t = tabById(tab);
      if (!t) return { error: 'No such tab. Use open first.' };
      const r = await inPage(t.wc, `read(${JSON.stringify({ offset: Math.max(0, Number(offset) || 0), max: Math.min(Math.max(500, Number(maxChars) || 8000), 30000) })})`);
      const end = (Number(offset) || 0) + r.text.length;
      return `${r.title} — ${r.url} (characters ${offset}–${end} of ${r.total})\n\n${r.text}${end < r.total ? `\n\n… more: read offset=${end}` : ''}`;
    },
  },
  {
    name: 'find',
    description: 'Find text or controls on the page; returns only matching lines (controls with refs).',
    inputSchema: { type: 'object', properties: { tab: TAB, query: { type: 'string' } }, required: ['query'] },
    run: async ({ tab, query }) => {
      const t = tabById(tab);
      if (!t) return { error: 'No such tab. Use open first.' };
      const lines = await inPage(t.wc, `find(${JSON.stringify(String(query))})`);
      return lines.length ? lines.join('\n') : `Nothing matches "${query}".`;
    },
  },
  {
    name: 'click',
    description: 'Click a control by its ref (from snapshot or find). Uses real mouse input.',
    inputSchema: { type: 'object', properties: { tab: TAB, ref: { type: 'string' } }, required: ['ref'] },
    run: async ({ tab, ref }) => {
      const t = tabById(tab);
      if (!t) return { error: 'No such tab. Use open first.' };
      const r = await inPage(t.wc, `target(${JSON.stringify(String(ref))})`);
      if (r.error) return { error: r.error };
      const z = t.wc.getZoomFactor();
      const x = Math.round(r.x * z);
      const y = Math.round(r.y * z);
      const before = t.wc.getURL();
      t.wc.sendInputEvent({ type: 'mouseMove', x, y });
      t.wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      t.wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      return `Clicked ${ref} ${r.role || ''} "${r.name}". ${await settle(t.wc, before)}`;
    },
  },
  {
    name: 'type',
    description: 'Type text into a field by ref (replaces what is there). submit=true presses Enter after. Not allowed in password, card or one-time-code fields.',
    inputSchema: {
      type: 'object',
      properties: { tab: TAB, ref: { type: 'string' }, text: { type: 'string' }, submit: { type: 'boolean' } },
      required: ['ref', 'text'],
    },
    run: async ({ tab, ref, text, submit = false }) => {
      const t = tabById(tab);
      if (!t) return { error: 'No such tab. Use open first.' };
      const r = await inPage(t.wc, `focus(${JSON.stringify(String(ref))}, true)`);
      if (r.error) return { error: r.error };
      const before = t.wc.getURL();
      if (String(text).length) t.wc.insertText(String(text));
      else t.wc.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' });
      if (submit) {
        t.wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
        t.wc.sendInputEvent({ type: 'char', keyCode: '\r' });
        t.wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
      }
      return `Typed into ${ref} "${r.name}".${submit ? ` Pressed Enter. ${await settle(t.wc, before)}` : ''}`;
    },
  },
  {
    name: 'select',
    description: 'Choose an option in a select (dropdown) by its value or visible text.',
    inputSchema: { type: 'object', properties: { tab: TAB, ref: { type: 'string' }, value: { type: 'string' } }, required: ['ref', 'value'] },
    run: async ({ tab, ref, value }) => {
      const t = tabById(tab);
      if (!t) return { error: 'No such tab. Use open first.' };
      const r = await inPage(t.wc, `choose(${JSON.stringify(String(ref))}, ${JSON.stringify(String(value))})`);
      return r.error ? { error: r.error } : `Chose "${r.chosen}" in ${ref}.`;
    },
  },
  {
    name: 'key',
    description: 'Press a key in the page: Enter, Escape, Tab, ArrowDown, PageDown, Backspace, … (optionally with modifiers like "Shift+Tab").',
    inputSchema: { type: 'object', properties: { tab: TAB, key: { type: 'string' } }, required: ['key'] },
    run: async ({ tab, key }) => {
      const t = tabById(tab);
      if (!t) return { error: 'No such tab. Use open first.' };
      const parts = String(key).split('+');
      const name = parts.pop();
      const map = { Enter: 'Return', Escape: 'Escape', Esc: 'Escape', ArrowDown: 'Down', ArrowUp: 'Up', ArrowLeft: 'Left', ArrowRight: 'Right' };
      const keyCode = map[name] || name;
      const modifiers = parts.map((m) => m.toLowerCase()).map((m) => (m === 'cmd' || m === 'meta' ? 'meta' : m));
      const before = t.wc.getURL();
      t.wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
      if (keyCode === 'Return') t.wc.sendInputEvent({ type: 'char', keyCode: '\r', modifiers });
      t.wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
      return `Pressed ${key}. ${await settle(t.wc, before)}`;
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the page: direction "down" or "up" (one screen), or "top" / "bottom".',
    inputSchema: { type: 'object', properties: { tab: TAB, direction: { type: 'string', enum: ['down', 'up', 'top', 'bottom'] } }, required: ['direction'] },
    run: async ({ tab, direction }) => {
      const t = tabById(tab);
      if (!t) return { error: 'No such tab. Use open first.' };
      const js = { down: 'scrollBy(0, innerHeight * 0.85)', up: 'scrollBy(0, -innerHeight * 0.85)', top: 'scrollTo(0, 0)', bottom: 'scrollTo(0, document.documentElement.scrollHeight)' }[direction];
      if (!js) return { error: 'direction: down, up, top or bottom' };
      const pct = await t.wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: `${js}; Math.round((scrollY + innerHeight) / Math.max(1, document.documentElement.scrollHeight) * 100)` }]);
      return `Scrolled ${direction}; now at ${pct}% of the page.`;
    },
  },
  {
    name: 'screenshot',
    description: 'A small JPEG of what the tab shows. Use only when the layout matters; snapshot is far cheaper.',
    inputSchema: { type: 'object', properties: { tab: TAB } },
    run: async ({ tab }) => {
      const t = tabById(tab);
      if (!t) return { error: 'No such tab. Use open first.' };
      let img = await t.wc.capturePage();
      if (img.getSize().width > 1024) img = img.resize({ width: 1024 });
      return { image: img.toJPEG(60).toString('base64') };
    },
  },
  {
    name: 'close',
    description: 'Close an agent tab.',
    inputSchema: { type: 'object', properties: { tab: TAB }, required: ['tab'] },
    run: ({ tab }) => {
      const t = tabById(tab);
      if (!t) return { error: 'No such tab.' };
      ctx.closeTab(t);
      return `Closed tab ${tab}.`;
    },
  },
  {
    name: 'user_tabs',
    description: 'The user\'s own open tabs (title and URL), if they allowed agents to read them in Settings.',
    inputSchema: { type: 'object', properties: {} },
    run: () => {
      if (!ctx.store.data.settings.agentReadTabs) return { error: 'The user hasn\'t allowed agents to read their tabs (Settings → Privacy & Security → AI agents).' };
      const list = ctx.userTabs();
      return list.length ? list.map((t) => `${t.id}: ${t.title} — ${t.url}`).join('\n') : 'No open tabs.';
    },
  },
  {
    name: 'user_tab_read',
    description: 'Read one of the user\'s tabs (read-only): mode "outline" (compact snapshot) or "text" (readable text, with offset/maxChars).',
    inputSchema: { type: 'object', properties: { tab: TAB, mode: { type: 'string', enum: ['outline', 'text'] }, offset: { type: 'number' }, maxChars: { type: 'number' } }, required: ['tab'] },
    run: async ({ tab, mode = 'text', offset = 0, maxChars = 8000 }) => {
      if (!ctx.store.data.settings.agentReadTabs) return { error: 'The user hasn\'t allowed agents to read their tabs (Settings → Privacy & Security → AI agents).' };
      const t = ctx.userTabs().find((x) => String(x.id) === String(tab));
      if (!t) return { error: 'No such tab. Use user_tabs.' };
      if (mode === 'outline') {
        const s = await inPage(t.wc, 'snapshot({ text: false })');
        // refs are for the agent's own tabs; the user's tabs are read-only
        return `${s.title} — ${s.url}\n${s.lines.map((l) => l.replace(/^\[e\d+\] /, '')).join('\n').slice(0, MAX_SNAPSHOT)}`;
      }
      const r = await inPage(t.wc, `read(${JSON.stringify({ offset: Math.max(0, Number(offset) || 0), max: Math.min(Math.max(500, Number(maxChars) || 8000), 30000) })})`);
      return `${r.title} — ${r.url} (characters ${offset}–${Number(offset) + r.text.length} of ${r.total})\n\n${r.text}`;
    },
  },
];

const INSTRUCTIONS =
  'Operecs browser control. Start with open (a new agent tab), then snapshot to see the page as a compact outline with refs like [e12], ' +
  'and click/type/select by ref. Prefer snapshot, find and read over screenshot: they cost far fewer tokens. ' +
  'Actions answer in one line; take a new snapshot when you need to see what changed. ' +
  'Agent tabs have none of the user\'s logins. Never ask to type passwords, card numbers or one-time codes (it is refused). ' +
  'Stop and ask the user before paying, ordering, sending messages, posting or deleting anything.';

// ---- MCP over HTTP (JSON-RPC 2.0, JSON responses)

async function callTool(name, args) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { content: [{ type: 'text', text: `Unknown tool ${name}` }], isError: true };
  try {
    const out = await tool.run(args || {});
    if (out && out.error) return { content: [{ type: 'text', text: out.error }], isError: true };
    if (out && out.image) return { content: [{ type: 'image', data: out.image, mimeType: 'image/jpeg' }] };
    return { content: [{ type: 'text', text: String(out) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Failed: ${err && err.message ? err.message : err}` }], isError: true };
  }
}

async function handleRpc(msg) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return { jsonrpc: '2.0', id: msg && msg.id !== undefined ? msg.id : null, error: { code: -32600, message: 'Invalid request' } };
  }
  const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params && msg.params.protocolVersion;
      return reply({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'operecs', title: 'Operecs browser', version: ctx.version },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call':
      return reply(await callTool(msg.params && msg.params.name, msg.params && msg.params.arguments));
    default:
      if (msg.id === undefined) return null; // notifications (initialized, cancelled…)
      return { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Unknown method ${msg.method}` } };
  }
}

function token() {
  const a = (ctx.store.data.agent ||= {});
  if (!a.token) {
    a.token = crypto.randomBytes(24).toString('hex');
    ctx.store.save();
  }
  return a.token;
}

function sameSecret(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function onRequest(req, res) {
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  // only local tools: no web page (Origin), no DNS rebinding (Host)
  const host = String(req.headers.host || '');
  if (req.headers.origin || !new RegExp(`^(127\\.0\\.0\\.1|localhost|\\[::1\\]):${port}$`).test(host)) return send(403, { error: 'forbidden' });
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname !== '/mcp') return send(404, { error: 'not found' });
  const m = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
  if (!m || !sameSecret(m[1], token())) return send(401, { error: 'token required' }, { 'www-authenticate': 'Bearer' });
  if (req.method === 'GET') return send(405, { error: 'no server-sent stream; POST JSON-RPC' }, { allow: 'POST' });
  if (req.method === 'DELETE') return send(200, {});
  if (req.method !== 'POST') return send(405, { error: 'method not allowed' }, { allow: 'POST' });
  let body = '';
  req.on('data', (c) => {
    body += c;
    if (body.length > 1024 * 1024) req.destroy();
  });
  req.on('end', async () => {
    let msg;
    try {
      msg = JSON.parse(body);
    } catch {
      return send(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    const results = (await Promise.all((Array.isArray(msg) ? msg : [msg]).map(handleRpc))).filter(Boolean);
    if (!results.length) return send(202);
    send(200, Array.isArray(msg) ? results : results[0]);
  });
}

function start() {
  if (server) return Promise.resolve(port);
  return new Promise((resolve) => {
    const tryPort = (p, attempts) => {
      const s = http.createServer(onRequest);
      s.once('error', () => (attempts > 0 ? tryPort(p + 1, attempts - 1) : resolve(0)));
      s.listen(p, '127.0.0.1', () => {
        server = s;
        port = p;
        const a = (ctx.store.data.agent ||= {});
        if (a.port !== p) {
          a.port = p;
          ctx.store.save();
        }
        resolve(p);
      });
    };
    tryPort((ctx.store.data.agent && ctx.store.data.agent.port) || DEFAULT_PORT, 20);
  });
}

function stop() {
  if (server) server.close();
  server = null;
  port = 0;
}

function init(context) {
  ctx = context;
  if (ctx.store.data.settings.agentAccess) start();
}

function setEnabled(on) {
  if (on) return start();
  stop();
  return Promise.resolve(0);
}

function connection() {
  if (!server) return { on: false };
  const url = `http://127.0.0.1:${port}/mcp`;
  const t = token();
  return {
    on: true,
    url,
    claude: `claude mcp add --transport http operecs ${url} --header "Authorization: Bearer ${t}"`,
    codex: `export OPERECS_TOKEN=${t}\ncodex mcp add operecs --url ${url} --bearer-token-env-var OPERECS_TOKEN`,
  };
}

// A new token: connected agents must be added again.
function resetToken() {
  (ctx.store.data.agent ||= {}).token = crypto.randomBytes(24).toString('hex');
  ctx.store.save();
}

module.exports = { init, setEnabled, connection, resetToken, _test: { handleRpc, TOOLS } };
