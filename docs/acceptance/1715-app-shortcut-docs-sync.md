# AT: app keyboard-shortcut ↔ docs/tools coverage guard

- **日付**: 2026-06-23
- **関連 Issue**: [#1715](https://github.com/kompiro/karasu/issues/1715)
- **対象ファイル**: `scripts/lint/app-shortcut-docs-sync.ts`, `docs/tools/app.md`,
  `docs/tools/app.ja.md`, `docs/test-perspectives/TPL-20260623-01-user-facing-surface-docs-sync.md`

## 受け入れ条件

該当する観点は [TPL-20260623-01](../test-perspectives/TPL-20260623-01-user-facing-surface-docs-sync.md)（user-facing surface → docs/tools 反映）。

- [x] `mod+...` chord を `Ctrl/Cmd+...` 表示形に正規化する（`mod+shift+e` → `Ctrl/Cmd+Shift+E`）

  > ✅ Automated — `scripts/lint/app-shortcut-docs-sync.test.ts` › `chordToDisplay`

- [x] `keybinding:` / `keybinding=` 両宣言構文の chord を app source から収集する

  > ✅ Automated — `scripts/lint/app-shortcut-docs-sync.test.ts` › `collectChords`

- [x] app の全 keybinding（DOC_EXEMPT を除く）が en/ja 両 doc に記載されていることを検証する

  > ✅ Automated — `scripts/lint/app-shortcut-docs-sync.test.ts` › `documents every non-exempt app keybinding in both locales`

- [x] doc に未記載の chord、および片側 locale のみ記載の chord を drift として検出する

  > ✅ Automated — `scripts/lint/app-shortcut-docs-sync.test.ts` › `check (synthetic fixture)`（未記載 / 片側 locale / 両記載の 3 ケース）

- [x] DOC_EXEMPT の各エントリが理由付きである

  > ✅ Automated — `scripts/lint/app-shortcut-docs-sync.test.ts` › `keeps every DOC_EXEMPT entry justified with a reason`
