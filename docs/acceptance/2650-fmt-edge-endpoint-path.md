# AT-2650: `karasu fmt` は修飾された edge endpoint を著者の綴りのまま出す

- **日付**: 2026-09-07
- **Issue**: [#2650](https://github.com/kompiro/karasu/issues/2650)
- **関連 ADR**: [ADR-2088](../adr/2088-node-reference-path-notation.md)（記法は 1 つ・接尾辞規則） / [ADR-2547](../adr/2547-shared-node-path-machinery.md)（共有 parse ヘルパー）
- **Related TPLs**:
  - [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)（AST 等価は綴りの保存を意味しない）
  - [TPL-2088](../test-perspectives/TPL-2088-id-reference-notation-uniform-across-sites.md)（受理した記法は同じ形で書き戻せる）
- **対象**: `packages/core/src/types/ast.ts`（`KrsEdge.toPath`） / `packages/core/src/parser/parser.ts`（`parseEdge`） / `packages/core/src/formatter/formatter.ts`（`renderEdge`）

## 概要

`karasu fmt` は `-> Shop.Checkout.Payment` を `-> "Shop.Checkout.Payment"` に書き換えていた。
`KrsEdge.to` が join 済みの 1 本の文字列で、`quoteId` がその中のドットを bare にできない
文字として見るため、path 全体が 1 個の文字列リテラルになる。他の参照サイト（`resource` /
`table` / `realizes` / `owns` / `contains`）はセグメントを保持して
`path.map(quoteId).join(".")` で出しており、edge endpoint だけが例外だった。

parser が読んだセグメントを `KrsEdge.toPath` として `to` の隣に残し、formatter が
そちらを使う。`to` は join 済みのまま据え置くので、resolver / layout / view 抽出は
変更しない。

## 受け入れ条件

- [x] 深い修飾 path（`-> Shop.Checkout.Payment`）が bare のまま出力される
  > ✅ Automated — `packages/core/src/formatter/edge-endpoint-path-round-trip.test.ts` › `keeps a deep path bare, the way realizes / owns / contains do`

- [x] 2 セグメントの cross-system 形（`-> Shop.Checkout`）も bare のまま出力される
  > ✅ Automated — 同上 › `keeps the two-segment cross-system form bare`

- [x] property block 形（`-> Shop.Checkout.Payment { … }`）でも綴りが保たれる
  > ✅ Automated — 同上 › `keeps the path bare when the edge carries a property block`、および `edge-property-block-round-trip.test.ts` › `round-trips a deep qualified target that carries a block (#2645)`

- [x] 明示 source 形（`Web -> Shop.Checkout.Payment`）でも綴りが保たれる
  > ✅ Automated — 同上 › `keeps the path bare on an explicit source, not only the implicit one`

- [x] entity 関連（`entity` ブロック内の `-> Sales.Customers.Customer`）でも綴りが保たれる
  > ✅ Automated — 同上 › `keeps the path bare on an entity relation`

- [x] quote が要るセグメントだけが quote される（`-> Shop.Checkout."pay.core"`）
  > ✅ Automated — 同上 › `quotes only the segment that needs it, not the path around it`

- [x] ドットを含む 1 個の quoted id（`-> "b.c"`）は path に分解されず 1 個の文字列リテラルのまま
  > ✅ Automated — 同上 › `still quotes a single id that happens to contain a dot`

- [x] `toPath` は修飾形でのみ記録され、bare endpoint では undefined（既存 AST の形が変わらない）
  > ✅ Automated — 同上 › `records the segments it joined, so the two spellings cannot drift` / `leaves a bare endpoint without a path, so it renders exactly as before`

- [x] dangling dot（`-> B.`）の回復挙動が不変で、`toPath.join(".") === to` が成立する
  > ✅ Automated — 同上 › `keeps the dangling-dot recovery joining what it records`

- [x] 全ケースで AST round-trip（`parse(format(x)) ≡ parse(x)`）と idempotency（`format(format(x)) === format(x)`）が成立
  > ✅ Automated — 各ケースが `expectAstRoundTrip` / `expectIdempotent` を通る

## 範囲外

- **source 側の path**（`Portal.Web -> X`）: `isEdgeStart` が source の直後に arrow を要求
  するため、修飾された source はそもそも parse されない。`edge.from` は常に 1 トークンで
  `quoteId` の出力は正しく、`fromPath` を置く先が無い。source 側の修飾を受理するかは
  記法側の別 Issue。
- **`edgeEndpointRef` の quirk**: 解決側は `to.split(".")` のままで、`-> "b.c"` と
  `-> b.c` を区別しない（ADR-2088 slice E が「どのモデルも判定を変えない」ために意図して
  残した挙動）。`toPath` で区別可能になったが、判定を変える変更は別 Issue とする。
