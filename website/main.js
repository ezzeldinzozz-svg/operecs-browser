// Operecs website. No framework: each block below wires one part of the page.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Reveal on scroll, staggered within each section.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px' });
  $$('section').forEach((sec) => $$('.reveal', sec).forEach((el, i) => { el.style.setProperty('--d', `${Math.min(i, 6) * 0.07}s`); io.observe(el); }));

  // Nav border once the page moves.
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('scrolled', scrollY > 20);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // Constellation behind the hero: drifting points, joined when close, pulled toward the cursor.
  const canvas = $('.stars');
  if (canvas && !calm) {
    const ctx = canvas.getContext('2d');
    let w, h, dpr, pts = [], mouse = { x: -999, y: -999 }, visible = true;
    const size = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = canvas.offsetWidth; h = canvas.offsetHeight;
      canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(110, (w * h) / 14000));
      pts = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .18, vy: (Math.random() - .5) * .18, r: Math.random() * 1.2 + .3 }));
    };
    size(); addEventListener('resize', size);
    canvas.parentElement.addEventListener('pointermove', (e) => { const b = canvas.getBoundingClientRect(); mouse = { x: e.clientX - b.left, y: e.clientY - b.top }; });
    canvas.parentElement.addEventListener('pointerleave', () => { mouse = { x: -999, y: -999 }; });
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
    const tick = () => {
      requestAnimationFrame(tick);
      if (!visible) return;
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        const dx = mouse.x - p.x, dy = mouse.y - p.y, d = Math.hypot(dx, dy);
        if (d < 180) { p.vx += dx / d * .006; p.vy += dy / d * .006; }
        p.vx *= .995; p.vy *= .995; p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      }
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 120) { ctx.strokeStyle = `rgba(197,171,254,${(1 - d / 120) * .16})`; ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        }
        ctx.fillStyle = 'rgba(242,239,246,.55)'; ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 7); ctx.fill();
      }
    };
    tick();
  }

  // The window lies back and stands up as you scroll to it.
  const win = $('#window'), stage = $('#stage');
  if (win && !calm) {
    let raf = 0;
    const tilt = () => {
      raf = 0;
      const r = stage.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, 1 - (r.top - innerHeight * 0.18) / (innerHeight * 0.62)));
      const e = 1 - Math.pow(1 - t, 3);
      win.style.setProperty('--tilt', `${22 * (1 - e)}deg`);
      win.style.setProperty('--scale', (0.94 + 0.06 * e).toFixed(4));
    };
    addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(tilt); }, { passive: true });
    addEventListener('resize', tilt); tilt();
  }

  // Tabs in the window switch the page, the address and the shield count.
  const urls = {
    newtab: '<span class="host">Search or type a URL</span>',
    article: '<span class="host">fieldnotes.blog</span>/slow-web',
    split: '<span class="host">docs.operecs</span>/split-view',
  };
  const shields = { newtab: 14, article: 31, split: 7 };
  const shieldEl = $('#shieldCount');
  $$('.tab').forEach((tab) => tab.addEventListener('click', () => {
    const v = tab.dataset.view;
    $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    $$('.view').forEach((el) => el.classList.toggle('show', el.dataset.view === v));
    $('#url').innerHTML = urls[v];
    countTo(shieldEl, shields[v], 500);
  }));

  // Numbers count up when they first come into view.
  function countTo(el, to, ms = 1400, suffix = '') {
    const from = parseInt(el.textContent.replace(/\D/g, ''), 10) || 0;
    if (calm) { el.textContent = to.toLocaleString('en-US') + suffix; return; }
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 4);
      el.textContent = Math.round(from + (to - from) * e).toLocaleString('en-US') + suffix;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const counters = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) {
      countTo(e.target, +e.target.dataset.count, 1800, e.target.dataset.suffix || '');
      counters.unobserve(e.target);
    }
  }, { threshold: .6 });
  $$('[data-count]').forEach((el) => counters.observe(el));

  // Typing in the new tab search box.
  async function typeLoop(el, phrases, onDone) {
    for (let i = 0; ; i = (i + 1) % phrases.length) {
      const p = phrases[i];
      for (let c = 1; c <= p.length; c++) { el.textContent = p.slice(0, c); await wait(55 + Math.random() * 60); }
      if (onDone) await onDone(p, true);
      await wait(1900);
      if (onDone) await onDone(p, false);
      for (let c = p.length; c >= 0; c--) { el.textContent = p.slice(0, c); await wait(22); }
      await wait(350);
    }
  }
  const typed = $('#typed');
  if (typed) {
    if (calm) typed.textContent = 'quiet browsers for mac';
    else typeLoop(typed, ['quiet browsers for mac', 'how many trackers on a news site', 'pasta al limone recipe']);
  }

  // Address bar answers.
  const barTyped = $('#barTyped'), barAnswer = $('#barAnswer');
  const answers = { '12 km in miles': '7.456 mi', '1280 / 16 * 9': '720', '72°F in C': '22.22 °C', '3 hours in minutes': '180 min' };
  let barStarted = false;
  const startBar = () => {
    if (barStarted || !barTyped) return; barStarted = true;
    if (calm) { barTyped.textContent = '12 km in miles'; $('b', barAnswer).textContent = answers['12 km in miles']; barAnswer.classList.add('on'); return; }
    typeLoop(barTyped, Object.keys(answers), async (p, shown) => {
      if (shown) { $('b', barAnswer).textContent = answers[p]; barAnswer.classList.add('on'); } else barAnswer.classList.remove('on');
    });
  };

  // Features: numbered list, auto-advances like a slideshow, pauses while you're inside it.
  const box = $('#principles');
  if (box) {
    const tabs = $$('[role="tab"]', box), DUR = 7000;
    let idx = 0, timer = 0, left = DUR, started = 0, touched = false;
    box.style.setProperty('--dur', `${DUR}ms`);
    const show = (i, focus) => {
      idx = (i + tabs.length) % tabs.length;
      tabs.forEach((t, k) => {
        const on = k === idx, panel = $('#' + t.getAttribute('aria-controls'));
        t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
        panel.hidden = !on; panel.classList.toggle('show', on);
        const bar = $('.bar', t); bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = '';
      });
      if (focus) tabs[idx].focus();
      if (tabs[idx].id === 't-bar') startBar();
      if (tabs[idx].id === 't-sync') scramble();
      schedule(DUR);
    };
    const schedule = (ms) => { clearTimeout(timer); left = ms; started = Date.now(); if (!box.classList.contains('paused') && !calm) timer = setTimeout(() => show(idx + 1), ms); };
    tabs.forEach((t, k) => {
      t.addEventListener('click', () => { touched = true; show(k); });
      t.addEventListener('keydown', (e) => {
        const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        if (d) { e.preventDefault(); show(idx + d, true); }
      });
    });
    box.addEventListener('pointerenter', () => { box.classList.add('paused'); clearTimeout(timer); left -= Date.now() - started; });
    box.addEventListener('pointerleave', () => { box.classList.remove('paused'); schedule(Math.max(800, left)); });
    // Only start the clock once the section is on screen.
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { show(touched ? idx : 0); o.disconnect(); } }, { threshold: .35 }).observe(box);
    const panels = $('.p-panels', box);
    panels.addEventListener('pointermove', (e) => { const b = panels.getBoundingClientRect(); panels.style.setProperty('--mx', `${e.clientX - b.left}px`); panels.style.setProperty('--my', `${e.clientY - b.top}px`); });
  }

  // Horizontal / vertical tabs toggle.
  const demoTabs = $('.demo-tabs');
  $$('.seg button').forEach((b) => b.addEventListener('click', () => {
    demoTabs.dataset.layout = b.dataset.layout;
    $$('.seg button').forEach((x) => x.setAttribute('aria-pressed', x === b));
  }));

  // Extension switches.
  $$('.ext em').forEach((sw) => sw.addEventListener('click', () => sw.classList.toggle('on')));

  // Sync: what the server sees is noise.
  const cipher = $('#cipher');
  let scrambling = 0;
  function scramble() {
    if (!cipher || calm) return;
    clearInterval(scrambling);
    const hex = '0123456789abcdef';
    scrambling = setInterval(() => {
      cipher.textContent = Array.from({ length: 14 }, (_, i) => (i === 4 || i === 9 ? '·' : hex[Math.random() * 16 | 0])).join('');
    }, 90);
  }

  // Link cleaner.
  const dirty = $('#dirty'), cleanBtn = $('#cleanBtn');
  if (dirty) {
    const base = 'https://shop.example.com/lamp/aurora';
    const junk = ['?utm_source=newsletter', '&utm_medium=email', '&utm_campaign=autumn_sale', '&fbclid=IwAR2xQ9k_Lm7Tz', '&gclid=Cj0KCQjw8'];
    const render = () => { dirty.classList.remove('clean'); dirty.innerHTML = `<span class="base">${base}</span>` + junk.map((j) => `<span class="tr">${j}</span>`).join(''); cleanBtn.textContent = 'Clean this link'; };
    render();
    cleanBtn.addEventListener('click', () => {
      if (dirty.classList.contains('clean')) return render();
      dirty.classList.add('clean'); cleanBtn.textContent = 'Show the original';
      $('#cleanFoot').textContent = `${junk.length} tracking tags removed. The page is the same; the trail isn't.`;
    });
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { setTimeout(() => { if (!dirty.classList.contains('clean')) cleanBtn.click(); }, 1400); o.disconnect(); } }, { threshold: .8 }).observe(dirty);
  }

  // Keyboard: lights up the keys of the shortcut you point at.
  const kb = $('#kb');
  if (kb) {
    const rows = [
      ['esc', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'delete:w15'],
      ['tab:w15', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
      ['caps:w18', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", 'return:w18'],
      ['shift:w22', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'shift:w22'],
      ['fn', 'ctrl', 'opt', 'cmd:w125', ':w6', 'cmd:w125', 'opt', '←', '→'],
    ];
    const label = { cmd: '⌘', shift: '⇧', opt: '⌥', ctrl: '⌃', delete: '⌫', return: '↩', tab: '⇥', caps: '⇪' };
    kb.innerHTML = rows.map((r) => `<div class="kb-row">${r.map((k) => {
      const [name, cls] = k.split(':');
      return `<span class="key ${cls || ''}" data-k="${name}">${label[name] || name.toUpperCase()}</span>`;
    }).join('')}</div>`).join('');
    const items = $$('#shortcuts li');
    const light = (li) => {
      items.forEach((x) => x.classList.toggle('on', x === li));
      const keys = li ? li.dataset.keys.split(' ') : [];
      $$('.key', kb).forEach((k) => k.classList.toggle('lit', keys.includes(k.dataset.k)));
    };
    let auto = 0, n = 0;
    const cycle = () => { light(items[n++ % items.length]); };
    const startAuto = () => { if (calm) return light(items[0]); clearInterval(auto); cycle(); auto = setInterval(cycle, 1800); };
    items.forEach((li) => li.addEventListener('pointerenter', () => { clearInterval(auto); light(li); }));
    $('#shortcuts').addEventListener('pointerleave', startAuto);
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { startAuto(); o.disconnect(); } }, { threshold: .4 }).observe(kb);
  }

  // Copy the Homebrew command.
  const toast = $('#toast');
  let toastT = 0;
  const say = (msg) => { toast.textContent = msg; toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('on'), 2000); };
  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); say('Copied. Paste it in Terminal.'); }
    catch { say(b.dataset.copy); }
  }));

  // Buttons lean toward the cursor.
  if (!calm && matchMedia('(pointer: fine)').matches) {
    $$('.magnetic').forEach((b) => {
      b.addEventListener('pointermove', (e) => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .18}px, ${(e.clientY - r.top - r.height / 2) * .3}px)`; });
      b.addEventListener('pointerleave', () => { b.style.transform = ''; });
    });
    $$('.card').forEach((c) => c.addEventListener('pointermove', (e) => { const r = c.getBoundingClientRect(); c.style.setProperty('--mx', `${e.clientX - r.left}px`); c.style.setProperty('--my', `${e.clientY - r.top}px`); }));
  }

  // Point the download buttons at the latest Apple silicon DMG.
  fetch('https://api.github.com/repos/ezzeldinzozz-svg/operecs-browser/releases/latest')
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((rel) => {
      const dmg = (rel.assets || []).find((a) => /-arm64\.dmg$/.test(a.name));
      if (dmg) $$('a[data-download]').forEach((a) => { if (!a.classList.contains('nav-cta')) a.href = dmg.browser_download_url; });
      if (rel.tag_name) $$('[data-version]').forEach((el) => { el.textContent = rel.tag_name; });
    })
    .catch(() => {});
})();
