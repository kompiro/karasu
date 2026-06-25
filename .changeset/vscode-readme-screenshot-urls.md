---
"karasu-vscode": patch
---

Fix broken screenshot links in the VS Code Marketplace README. The README used relative image paths (`images/screenshots/…`), which `vsce` rewrote to repository-root URLs (`…/raw/HEAD/images/…`), ignoring the `packages/vscode` monorepo directory — so they 404'd on the Marketplace. Use absolute `raw.githubusercontent.com` URLs that resolve to `packages/vscode/images/…`.
