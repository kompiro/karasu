---
"karasu-vscode": patch
---

When the extension cannot find its language server, the "karasu Language Server" output channel now says so and lists every path it tried, instead of the server silently never answering (TPL-1024).
