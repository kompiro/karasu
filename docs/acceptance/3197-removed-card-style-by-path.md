---
type: product
---

# AT: compare モードで削除されたカードが、自分のスタイルで描かれる（#3197）

- **日付**: 2026-10-17
- **関連 Issue**: [#3197](https://github.com/kompiro/karasu/issues/3197)
- **Related TPLs**: [TPL-3197](../test-perspectives/TPL-3197-removed-card-reads-every-per-node-value-from-before-by-path.md), [TPL-3126](../test-perspectives/TPL-3126-compare-pairs-revisions-by-identity-not-position.md)
- **対象ファイル**: `packages/core/src/compile/compile-diff.ts`（`compileSystemDiff`）

> compare モードは after の model だけからスタイルを解決していたため、削除されたカードは bare id で引かれ、別の system の枠にある同名のカードのスタイルで描かれた。before の model も同じシートで解決し、削除されたカードの path にそのスタイルを補う。

## 受け入れ条件

### AC-1: 削除されたカードは、自分が持っていたスタイルで描かれる

- [x] AT-A: `Shop.Mail`（無地）と `Admin.Mail [external]`（`service[external]` で赤）のうち `Admin.Mail` を削除すると、ルートの compare で削除された `Admin.Mail` は赤で、`Shop.Mail` は無地で描かれる

  > ✅ Automated — `packages/core/src/renderer/removed-card-style-by-path.test.ts` › `a removed card keeps its own style in compare mode (#3197)` › `draws the removed card with the style it had, not a same-named card's`

- [x] AT-B: 逆に無地の `Shop.Mail` を削除すると、削除された `Shop.Mail` は無地のまま描かれ、生き残った `Admin.Mail` の赤を受け取らない

  > ✅ Automated — `packages/core/src/renderer/removed-card-style-by-path.test.ts` › `a removed card keeps its own style in compare mode (#3197)` › `does not paint a removed card with a same-named card's style either way round`

## 手動確認

N/A — 自動テストですべて覆っている
