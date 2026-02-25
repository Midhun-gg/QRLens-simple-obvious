# QRLens 🔍

A lightweight Chrome/Edge extension that lets you scan and decode QR codes on any webpage — just click and drag.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![No Tracking](https://img.shields.io/badge/Privacy-No%20Data%20Collected-green)

## Features

- **Click & Drag** — Draw a selection box around any QR code on a webpage
- **Multi-pass Decoding** — 4-pass decode strategy handles small, blurry, and low-contrast QR codes
- **Result Menu** — Neobrutalism-styled popup shows the decoded content with **Copy** and **Open Link** buttons
- **Works Everywhere** — Compatible with all websites including Google, Bing, and Gmail
- **Privacy First** — All processing happens locally in your browser. No data is collected or transmitted
- **Security Hardened** — Blocks `javascript:`, `data:`, and other dangerous URL schemes

## Installation (Developer Mode)

### Chrome

1. Download or clone this repository
   ```
   git clone https://github.com/Midhun-gg/QRLens-simple-obvious.git
   ```
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `QRLens-simple-obvious` folder
6. The QRLens icon will appear in your extensions toolbar — pin it for easy access

### Microsoft Edge

1. Download or clone this repository
   ```
   git clone https://github.com/Midhun-gg/QRLens-simple-obvious.git
   ```
2. Open Edge and navigate to `edge://extensions`
3. Enable **Developer mode** (toggle in the left sidebar)
4. Click **Load unpacked**
5. Select the `QRLens-simple-obvious` folder
6. The QRLens icon will appear in your extensions toolbar

## How to Use

1. Navigate to any webpage containing a QR code
2. Click the **QRLens icon** in the toolbar
3. A dark overlay will appear with a crosshair cursor
4. **Click and drag** to draw a box around the QR code
5. A popup will appear with the decoded content:
   - 📋 **Copy** — Copies the decoded text to your clipboard
   - 🔗 **Open Link** — Opens the URL in a new tab (only for valid URLs)
6. Press **Escape** or click outside the popup to dismiss

## Tips for Best Results

- Draw the selection box **tightly** around the QR code for best accuracy
- If a QR code is very small, try **zooming in** on the page first (Ctrl + Plus)
- The extension handles high-DPI/Retina displays automatically

## Tech Stack

- **Manifest V3** — Modern Chrome extension architecture
- **jsQR** — In-browser QR code decoding library
- **Vanilla JS/CSS** — No frameworks, no build step

## Project Structure

```
QRLens-simple-obvious/
├── manifest.json       # Extension manifest (permissions, metadata)
├── background.js       # Service worker (injection, tab capture)
├── content.js          # Content script (overlay, selection, decoding)
├── styles.css          # All UI styles (overlay, menu, toasts)
├── lib/
│   └── jsQR.min.js     # QR decoding library (AMD-safe wrapped)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Permissions Explained

| Permission                     | Why it's needed                                          |
| ------------------------------ | -------------------------------------------------------- |
| `activeTab`                    | Access the current tab when you click the extension icon |
| `scripting`                    | Inject the content script and styles into the page       |
| `tabs`                         | Capture a screenshot of the visible tab for QR decoding  |
| `host_permissions: <all_urls>` | Ensures tab capture works reliably on all websites       |

## Privacy

QRLens does **not** collect, store, or transmit any user data. All QR code processing happens entirely within your browser. No analytics, tracking, or external requests are made.

## License

MIT
