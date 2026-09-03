# 🪐 Orbit Browser

> A sleek, high-performance, multi-tab desktop browser built on Chromium with Electron.

![Orbit Browser](assets/icon.svg)

---

## ✨ Features

- **Chromium Engine (`WebContentsView`)**: Isolated, hardware-accelerated Blink/V8 rendering for every tab with full HTML5, CSS3, JavaScript, WebGL, and video streaming compatibility.
- **Smart Omnibox**: Unified address bar and search engine with auto-protocol resolution (`https://`), domain detection, and 1-click bookmarking.
- **Multi-Tab Architecture**: Dynamic tab management with active tab highlights, loading spinners, site favicons, and title updates.
- **Bookmarks Bar & History**: Instant 1-click bookmarks bar and browsing history tracking with local JSON persistence.
- **New Tab Dashboard**: Sleek built-in start page with a real-time digital clock, search bar, and speed-dial shortcuts.
- **Windows Frameless UI**: Integrated custom titlebar with native Windows minimize, maximize/restore, and close controls.
- **Keyboard Shortcuts**:
  - `Ctrl + T`: New Tab
  - `Ctrl + W`: Close Tab
  - `Ctrl + R`: Reload Page
  - `Ctrl + L`: Focus Address Bar
  - `Alt + Left`: Back
  - `Alt + Right`: Forward
  - `F12`: Open Developer Tools

---

## 🛠️ Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- npm

### Installation & Running

```bash
# Clone the repository
git clone https://github.com/your-username/orbit-browser.git
cd orbit-browser

# Install dependencies
npm install

# Start Orbit Browser
npm start
```

### Packaging into Standalone Windows Executable (.exe)

```bash
# Build Windows Installer (NSIS Setup .exe) and Portable .exe
npm run build

# Build unpacked directory
npm run build:dir
```
The generated installers will be located in the `dist/` directory.

---

## 🌐 Landing Page

Orbit includes a modern product landing page located in [`landing-page/`](./landing-page/). You can open `landing-page/index.html` in any browser or host it for free on GitHub Pages, Vercel, or Cloudflare Pages.

---

## 🔒 Security Architecture

- **Context Isolation**: Renderer processes cannot directly access Node.js runtime APIs.
- **OS Sandboxing**: Web tabs execute within low-integrity sandboxes.
- **Navigation Guard**: Links requesting new windows (`target="_blank"`) are trapped and safely opened within internal Orbit tabs.
- **Local Storage**: Bookmarks and history are saved strictly to user data on your local drive.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
