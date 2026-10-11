# Browser study: Rill, Mind, Search, Zephium, Deta Surf (2026-10-11)

What each one does that we liked, how it's built (from its code where public), and how we'd do it in
Operecs (Electron 44, Chromium). The to-do items are in `FEATURES.md` under "Later".

## At a glance

| Browser | Built with | Size | Source | What we liked |
| --- | --- | --- | --- | --- |
| [Rill](https://rill.love) | macOS app (closed) | — | closed | Claude Code and Codex inside the browser, working on your projects |
| [Mind Browser](https://www.mindbrowser.tech) | Electron (castlabs build, so DRM works), plain JS | — | [MIT](https://github.com/prakharsingh1/mind-browser) | Nearly our feature set plus agents, Notes, hubs, Onion mode; the landing page |
| [Search](https://officecommun.com/search) | Swift + the Mac's own WebKit, ~42k lines, no dependencies | 6 MB | [MIT](https://github.com/driceroland/Search) | How light it is |
| [Zephium](https://zephium.app) | Rust + Tauri, system WebKit / WebView2, Svelte UI | ~30–40 MB | [MPL-2.0](https://github.com/zephium-browser/Zephium) | Browse/Work switch, the Work canvas, AI, Tasks, Notes, Time |
| [Deta Surf](https://deta.surf) | Electron-style app, Svelte + Rust | — | [Apache-2.0](https://github.com/deta/surf) | Smart Notes |

## Rill: Claude Code and Codex in the browser

- It doesn't call an AI API itself. It runs the **Claude Code / Codex CLIs already on your Mac**,
  signed in with your own plan (no API keys, no new subscription).
- **Projects come from the CLIs' history**: Claude Code keeps sessions per folder in
  `~/.claude/projects/<folder>/*.jsonl`, Codex in `~/.codex/sessions/`. Rill lists those folders as
  projects and routes a request to the right one.
- **⌘E from any page**: "ask about this page" or "send this to project X". The answer opens beside
  the page; tasks keep running in the background, with an "At work" tray, notifications, and a
  "Today in your projects" list of finished work.
- Agents browse in **their own tabs without your logins**, and you can take over.
- Safety: new tasks are read-only until you allow edits; web tasks stop before paying, sending,
  posting or deleting; agents never type into password, card or one-time-code fields.
- Extras: AI tab groups, history that reads like a daily journal and is searchable by describing a
  page, a map of your projects, compare up to six tabs in one table, hold Fn to speak a task.

**How we'd build it:** Electron's main process can start the CLIs directly: `claude -p
--output-format stream-json` (or the Claude Agent SDK) and `codex exec --json`, with the project
folder as the working directory. Stream the events into a side panel next to the page (we have
split view and side views already). Read-only first: Claude Code's permission modes and Codex's
sandbox flags do this. Check Anthropic's and OpenAI's terms on driving their CLIs from another
app before shipping.

## Mind Browser

Same base as us (Electron, Chrome extensions, ad blocking, split view, screenshots, task manager,
proxy), plus:

- **Agent Mode**: Planner, Navigator (drives real tabs: click, type, scroll), Researcher (with
  citations), Writer, Analyst (tables, compares tabs).
- **Bring your own model**: Ollama (fully local), Anthropic, OpenAI, Gemini, Groq, OpenRouter;
  a different model per agent; no server in between.
- **Notes**: send highlighted text to Notes with its source; notes are plain files on disk.
- **AI summaries** of a page or of all open tabs, into Notes.
- **Command palette**: tabs, bookmarks, settings and actions in one search.
- **PDF editor**: highlight, draw, type, sign.
- **New tab**: daily wallpaper, weather, clock, notes, headlines. **News** and **Finance** hubs.
- **Onion Mode**: a separate in-memory window routed through a Tor process the browser starts (we decided not to do this, 2026-10-11).
- **Protection slider**: Off / Standard / Strict (Strict adds fingerprint masking, HTTPS-only,
  referrer trimming, WebRTC leak blocking).
- **DRM**: it ships on castlabs' Electron build (`castlabs/electron-releases`), which is how
  Netflix/Spotify work in an Electron browser. castlabs' builds and their signing service (EVS)
  are free to use, so our "DRM" item may not need money, only the switch and an EVS account.
- **Landing page**: dark, product-first; hero with download buttons, then a real browser mockup,
  numbered feature cards, model list, privacy, shortcuts, and a closing download section.

## Search: why it's so light

It isn't clever code, it's the engine choice:

- **No bundled browser engine.** It uses WebKit, which ships inside macOS (Safari's engine), so the
  app is 6 MB. Chrome/Electron apps carry their own copy of Chromium (~130 MB for us, 1.4 GB for
  Chrome with its data).
- **WebKit shares one set of system processes** (networking, GPU) with Safari and runs lean page
  processes: 11 processes with five tabs vs 29 for Chrome, 51 MB memory before the first page.
- **Native Swift UI**, no web-based interface, no dependencies; launches in 320 ms.
- Chrome extensions run on **WebKit's own extension engine** (macOS 15.4+), with the APIs WebKit
  lacks filled in by the app.

The cost: WebKit renders like Safari (some sites are Chrome-only), the browser can only be as new
as the user's macOS, and it's a different codebase from ours. Zephium does the same in Rust/Tauri
(system WebKit on Mac, WebView2 on Windows).

For Operecs the options are:
1. **Make Electron leaner** (no rewrite): sleep background tabs sooner, limit renderer processes,
   lazy-load features, trim the download (strip unused locales, compress). Gains are real but
   modest; Chromium stays inside.
2. **A WebKit edition** (rewrite, big): a native Mac app on WKWebView like Search, sharing our
   pages and design. Months of work; only worth it if "tiny and fast" becomes the product's point.

Ideas from Search worth taking regardless: **hide any element on a site, for good** (⇧⌘H, then
click); **video that follows you** into a floating window when you leave the tab; **⌘K tab
switcher**; **swipe between spaces**; passwords in the macOS keychain with Touch ID (we chose
extensions instead).

## Zephium

- **Browse / Work switch**: one switch flips the window between a normal browser and an agent
  workspace. Personal browsing stays clean; work lives on its own surface.
- **Work canvas**: describe an outcome; a lead agent splits it, **helpers browse in parallel in
  live tabs you can watch**, and results (tables, charts, diagrams, plans, code) **stay on the
  canvas** instead of scrolling away in a chat. Any source opens beside the canvas.
- A plan becomes **tasks** in one click; anything can be saved as a **note**.
- Reaches past the browser: reads and edits folders you grant, runs commands, hands big coding
  jobs to Claude Code or Codex, uses **MCP servers** (Linear, Notion, Sentry, Figma…) and CLIs.
- Asks before anything that posts, merges or changes something. Every page an agent opens and
  everything sent to the model is visible.
- Models: its own, your own keys (Anthropic, OpenAI, Gemini, DeepSeek, OpenRouter, kept in the
  keychain) or local (Ollama, LM Studio). 25 built-in skills (trip planning, research, compare,
  plan my day, fix a bug…), and you can write your own.
- **Built in**: Tasks in natural language ("call Anna tomorrow at 3"), Time (time per site, focus
  sessions that block sites), Notes (Markdown files you own, edits from other apps show up),
  a desktop-wide launcher (⌘⇧Space) for tabs, history, notes and commands.
- Spaces, profiles, folders, split view; Liquid Glass on macOS 26.

## Deta Surf: Smart Notes

- A **rich text editor** where AI writes with you, from your own material, instead of a chat.
- **@-mention** anything: open tabs, other notes, saved PDFs, notebooks; it becomes the note's
  context.
- **Citations** link to the exact spot: a section of a page, a PDF page, a video timestamp; they
  open in split view beside the note.
- **"Ask" from any tab** opens a note beside it with that tab already in context.
- `/` menu for headings, lists, code, to-dos; paste images and tables.
- Suggested questions about the open page; a **web search** tool inside notes.
- **Surflets**: small interactive apps (a chart, a demo) generated from a sentence.
- A local **library and notebooks** in an open file format.

## How this fits Operecs

Most of these share one foundation: **an AI layer** (models: Claude Code / Codex CLIs, own keys,
local Ollama) with the safety rules above, plus **a side panel** next to the page. Notes, summaries,
page chat, the canvas and agents all sit on top of that. Build that layer once, then add the
surfaces one at a time.
