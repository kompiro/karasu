---
"karasu-vscode": patch
---

When a file the extension loads from its own folder is missing (the language server, or the preview bundle that used to leave a blank preview), the extension now logs every path it tried, in the extension host log and the "karasu Language Server" output channel.
