# Operecs features

**Focus until we go public: Apple silicon Mac, English only.** Windows, Linux, Intel Macs and
other languages are parked (see the end) — the code that exists for them stays, but we don't
build, test or extend it until we decide to go public.

Edit freely: move lines between sections, delete what you don't want, add your own.
`[ ]` to do · `[x]` done. The old detailed checklist (all platforms) is in
`research/features-archive.md`.

---

## To do — must have for 1.0

- [x] Check by hand: password-manager extensions sign in and autofill (Bitwarden confirmed 2026-10-10)
- [ ] Check by hand: device chooser for Serial / Bluetooth in the installed app (macOS asks for Bluetooth permission)
- [ ] Check by hand: dragging a file onto the window opens it (was broken; fixed 2026-10-10, opens on the page or in a new tab from the toolbar; re-check after the update)
- [x] Check by hand: media keys / Now Playing control the playing tab (confirmed 2026-10-10)
- [x] Storage: history in SQLite (History.sqlite; bookmarks stay in JSON — small and written rarely)
- [x] Full-text history search (FTS5; every word as a prefix)
- [x] Security routine: weekly GitHub Action opens a pull request for a newer Electron patch (with CI); `npm run release -- X.Y.Z --critical` makes installed copies restart for the update within 10 minutes
- [x] Mixed content: lock turns to a warning when a secure page actually loads something over http (Chromium upgrades/blocks most); insecure form submissions from https pages ask first (with HTTPS-Only on they're upgraded)
- [x] Ask before closing a window or quitting (Cmd+Q / menu) when a page has unsaved changes; one dialog names the tabs

## To do — should have

- [x] Profiles: everything separate per profile (each runs as its own Operecs process with its own folder); profile button with the profile's color in the toolbar; add / rename / recolor / delete in Settings. Each open profile has its own Dock icon
- [x] Address & contact form autofill (not passwords): pick a saved address under a focused field; offered to save on submit; Settings → Addresses
- [x] Print preview with page range and layout — on Mac the system print panel provides it (preview, pages, orientation, scale, Save as PDF); a built-in preview is only needed for Windows/Linux (parked)
- [x] New tab: background image or color, show/hide shortcuts and bookmarks, site icons on tiles, pin / edit / remove / add shortcuts (Customize button)
- [x] Resume interrupted downloads where they stopped (also after quitting Operecs, when the server supports it)
- [x] Auto-delete history older than 7/30/90/365 days; clear history, downloads, cookies or cache when Operecs quits
- [x] Paste as plain text (Cmd+Shift+V, Edit menu and right-click in text fields)
- [x] "What's new" page after an update (browser://whatsnew, Help → What's New; notes in pages/changelog.json)
- [x] Bookmarks menu in the menu bar listing bookmarks and folders (with icons)
- [x] Favicons stored for bookmarks (bar, menu, manager, new tab)

## To do — nice to have

- [x] Tab groups (named, colored, collapsible, saved)
- [x] Vertical tabs / sidebar layout
- [x] Split view (two tabs side by side)
- [x] Tab hover preview cards
- [x] "Mute site" (all tabs of a site, remembered; tab right-click menu)
- [x] Two-finger swipe back/forward with an arrow
- [x] Command bar actions in the address bar ("clear history", "settings")
- [x] Calculator / unit conversion in suggestions
- [x] Tracker stripping from links (utm_, fbclid, gclid…; Settings → Privacy)
- [x] Cookie banner auto-reject
- [x] Fingerprinting protection
- [x] Privacy stats on the new tab page (trackers blocked; Customize → Privacy stats)
- [x] Screenshot tool (visible area / full page / selection)
- [x] Read aloud
- [x] Translate page (privacy-friendly service)
- [x] Picture-in-picture toolbar button
- [x] Per-site autoplay exceptions
- [x] Energy saver on battery (idle tabs sleep after 10 minutes; Settings → Performance)
- [x] Accent color choice; compact mode
- [x] Customizable toolbar buttons (Settings icon + toggleable Split View, Screenshot, Translate, Read Aloud, Bookmarks, History, Downloads, Profile, Star, Shield, Home via right-click or Settings)
- [x] Tabbed Settings dashboard with card layout and list pagination
- [x] Keyboard shortcut customization
- [x] Install a site as an app (PWA windows)
- [x] Websites registering as handlers for link types (`navigator.registerProtocolHandler`)
- [x] Share a single tab when screen sharing
- [x] Client certificate selection
- [x] Workspaces / spaces
- [ ] Built-in AI features — moved to "Later" below (2026-10-11)
- [x] QR code for the current page
- [ ] Encrypted sync / send tab to another device — moved to "Later" below (2026-10-11)

## Later — after 1.0 (from the browser study, 2026-10-11)

Ideas from Rill, Mind Browser, Search, Zephium and Deta Surf, and the things we put off. How each
one works and how we'd build it: `research/browser-study-2026-10.md`. Rough order: the AI layer
first, because most of the rest sits on it.

**1. AI layer (the foundation)**
- [ ] Models: use the Claude Code and Codex apps already signed in on the Mac (your own plan, no API keys, like Rill); or your own API keys (Anthropic, OpenAI, Gemini, OpenRouter, kept in the keychain); or a local model (Ollama, LM Studio) so nothing leaves the Mac
- [ ] AI side panel beside the page (reuses split view): ask about this page, answers with links back to the source
- [ ] Safety rules for every AI feature: read-only until you allow edits; stop before paying, sending, posting or deleting; never type into password, card or code fields; show every page the AI opens and what it sends to the model; one switch turns all AI off

**2. Claude Code and Codex in the browser (Rill)**
- [ ] Find your projects from Claude Code and Codex history, no setup
- [ ] ⌘E from any page: ask about the page, or send it to a project as a task; the right project is picked automatically
- [ ] Tasks keep running while you browse: an "At work" tray, a notification when done, a "Today in your projects" list
- [ ] Agents browse in their own tabs without your logins; you can take over
- [ ] Compare up to six tabs in one table; AI tab groups; history you can search by describing a page; projects map; voice (hold a key and speak)

**3. Notes (Deta Surf, Mind, Zephium)**
- [ ] Notes beside the page, each a Markdown file you own (edits from other apps show up)
- [ ] Send highlighted text to a note with its source link
- [ ] Smart notes: @-mention tabs, notes and PDFs as context; AI writes in the note; citations jump to the exact spot (page section, PDF page, video time) in split view
- [ ] "/" menu (headings, lists, to-dos, code), suggested questions about the open page, web search inside a note
- [ ] Summarize a page or all open tabs into a note
- [ ] Small generated apps inside notes (Surf's "Surflets": a chart or demo from a sentence)

**4. Work mode and canvas (Zephium)**
- [ ] Browse / Work switch: the window flips between a normal browser and a work space, keeping personal browsing clean
- [ ] Work canvas: describe an outcome; helpers browse in parallel in live tabs you can watch; results (tables, charts, diagrams, plans) stay on the canvas; tabs, files and images can be placed on it
- [ ] Agents that reach past the browser: folders you grant, commands, MCP servers (Linear, Notion, Sentry…), hand coding jobs to Claude Code or Codex
- [ ] Skills: ready-made jobs (research, compare and choose, plan my day, trip planning) and your own
- [ ] Agent Mode roles from Mind: planner, navigator (drives tabs), researcher (with citations), writer, analyst

**5. Built-in tools (Zephium, Mind)**
- [ ] Tasks written the way you say them ("call Anna tomorrow at 3"), with the page you were on linked; a plan becomes tasks in one click
- [ ] Time: time per site (on this Mac only) and focus sessions that block chosen sites
- [ ] Launcher anywhere on the desktop (⌘⇧Space): tabs, history, notes, commands, new task
- [ ] Command palette in the browser (⌘K): tabs, bookmarks, settings, actions
- [ ] PDF editor: highlight, draw, type, sign
- [ ] New tab extras: daily wallpaper, weather, clock, notes; News and Finance pages (optional)

**6. Browsing ideas (Search, Mind)**
- [ ] Hide any element on a site, for good (⇧⌘H, then click it)
- [ ] Video that follows you: leaving a playing tab floats the video above other apps
- [ ] Swipe between spaces with two fingers
- [ ] Protection slider: Off / Standard / Strict (Strict adds HTTPS-only, referrer trimming, WebRTC leak blocking)
- [ ] Onion mode: a separate in-memory window over Tor, for .onion sites (clearly "not Tor Browser")
- [ ] Lighter and faster: sleep background tabs sooner, fewer processes, smaller download. (Search is 6 MB because it uses the Mac's own WebKit instead of carrying Chromium; matching that means a native WebKit edition, a rewrite — a decision, not a task)

**7. Put off earlier**
- [ ] Encrypted sync of bookmarks, history, settings, open tabs between your devices; send a tab to another device
- [ ] Mobile view: see a page as it looks on a phone (device sizes, touch)

**8. Website**
- [ ] A landing page in the spirit of Mind Browser's: hero with download buttons, a real browser screenshot, numbered feature cards, privacy, shortcuts, closing download section

## Blocked — needs a paid account or a provider

- [ ] Developer ID signing + notarization (removes "Open Anyway"; needs the $99/yr Apple Developer Program)
- [ ] Passkeys / Touch ID / security keys (needs Developer ID + entitlements)
- [ ] iCloud Passwords (needs Developer ID + Apple's web-browser entitlement)
- [ ] Netflix / Spotify / Disney+ (DRM: castLabs Electron build + Widevine signing). Mind Browser ships this way; castlabs' builds and EVS signing are free, so this may only need the switch and an EVS account (see `research/browser-study-2026-10.md`)
- [ ] Safe Browsing / phishing and malware warnings (Google Web Risk is paid)
- [ ] Opt-in crash reporting: built in (Settings → Privacy, off by default); waiting for the Sentry project's DSN in `SENTRY_DSN` (main.js)

## Parked until we go public

- [ ] Windows: installer, updates and Default-apps registration exist and pass CI, never used by a person; code signing
- [ ] Linux: AppImage/.deb exist and pass CI; Ubuntu 24.04 sandbox note, Flatpak/rpm, package repositories
- [ ] Intel Macs: x64 build exists, never run
- [ ] Other languages: Arabic (with right-to-left) exists in `locales/ar.json`; more languages
- [ ] Listings: Homebrew (own tap: ezzeldinzozz-svg/homebrew-operecs), winget, Microsoft Store — files ready in `packaging/` (see its README); publishing waits on the owner (own Homebrew tap repo, winget PR, Partner Center account). Official Homebrew needs notarization
- [x] Trademark check for the name (2026-10-10, `research/trademark-check.md`: no "Operecs" mark in USPTO or WIPO; closest is openECS, class 7/9)
- [x] Terms of use (`TERMS.md`, linked from `browser://licenses` and the README)

## Won't do

- Built-in password manager, password generator (password-manager extensions do this)
- Cast / AirPlay (no Chromecast support in Electron)

---

## Done

**Browsing:** tabs (pin, mute, drag to reorder, multi-select, drag out to a new window or into
another window, sleeping tabs), private windows, address bar with suggestions from history,
bookmarks, open tabs and (opt-in) the search engine, keyword search and custom engines, find in
page, zoom, reader mode, form resubmit warning, "Leave site?" on closing tabs, session restore,
reopen closed tabs, History menu with recently closed / visited.

**Bookmarks, history, downloads:** bookmarks bar and manager with folders, import from Chrome-family
browsers and HTML, export; history grouped by day with search, import from Chrome/Brave/Edge/Vivaldi/
Arc; downloads panel and page, insecure-download blocking, "download multiple files" prompt; export
all data.

**Privacy & security:** ad and tracker blocking with a details popup, third-party cookie blocking,
Global Privacy Control, HTTPS-Only, secure DNS, proxy settings, per-site permissions with defaults,
quiet notification prompts, cookies and site data manager, certificate viewer, lookalike-domain
(IDN) protection, sandboxed tabs, private `browser://` pages, locked-down Electron.

**Media & devices:** media button for playing tabs, camera/mic/screen indicators, screen sharing
picker, picture in picture, autoplay setting, device chooser (USB, HID, Serial, Bluetooth).

**Mac:** tabs in the title bar, Share menu, Handoff, Look Up / Speech / Emoji in the context menu,
notifications that open their tab.

**Extensions:** Chrome Web Store install, toolbar buttons, turn on/off, hide buttons, remove.

**Look & settings:** Operecs design (dark/light/system theme, private window frame, page card),
welcome page, settings with search, spellcheck with custom dictionary, website languages,
memory saver and task manager, error pages for offline / not found / certificate / proxy /
Wi-Fi sign-in.

**Updates:** free self-updates signed with our own key, update pill in the toolbar.
