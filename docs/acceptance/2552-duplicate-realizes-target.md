---
type: product
---

# AT: 同じ対象を二度 realize しても関係は 1 つ（#2552）

- **日付**: 2026-09-04
- **関連 Issue**: [#2552](https://github.com/kompiro/karasu/issues/2552)
- **Related TPLs**: [TPL-2552](../test-perspectives/TPL-2552-repeated-relation-is-idempotent-across-counting-and-keyed-consumers.md)（件数を数える消費側と id で畳む消費側を一致させる）／ [TPL-2542](../test-perspectives/TPL-2542-sugar-form-shares-one-ast-and-element-ranges.md)（sugar の両形は同一 AST）
- **対象ファイル**:
  - `packages/core/src/parser/parser.ts`（`parseRealizesList`）
  - `packages/core/src/view/deploy-view-extract.ts`（`extractDeployView` の container membership）
  - `docs/spec/syntax.md` / `syntax.ja.md`（§ Writing physical diagrams — `realizes` の複数指定）

> `realizes OrderService` を 2 度書いたデプロイ単位は、コンテナのグリッドが 2 セルを確保する一方で `layoutNodes` が `${containerId}::${unitId}` キーで後勝ちに畳むため、ユニット 1 つ分だけ高いコンテナに空のセルが残っていた。同じ相手の再掲は 1 つの関係の宣言なので、記録する側（parser）と解決する側（deploy ビュー）の両方で冪等にする。診断は出さない — `facets` / 同一 team の `owns` / 同一 boundary の `contains` / `delivers` はいずれも黙って冪等で、`realizes` だけが報告すると非対称になる。

## 受け入れ条件

### AC-1: 同じ対象の再掲はモデルに 1 件だけ残る

- [x] AT-A: `realizes OrderService` を 2 行書いたデプロイ単位の `properties.realizes` が 1 件で、診断は出ない

  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › repeated realizes target (#2552) › records a target repeated on separate lines once

- [x] AT-B: `realizes OrderService, OrderService` も同じ 1 件になる（2 つの綴りが区別できない — ADR-2167 の sugar 等価性）

  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › repeated realizes target (#2552) › records a target repeated within one comma list once

- [x] AT-C: 残るのは最初の綴りで、その range を保つ

  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › repeated realizes target (#2552) › keeps the range of the first spelling

- [x] AT-D: 落とすのは重複だけで、異なる対象は記述順のまま残る

  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › repeated realizes target (#2552) › drops only the repeat, keeping distinct targets in document order

### AC-2: 解決先が同じでも綴りが違う 2 参照はモデルに残る

- [x] AT-E: `realizes OrderService` と `realizes EC.OrderService` は 2 件のまま。それぞれが `unresolved-realizes` / `realizes-target-ambiguous` の range を負うため、parser では畳めない

  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › repeated realizes target (#2552) › holds a qualified ref distinct from the bare one it may resolve to

### AC-3: 1 つのユニットが 1 つのコンテナに入るのは 1 回

- [x] AT-F: 行の繰り返し・カンマ列挙・bare と qualified の 2 参照、いずれの綴りでもコンテナの `units` は 1 件

  > ✅ Automated — `packages/core/src/view/deploy-view-extract.test.ts` › a unit joins one container once (#2552) › places the unit once when the target is repeated on separate lines ／ … within one comma list ／ … when a bare and a qualified ref resolve to it

- [x] AT-G: 複数の対象を realize するユニットは、これまでどおりそれぞれのコンテナに 1 つずつ置かれる

  > ✅ Automated — `packages/core/src/view/deploy-view-extract.test.ts` › a unit joins one container once (#2552) › still places one unit in each of the containers it realizes

### AC-4: 幽霊スロットが残らない

- [x] AT-H: 3 つの綴りすべてで、レイアウトの寸法（コンテナ高さ・全体高さ）と配置ノード数が単一対象のモデルと一致する

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › a target realized twice reserves no empty cell (#2552) › is laid out exactly like a single target when repeated on separate lines ／ … within one comma list ／ … reached by a bare and a qualified ref

### AC-5: 正準形は 1 行

- [x] AT-I: `karasu fmt` が重複を 1 行に畳み、2 つの綴りが単一対象のモデルと同じ出力に収束する（冪等・AST round-trip 込み）

  > ✅ Automated — `packages/core/src/formatter/formatter.test.ts` › collapses a target named twice to a single realizes line

## 手動確認

N/A — 自動テストですべて覆っている。判定は AST の件数とレイアウトの寸法で、どちらも実機を要しない。

## 参考: 対象のモデル

```krs
system EC {
  service OrderService {}
}

deploy Production {
  oci app {
    runtime "Kubernetes"
    realizes OrderService
    realizes OrderService
  }
}
```
