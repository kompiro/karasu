# karasu-vscode

## 0.1.3

### Patch Changes

- 7b8ca40: Fix broken screenshot links in the VS Code Marketplace README. The README used relative image paths (`images/screenshots/…`), which `vsce` rewrote to repository-root URLs (`…/raw/HEAD/images/…`), ignoring the `packages/vscode` monorepo directory — so they 404'd on the Marketplace. Use absolute `raw.githubusercontent.com` URLs that resolve to `packages/vscode/images/…`.

## 0.1.2

### Patch Changes

- Updated dependencies:
  - @karasu-tools/core@0.2.0
