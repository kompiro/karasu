---
id: "0051"
title: Brand Icons (favicon, logo, VS Code extension icon)
type: manual
issue: 434
---

# AT-0051: Brand Icons

## Purpose

Verify that the karasu brand assets (favicon, app logo, VS Code extension icon) are in place and display correctly.

## Checklist

### Favicon

- [ ] Open the karasu app in a browser
- [ ] The browser tab shows the `鴉` kanji icon (dark background, light text)
- [ ] The icon is legible at small sizes (16×16 equivalent in browser tab)

> manual / visual review — favicon legibility at browser-tab scale is a subjective design check.

### App Logo

- [ ] `packages/app/public/logo.svg` exists
- [ ] Opening the SVG directly renders the `鴉` kanji with karasu branding (dark bg, accent lines, "karasu" wordmark)
- [ ] The design is cohesive with the favicon

> manual / visual review — logo branding (dark bg, accent lines, wordmark cohesion) is a subjective design check.

### VS Code Extension Icon

- [ ] `packages/vscode/icon.svg` exists
- [ ] `packages/vscode/package.json` has `"icon": "icon.svg"`
- [ ] The icon renders the `鴉` kanji in a professional square format consistent with VS Code Marketplace conventions
- [ ] The design is cohesive with the favicon and logo

> manual / visual review — VS Code extension icon visual fit (square format, Marketplace consistency, brand cohesion) is judged by eye.
