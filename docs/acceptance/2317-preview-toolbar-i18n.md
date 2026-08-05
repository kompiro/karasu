# AT: プレビューツールバーの未翻訳コントロールを i18n 化する

- **日付**: 2026-08-04
- **関連 Issue**: [#2317](https://github.com/kompiro/karasu/issues/2317)（分割案 1 — 機械的な i18n 化。分割案 2 = レイアウト再設計は本 AT の対象外）
- **関連 spec**: [`docs/spec/i18n.md`](../spec/i18n.md)（新規 PR のチェックリスト）
- **関連 TPL**: [TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)（locale は全描画面横断スイッチ）、[TPL-1399](../test-perspectives/TPL-1399-control-a11y-contract-survives-migration.md)（toggle の a11y ラベル契約）、[TPL-1716](../test-perspectives/TPL-1716-user-facing-surface-docs-sync.md)（ツールバー面とドキュメントの同期）
- **対象ファイル**:
  - `packages/app/src/components/PreviewColumn.tsx`
  - `packages/i18n/src/{types,en,ja}.ts`

> #2317 は 5 件のコントロールを挙げているが、同じ toolbar 内に同種のハードコード
> が 2 件（org ビューの Tree View、エクスポートエラーの Dismiss）残っていたため、
> **toolbar 内のハードコード英文をゼロにする**ところまでを本 PR のスコープとした。
> `packages/vscode` の WebView ツールバー（`webview-content.ts` の `◇ Icon Mode`）は
> app とは別のサーフェスなので対象外。

## 受け入れ条件

- [x] AT-A: `ja` ロケールで system ビューのツールバーを描画したとき、可視ラベルにも `aria-label` にも英文が 1 つも出ない（条件付きコントロール — Facets / すべて畳む / エンティティ / 全レイヤー表示 / 全ビューを開く — をすべて出した状態で検証する）

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `PreviewColumn — toolbar carries no English hardcodes under locale=ja` › `system view with every conditional control present renders no English`。テストは先に日本語ラベルの存在を assert してから英文の不在を assert するので、「コントロールが出ていないから通った」偽陽性にならない

- [x] AT-B: `ja` ロケールで org ビューのツールバーを描画したとき、Tree View トグルが日本語で出る

  > ✅ Automated — 同 describe › `org view Tree View toggle renders no English`

- [x] AT-C: `en` ロケールでの可視ラベルと `aria-label` が i18n 化の前後で一致する（既存の E2E / unit が `getByRole("button", { name: "Toggle icon mode" })` 等で aria-label を名前解決に使っているため、en の文字列を変えると壊れる）

  > ✅ Automated — 既存の `PreviewColumn.test.tsx`（74 ケース）と `packages/e2e/tests/` の `at-0033` / `at-0040` / `at-0043` / `at-0044` / `at-0048` / `at-1479` / `at-1513` / `at-1666` / `at-1907` が無改変で通ることが、この一致の検証そのものになっている

- [x] AT-D: 新しい key が `<feature>.<sub-feature?>.<element>.<state>`（最大 4 段）に従う

  > ✅ Automated — `scripts/` の vitest（TPL-2019 の key naming チェック）

- [ ] AT-E: 🧑 Manual — <https://karasu.kompiro.dev/> を `ja` で開き、プレビューのツールバーが**1 行の中で英日が混ざっていない**ことを目で確認する（#2317 が報告した「半分だけ翻訳されている」状態の解消）

  > Settings の言語セレクタで日本語を選ぶ。`facet` を宣言したモデルを開いて Facets を、`organization` ブロックを持つモデルで グループ化 / すべて畳む を、Org タブで ツリー表示 を、それぞれ出した状態で確認する

- [ ] AT-F: 🧑 Manual — `ja` でラベルが長くなったことによる**折り返しの悪化**が許容範囲か確認する（「全レイヤー表示」「全ビューを開く」は en より横幅を食う）。#2317 の分割案 2（レイアウト再設計）の入力にする

- [ ] AT-G: 🧑 Manual — `en` に戻したとき、すべてのラベルが従来どおりであること

## 補足 — 自動化しなかったもの

**ツールバーの折り返し具合**（AT-F）は自動化していない。行数はビューポート幅・
フォント・ロケールの積で決まり、jsdom にはレイアウトが無いので機械では測れない。
#2317 の 2 番目の論点（コントロール数そのもの）は本 PR では扱わず、AT-F の実測を
その判断材料として残す。
