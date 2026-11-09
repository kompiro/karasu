---
type: product
---

# AT: `#` を含む端点の edge が、それぞれのスタイルと向きで描かれる（#3702）

- **日付**: 2026-11-09
- **関連 Issue**: [#3702](https://github.com/kompiro/karasu/issues/3702)（#3481 から分離）
- **Related TPLs**: [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)
- **対象ファイル**: `packages/core/src/view/edge-key.ts`
- **設計 (ADR)**: [ADR-3702](../adr/3702-edge-style-kind-key-disjoint.md)

> 解決済みスタイルの `styles.edges` には、kind 付きのキー（`edgeKindKey`、`x->y#sync`）と
> kind 無しのキー（`edgeKey`）が同居している。`edgeKey` は `#` を含む端点を囲んでいなかったので、
> `x -> "y#sync"` の kind 無しキーが `x -> y` の sync キーと同じ `x->y#sync` になった。
> 宣言の順によって、色の rule が 2 本とも塗るかどちらにも効かず、`direction` も 2 本とも
> 入れ替えるかどちらも入れ替えなかった。`edgeKey` が `#` を含む端点も囲むようにする。

## 受け入れ条件

### AC-1: 一方に書いた色の rule は、その edge だけを塗る

- [x] AT-A: `x -> y` と `x -> "y#sync"` が同じビューにあるとき、どちらの宣言順でも、どちらの edge に `edge#<canonical id> { color: ... }` を書いても、色が付くのはその edge だけになる

  > ✅ Automated — `packages/core/src/index.test.ts` › `compile — edge#<canonical id> written the way the app writes it` › `colors only $id when an endpoint ends in #sync ($order)`

### AC-2: 一方に書いた `direction` は、その edge だけの向きを変える

- [x] AT-B: 同じ 2 本で、どちらの宣言順でも、どちらの edge に `direction: up` を書いても、上下が入れ替わるのはその edge の端点だけになる

  > ✅ Automated — `packages/core/src/index.test.ts` › `compile — edge#<canonical id> written the way the app writes it` › `turns only $id up when an endpoint ends in #sync ($order)`

### AC-3: kind 無しのキーと kind 付きのキーが重ならない

- [x] AT-C: `#` を含む端点の kind 無しキーは引用符で囲まれ、`#sync` / `#async` で終わる端点の kind 無しキーも kind 付きキーも、別の edge の kind 付きキーと同じ文字列にならない

  > ✅ Automated — `packages/core/src/view/edge-key.test.ts` › `edgeKindKey (#3111)` › `never gives a kind-less key the form of a kind key (#3702)`
  >
  > ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `edgeStyleKey (#3481)` › `keeps kind-less keys apart from kind keys when an endpoint contains # (#3702)`

### AC-4: 普通のモデルのキーは変わらない

- [x] AT-D: 端点に `->`・`"`・`\`・`#` を含まない edge のキーは、今までと同じ `A->B` / `A->B#sync` のままになる

  > ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `edgeStyleKey (#3481)` › `keeps the plain join for ordinary endpoints`
  >
  > ✅ Automated — `packages/core/src/view/edge-key.test.ts` › `edgeKindKey (#3111)` › `keeps the `${from}->${to}#${kind}` form for an ordinary edge`

## 手動確認

N/A — 自動テストですべて覆っている
