---
"@karasu-tools/core": minor
"karasu": minor
"karasu-vscode": minor
---

Export a `NODE_DETAIL_KIND_ICON_NAMES` kind→icon-name map from `@karasu-tools/core`, the single source of truth for the node detail panel's header pictogram (each surface maps the icon name to its own form — an SVG pictogram in the app, an emoji glyph in the VS Code webview). This resolves the panel's kind→icon divergence in the VS Code preview (#2068): a `usecase` node no longer shares `domain`'s icon, and `store` nodes now get a distinct icon instead of the generic `■` fallback. The two renderers can no longer silently drift because they consume the same exported map.
