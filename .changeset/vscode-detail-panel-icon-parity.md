---
"@karasu-tools/core": minor
"karasu": minor
"karasu-vscode": minor
---

Fixed the VS Code preview's node detail panel icon mapping to match the app's detail panel (#2068): a `usecase` node no longer shares `domain`'s 📦 icon, and `store` nodes now get a distinct icon (previously they had none, falling back to `■`). The kind→icon mapping is now a shared `NODE_DETAIL_KIND_ICON_NAMES` export from `@karasu-tools/core`, consumed by both the app (mapped to an SVG pictogram) and the VS Code webview (mapped to an emoji glyph), so the two renderers can no longer silently drift apart.
