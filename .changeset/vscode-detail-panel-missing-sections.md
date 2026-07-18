---
"karasu-vscode": minor
---

The VS Code preview's node detail panel now also renders the Storage resources and Capabilities sections (for `client` nodes) and the Migration intent section (`@deprecated`/`@experimental`/`@migration_target`), matching the app's `NodeDetailPanel` layout and section order — previously the webview panel omitted all three entirely (#2068). The app-only `annotationDiff` section (used by the diff viewer) is intentionally not added: the VS Code extension has no diff-view surface to feed it.
