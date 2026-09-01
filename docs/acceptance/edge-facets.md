---
type: product
---

# AT: エッジの `facets`（#2544）

- **日付**: 2026-08-31
- **関連 Issue**: [#2544](https://github.com/kompiro/karasu/issues/2544)（#2209 スライス B。スライス A は [#2543](https://github.com/kompiro/karasu/issues/2543)）
- **関連 ADR**: [ADR-2065](../adr/2065-tags-and-facets.md) / [ADR-2173](../adr/2173-facet-grammar-and-model.md) / [ADR-2174](../adr/2174-facet-overlay.md)（facet の register・文法・overlay）、[ADR-1096](../adr/1096-edge-id-selector.md)（エッジの canonical id は base 衝突で消えうる）
- **関連 spec**: [`docs/spec/syntax.md`](../spec/syntax.md) §Edge declaration › Property block・§Cross-cutting membership（+ja）/ [`docs/spec/style.md`](../spec/style.md) §Facet selectors（+ja）/ [`docs/spec/diagnostics.md`](../spec/diagnostics.md)（+ja）
- **関連 TPL**: [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)、[TPL-2174](../test-perspectives/TPL-2174-opt-in-visual-layer-is-inert-when-off.md)、[TPL-907](../test-perspectives/TPL-907-cross-reference-validation.md)、[TPL-2032](../test-perspectives/TPL-2032-reference-existence-validated-on-merged-space.md)、[TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)、[TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md)
- **対象ファイル**:
  - `packages/core/src/types/ast.ts`（`KrsEdge.facets` / `unionEdgeFacets`）
  - `packages/core/src/parser/parser.ts`（`parseEdgeBlock`）・`formatter/formatter.ts`（`renderEdge`）
  - `packages/core/src/resolver/warnings.ts`（`detectFacetsNotDeclared`）・`resolver/style-resolver.ts`（`edgeSelectorMatches`）
  - `packages/core/src/renderer/facet-overlay.ts`（`knownFacetIds` / `edgeFacetIds`）・`facet-overview.ts`・`edge-routing.ts`・`svg-renderer.ts`・`layout-edges.ts`
  - `packages/core/src/view/view-extract.ts`・`renderer/category-collapse.ts`・`renderer/group-collapse.ts`（和集合の導出）

> PII を運ぶデータフローや PCI スコープ内の呼び出しは**そのエッジについての事実**なのに、
> 所属を記録する唯一の手段が端点ノードへのタグ付けだった。除外は原理ではなく、エッジに
> プロパティを書く場所が無かったという構文上の都合で、スライス A がその場所を作った。

## 受け入れ条件

### AC-1: 受理とマージ規則がノードと同一

- [x] AT-A: `A -> B { facets pii, pci }` が受理され、`KrsEdge.facets` に載る。繰り返した `facets` 行は累積し、重複 id は畳まれる。ブロックを書かないエッジでは `undefined` のまま（空配列で実体化しない）

  > ✅ Automated — `packages/core/src/parser/edge-property-block.test.ts` › accepts facets on an edge ／ accumulates repeated facets lines and collapses duplicate ids ／ leaves facets undefined — not empty — when no block is written

- [x] AT-B: `facets` は block-only プロパティなので、`facets` しか持たないブロックは shorthand に畳まれずブロックのまま保たれる。出力は 1 行のカンマ区切りに正規化され、`karasu fmt` は round-trip し冪等である（TPL-1101）

  > ✅ Automated — `packages/core/src/formatter/edge-property-block-round-trip.test.ts` › keeps a facets-only block as a block ／ canonicalizes repeated facets lines to one comma list ／ round-trips and is idempotent for a block carrying every property

### AC-2: 未宣言参照が検出される（TPL-907 / TPL-2032）

- [x] AT-C: どのファイルにも宣言が無い facet をエッジに書くと `facet-not-declared` が出る。エッジには id が無いので、warning は canonical base 形（`A-->B` — `edge#<id>` が同じエッジを指すのと同じ綴り）で対象を名指し、loc は宣言ブロックではなくエッジ自身に着地する

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › warns for an undeclared facet written on an edge ／ lands the edge warning on the edge, not on the block that declares it

- [x] AT-D: 宣言が import 先のファイルにあるときは出ない。判定はマージ後のモデルで行う

  > ✅ Automated — `packages/core/src/fs/import-resolver.test.ts` › resolves an edge's facets against a declaration in an imported file ／ reports an edge's facets when no file in the merge declares them

### AC-3: overlay がエッジを対象にする（TPL-1503）

- [x] AT-E: `facets` を持つエッジは、その facet を選ぶと highlight される（`data-facet-member` と facet 色の casing が出る）。端点がどちらも非メンバーでも dim されない

  > ✅ Automated — `packages/core/src/renderer/facet-overlay.test.ts` › highlights an edge that carries the selected facet, whatever its endpoints hold

- [x] AT-F: 所属も member 端点も持たないエッジは従来どおり dim される

  > ✅ Automated — `packages/core/src/renderer/facet-overlay.test.ts` › dims an edge with no membership of its own and no member endpoint

- [x] AT-G: 複数所属では facet ごとに casing が 1 本ずつ出る（1:N を畳まない、TPL-2161）。並び順は宣言順ではなく既知 facet 順なので、同じ facet がどのエッジでも同じ位置に来る

  > ✅ Automated — `packages/core/src/renderer/facet-overlay.test.ts` › draws one casing per selected facet the edge belongs to (TPL-2161) ／ orders an edge's casings by known-facet order, not by declaration order

- [x] AT-G2: casing の色は diff モードでも facet の色のまま。diff の注入スタイルシートは `[data-diff-state] line / path` を塗り替えるので、presentation attribute で塗ると removed エッジの casing が赤い破線になり facet の同一性（「PII は teal」）が失われる

  > ✅ Automated — `packages/core/src/renderer/facet-overlay.test.ts` › paints the casing through style=, so the diff stylesheet cannot repaint it

- [x] AT-G3: compare モードで削除されたエッジも casing を保つ。所属は node 鍵の `facetIndex` ではなくエッジ実体に乗るので、removed node 用の backfill は通らないが、diff が描くのが before 側のエッジ実体そのものなので「何を運んでいたか」が読める

  > ✅ Automated — `packages/core/src/compile/facet-overlay-surfaces.test.ts` › keeps a removed edge's casing, so a deleted flow still shows what it carried

- [x] AT-H: エッジにしか書かれていない facet id も「モデルが知っている facet」に入る（色・セレクタ・概観パネルに現れないと選択自体ができない）

  > ✅ Automated — `packages/core/src/renderer/facet-overview.test.ts` › names a facet held only by an edge, with no node member anywhere

### AC-4: 派生エッジは和集合で導出する

- [x] AT-I: 構成エッジに facet を持つ集約 domain edge（`"N domain edges"`）が、service ビューでも highlight される。所属は構成エッジの和集合で、どの構成エッジも facet を持たなければ `undefined` のまま

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › unions the facets of the edges it aggregates (#2544) ／ leaves an aggregate's facets undefined when no constituent declares any (#2544)、`packages/core/src/renderer/facet-overlay.test.ts` › highlights an aggregated domain edge when a constituent carries the facet

- [x] AT-J: グループ / カテゴリを畳んだときの stub エッジも、`(from, to, kind)` で重複排除した分の所属を和集合で引き継ぐ（畳んだ node は光るのに畳んだエッジが暗い、という不整合を残さない）

  > ✅ Automated — `packages/core/src/renderer/group-collapse.test.ts` › unions the facets of the edges that fold onto one stub edge ／ leaves a stub edge's facets undefined when nothing it folds declares any、`packages/core/src/renderer/category-collapse.test.ts` › unions the facets of the re-targeted edges it de-dupes

- [x] AT-J2: 逆に散文（`description` / `link`）は畳まない。1 本の散文は 1 本のエッジを説明するので、集約と同じく stub エッジからは落とす

  > ✅ Automated — `packages/core/src/renderer/group-collapse.test.ts` › drops the prose of the edges it folds, the way an aggregate does

### AC-5: `[facets=<id>]` セレクタがエッジに届く

- [x] AT-K: `.krs.style` の `edge[facets=pii]` が該当エッジに適用され、非該当エッジには適用されない。述語を繰り返すと AND になる。どのエッジも宣言していない facet を指す場合は、全エッジへ widening せず何にも一致しない。種別なしの `[facets=pii]` はノード限定のまま（種別に `edge` を持たないセレクタはエッジに一致しない、という既存規則）

  > ✅ Automated — `packages/core/src/resolver/facet-style-selector.test.ts` › styles the edges that declare the facet, and only those ／ ANDs repeated predicates on an edge selector too ／ does not widen to every edge when no edge declares the facet

- [x] AT-K2: 判定に使うのは所属だけで、top-level の `facet` 宣言の有無は見ない。`facets ghost`（未宣言）を書いたエッジは `edge[facets=ghost]` に一致する — 未宣言 id は `facet-not-declared` が書かれた場所で 1 度報告するので、セレクタ側でも弾くと 1 つの間違いを 2 箇所で直させることになる（§Facet selectors の既存のトレード）

  > ✅ Automated — `packages/core/src/resolver/facet-style-selector.test.ts` › matches an edge whose facet has no top-level declaration

### AC-6: opt-in の不変条件を崩さない（TPL-2174）

- [x] AT-L: facet を 1 つも選ばなければ、`facets` 付きエッジを含むファイルの SVG は `facets` を書かない同じモデルと byte 一致し、overlay 由来の marker（`data-facet-member` / `data-facet-ring` / `data-facet-casing` / dim opacity）を 1 つも出さない

  > ✅ Automated — `packages/core/src/renderer/facet-overlay.test.ts` › renders a file with facets on an edge identically while nothing is selected

### AC-7: 受理形が spec と Reference に載る（TPL-2133 / TPL-2316）

- [x] AT-M: `docs/spec/` に埋めた `.krs` fence が現行文法で通る（エッジの `facets` を実演する fence を含む）

  > ✅ Automated — `scripts/lint/krs-fences.test.ts` › `analyzeKrsFencesIn` › `accepts a ```krs block the parser understands`

- [x] AT-N: `edge[facets=pii]` の specificity 行が `reference-data.ts` から生成され、`docs/spec/style.md` / `.ja.md` と drift しない

  > ✅ Automated — `packages/core/src/builtins/reference-data.test.ts` › `SELECTOR_SPECIFICITY` ／ `scripts/reference/gen-docs.ts`（`pnpm gen:reference` の再実行で差分ゼロ）

- [x] AT-O: エッジの `facets` を実演する `examples/en/feature-samples/tag-facet-registers.krs` と対の `.krs.style` が parse し、`examples.ts` の bundled content と byte 一致する

  > ✅ Automated — `packages/core/src/examples.test.ts` › `feature-samples: all files parse without errors` ／ `feature-samples: bundled examples.ts content matches examples/en/feature-samples/`

## 意図的に対象外

- **usecase→resource エッジの `facets`**: `resource` 行は既に `facets` を受理するが、所属先は resource ノードである。同じ 1 行が文脈で node の所属にもエッジの所属にもなるのは [TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md) が指す二重表現そのもの。別の綴りが要るが需要が実測されていない
- **エッジ向けの新しい `.krs.style` 装飾プロパティ**: 本スライスは既存の `[facets=<id>]` セレクタがエッジに届くようにするだけ

## 手動確認

N/A — 自動テストですべて覆っている。
