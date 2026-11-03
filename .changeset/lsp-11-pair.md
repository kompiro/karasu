---
"karasu-vscode": patch
---

The bundled language client and server move to `vscode-languageclient` / `vscode-languageserver` 11.0.0 together (LSP protocol 3.18.5 on both sides). This picks up upstream fixes for startup and shutdown races, for a server process that exits before connecting, and for line offsets when an incremental edit forms CRLF across edit boundaries.
