---
type: product
---

# AT-1333: Reference single source — Phase 1 (`reference-data.ts` adapter refactor)

- **日付**: 2026-05-11
- **関連 Issue**: [#1333](https://github.com/kompiro/karasu/issues/1333)（親 [#1328](https://github.com/kompiro/karasu/issues/1328) / [#1296](https://github.com/kompiro/karasu/issues/1296)）
- **対象ファイル**:
  - `packages/core/src/builtins/reference-data.ts`（新規 — single source of truth）
  - `packages/core/src/builtins/reference.ts`（`getReference()` を adapter 化）
  - `packages/core/src/builtins/reference-data.test.ts`（新規）
- **設計**: [docs/design/reference-from-spec.md](../design/reference-from-spec.md)
- **TPL**: [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)（i18n 片落ちの失敗モードを構造的に潰す）

## 受け入れ条件

- [ ] AT-A: `getReference("en")` / `getReference("ja")` の出力が Phase 1 前と等価（公開型 `KarasuReference` と各 entry の内容が不変）
  > ✅ Automated — `packages/core/src/builtins/reference.test.ts`（node kinds の一覧・各種 properties・tags・sampleKrs 等を従来どおり assert）/ `packages/core/src/builtins/reference-spec-sync.test.ts`（spec doc ↔ `getReference()` の片方向 subset チェックが従来どおり green）

- [ ] AT-B: `REFERENCE_DATA` の全エントリ（nodeKinds / deployUnitKinds / orgKinds / tags / annotations / styleProperties / shapes、および annotation の defaultBadge.label）が `en` / `ja` 両方の非空文字列を持つ
  > ✅ Automated — `packages/core/src/builtins/reference-data.test.ts` › `every entry has a non-empty en + ja description` ほか

- [ ] AT-C: `getReference(locale)` が `en` / `ja` の両 locale で `undefined` の description を返さない（i18n 片落ち回帰リハーサル）
  > ✅ Automated — `reference-data.test.ts`（ソース側の両 locale 存在を担保）+ `packages/app/src/i18n/locale-coverage.test.tsx`（パネル表示側の locale カバレッジ）

- [ ] AT-D（manual）: アプリ（`pnpm dev`）で `index.krs` を開き、Reference パネルの Syntax / Styles / Tags & Annotations / Built-in Theme / Samples の各タブが Phase 1 前と同じ内容で表示されることを目視確認する。locale を `ja` に切り替え、各 description が日本語で表示され空欄や `undefined` が出ないことも確認する
  > 🧑 Manual — リファクタ前後で UI 表示が不変であることの目視確認。自動テストは `getReference()` の構造一致を担保するが、パネル上での実際の見え方は目視で確認する
