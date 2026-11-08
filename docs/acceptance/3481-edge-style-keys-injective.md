---
type: product
---

# AT: `->` を含む端点の edge が、それぞれのスタイルと向きで描かれる（#3481）

- **日付**: 2026-11-08
- **関連 Issue**: [#3481](https://github.com/kompiro/karasu/issues/3481)（#3111 から分離。前提 [#3480](https://github.com/kompiro/karasu/issues/3480)）
- **Related TPLs**: [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)
- **対象ファイル**: `packages/core/src/resolver/style-resolver.ts`、`packages/core/src/renderer/layer-assignment.ts`、`packages/core/src/renderer/layer-layout-logics.ts`

> 解決済みスタイルの `styles.edges` は、edge を端点の素の連結（`${from}->${to}`）で引いていた。
> `a -> "b->c"` と `"a->b" -> c` は同じ `a->b->c` になり、後に書いた方のスタイルで 2 本とも描かれた。
> レイアウトも同じ連結で `direction` を引いていた。どちらも `edgeKey` / `edgeKindKey` に揃える。

## 受け入れ条件

### AC-1: 一方に書いた rule は、その edge だけの見た目を変える

- [x] AT-A: `"a->b" -> c` と `a -> "b->c"` が同じビューにあるとき、どちらの edge に `edge#<canonical id> { color: ... }` を書いても、色が付くのはその edge だけになる

  > ✅ Automated — `packages/core/src/index.test.ts` › `compile — edge#<canonical id> written the way the app writes it` › `gives endpoints containing -> their own id and a rule that names one of them`

- [x] AT-B: model の edge にない派生 edge でも、2 本はそれぞれのスタイルを持つ

  > ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `edgeStyleKey (#3481)` › `gives each of a derived pair its own resolved style`

### AC-2: 一方に書いた `direction` は、その edge だけの向きを変える

- [x] AT-C: 同じ 2 本で、どちらの edge に `direction: up` を書いても、上下が入れ替わるのはその edge の端点だけになる

  > ✅ Automated — `packages/core/src/index.test.ts` › `compile — edge#<canonical id> written the way the app writes it` › `turns only the edge a direction rule names when endpoints contain ->`

### AC-3: 普通のモデルのキーは変わらない

- [x] AT-D: 端点に `->`・`"`・`\` を含まない edge のキーは、今までと同じ `A->B` / `A->B#sync` のままで、`->` を含む端点の組は別々のキーになる

  > ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `edgeStyleKey (#3481)` › `keeps the plain join for ordinary endpoints`
  >
  > ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `edgeStyleKey (#3481)` › `keeps two edges apart when an endpoint contains ->`

## 手動確認

N/A — 自動テストですべて覆っている
