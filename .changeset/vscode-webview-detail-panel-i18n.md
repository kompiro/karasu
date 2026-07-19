---
"karasu-vscode": minor
---

The preview WebView's node detail panel now localizes its labels to VS Code's
display language, matching the app's detail panel. Section titles (Links,
Storage resources, Capabilities, Migration intent), the close button, and the
"Jump to editor" / "View in Deploy diagram" buttons are resolved from the
shared i18n catalog per `vscode.env.language` instead of being hardcoded
English. This also fixes two pre-existing parity glitches under English: the
Deploy-nav button previously showed Japanese text and "Jump to editor" was
missing its ↗ icon. (#2074)
