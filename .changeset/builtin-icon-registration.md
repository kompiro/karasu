---
"@karasu-tools/core": patch
"karasu": patch
"karasu-vscode": patch
---

Register the built-in icon set inside core, so `shape: url("<name>")` and icon display mode draw the icons on every surface — `karasu render` / `karasu diff` / `karasu serve`, the VS Code preview, and any embedder of `@karasu-tools/core` — not only in the browser app. A `url()` that names no registered icon is now reported as a `style-unknown-icon` warning at the declaration (app warning panel, VS Code Problems via the LSP, `karasu lint-style`, `karasu render`) instead of silently drawing a `box` (#2802).
