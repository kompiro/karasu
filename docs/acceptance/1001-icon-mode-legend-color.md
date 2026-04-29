# AT: Icon mode preserves legend ref colors

- **日付**: 2026-04-29
- **関連 Issue**: [#1001](https://github.com/kompiro/karasu/issues/1001)
- **対象ファイル**: `packages/core/src/renderer/svg-builder.ts`
- **関連 AT**: [AT-0833](./0833-diagram-legend.md), [AT-0999](./0999-legend-in-use-fallback.md)

## 受け入れ条件

- [x] Icon mode（`displayMode: "icon"`）で `ref service` のような kind 系 ref が builtin の `background-color` をそのまま swatch として描画する
  > ✅ Automated — `packages/core/src/renderer/legend-footer.test.ts` › `preserves builtin kind colors in icon mode (Issue #1001)`

- [x] Icon mode で `ref [external]` のような tag 系 ref も builtin の `background-color` を維持する
  > ✅ Automated — `packages/core/src/renderer/legend-footer.test.ts` › `preserves builtin tag colors in icon mode for [external] (Issue #1001)`

- [x] Shape mode（既定）の挙動に regression が無いこと（既存の `resolves a ref [tag] through the builtin style sheet` 系テストが回帰なしで通過）
  > ✅ Automated — `packages/core/src/renderer/legend-footer.test.ts` 全 18 件が green

- [ ] Getting Started 例を Icon mode で開いたとき、凡例の swatch が shape mode と同じ色を保ったまま描画されること
  > 🧑 Manual — Preview URL（`https://fix-icon-mode-legend.karasu.pages.dev`）または `pnpm dev` で Icon mode に切り替えて、凡例ブロックの swatch 色が shape mode と一致することを確認する。

## 補足

- 本変更前は `resolveLegendRefColor` が「単一の最高 specificity rule を選び、その `background-color` を読む」方式だった。Icon mode では icon-theme の `service { shape: url(...) }` が同じ specificity の builtin `service { background-color: ... }` と並び、後勝ちで「best」になっていた。icon-theme rule に `background-color` が無いため `null` が返り、凡例は #999 fallback の neutral gray にフォールバックしていた。
- 本 PR は `mergeMatchingProperties`（resolver/style-resolver.ts）と同じ per-property cascade マージに揃えた。`shape` だけ持つ rule は `background-color` を上書きせず、builtin の色が残る。
- #999 のフォールバックは引き続き機能する（painting rule が一切無いケースのみ neutral gray にフォールバック）。
