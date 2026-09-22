---
"@karasu-tools/core": minor
"karasu": minor
"karasu-vscode": minor
---

Register the built-in icon set inside core, so `shape: url("<name>")` and icon display mode draw the icons on every surface — `karasu render` / `karasu diff` / `karasu serve`, the VS Code preview, and any embedder of `@karasu-tools/core` — not only in the browser app.

A `url()` that names no registered icon is now reported as a new `style-unknown-icon` warning at the declaration (app warning panel, VS Code Problems via the LSP, `karasu lint-style`, `karasu render`) instead of silently drawing a `box`. `karasu render` now prints the position of any warning that carries one, the way it already prints a diagnostic's.

Core gains `registerBuiltinIcons()` and `resetRegistryToBuiltins()` for embedders and tests that clear the shape registry (#2802).
