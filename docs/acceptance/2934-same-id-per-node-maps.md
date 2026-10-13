---
type: product
---

# AT: 同名ノードの per-node Map は path をキーにし、bare id の見え方は勝者規則 1 つで決める（#2934）

- **日付**: 2026-10-12
- **関連 Issue**: [#2934](https://github.com/kompiro/karasu/issues/2934)（隣接: [#3126](https://github.com/kompiro/karasu/issues/3126)）
- **設計 (ADR)**: [ADR-2934](../adr/2934-same-id-per-node-maps.md)
- **Related TPLs**: [TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md)（1:1 の値は全 Map で同じ勝者規則。AC-3・AC-4）、[TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)（区別に要る次元を key に含める。AC-1・AC-2・AC-5・AC-6）、[TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)（facet の所属を捨てない。AC-2）、[TPL-2920](../test-perspectives/TPL-2920-duplicate-element-id-on-one-canvas-names-its-landing.md)（同じ canvas の重複要素 id は着地を名指す。AC-5）
- **対象ファイル**:
  - `packages/core/src/parser/reference-validation.ts`（`buildNodePathIndex` の `ranking`、`buildFacetIndexByPath`）
  - `packages/core/src/parser/node-path.ts`（`bareIdView`）
  - `packages/core/src/compile/compile.ts`（`buildNodeMetadata`）
  - `packages/core/src/fs/import-resolver.ts`（`nodeFileIndexByPath`）
  - `packages/core/src/resolver/style-resolver.ts`（`nodesByPath` / `layoutHintsByPath` / `paintedColorsByPath`）
  - `packages/core/src/renderer/svg-renderer.ts` / `layout.ts` / `facet-overlay.ts`（カードと枠を path で引く）
  - `packages/core/src/diff/view-diff.ts` / `packages/core/src/compile/compile-diff.ts`（`nodeDiffByPath`）
  - `packages/core/src/exporter/drawio/drawio-exporter.ts` / `build-drawio-project.ts`（ルートページの cell id）

> 2 つの system が同じ bare id のノード（`Shop.Api` と `Admin.Api`）を持つとき、compile / render の途中の per-node Map は bare id をキーにしていて、Map ごとに後勝ち・先勝ち・和集合と別の規則で片方を選んでいた。各 Map を path キーにし、カードと枠は自分の path で引く。bare id でしか引けない消費側には、`nodePathIndex` と同じ順位（`@migration_target` 優先、同点は traversal 順）でその Map が持つ最上位のノードを返す。

モデル（設計の実測モデル）:

```krs
facet pii { label "PII" }
system Shop {
  service Api [external] @migration_target {
    description "Shop's Api"
    facets pii
  }
  service Worker {}
  Api -> Worker "queues"
}
system Admin {
  service Api {
    description "Admin's Api"
  }
  service Jobs {}
  Api -> Jobs "runs"
}
```

## 受け入れ条件

### AC-1: カードは自分の style で描かれる

- [x] AT-A: `service[external] { background-color: #ff0000; }` のとき、ルートビューで `Shop.Api` のカードだけが赤く、`Admin.Api` は赤くない。system の宣言順を入れ替えても同じ

  > ✅ Automated — `packages/core/src/renderer/multi-system-same-id.test.ts` › per-node maps are keyed by path; bare ids answer with the winner (#2934) › styles only the tagged Shop.Api card (%s)

- [x] AT-B: `column` hint は各ノードの path に載り、hint を持たないノードは空の entry を持つ（同名ノードの hint を借りない）。bare の entry は勝者のもの

  > ✅ Automated — `packages/core/src/renderer/multi-system-same-id.test.ts` › per-node maps are keyed by path; bare ids answer with the winner (#2934) › keeps each node's own column hint, and the winner's under the bare id (%s)

- [x] AT-C: service と同じ id の system の枠は、その service の style ではなく自分の style で描かれる

  > ✅ Automated — `packages/core/src/renderer/container-frame-theme-defaults.test.ts` › a re-stored id carries its own provenance (#2662) › draws the %s theme's chrome on a container whose id was also a painted service

### AC-2: facet リングは宣言したノードにだけ付く

- [x] AT-D: `pii` を選ぶと `Shop.Api` のカードだけが `data-facet-member="pii"` を持つ。system の宣言順を入れ替えても同じ

  > ✅ Automated — `packages/core/src/renderer/multi-system-same-id.test.ts` › per-node maps are keyed by path; bare ids answer with the winner (#2934) › rings only the Shop.Api card for its facet (%s)

- [x] AT-E: compare モードで削除されたノードは、自分が宣言していた facet のリングを保つ

  > ✅ Automated — `packages/core/src/compile/facet-overlay-surfaces.test.ts` › facet overlay in compare mode › keeps a removed node's ring, so "what used to carry this" stays visible

### AC-3: bare id の metadata は勝者 1 ノードを表す

- [x] AT-F: `nodeMetadata.get("Api")` の description と `viewPath` が同じノード（勝者 `Shop`）のもの。宣言順を入れ替えても同じ

  > ✅ Automated — `packages/core/src/renderer/multi-system-same-id.test.ts` › per-node maps are keyed by path; bare ids answer with the winner (#2934) › describes the winner in one bare metadata record (%s)

- [x] AT-G: priority が同点なら traversal 順で最初の system が勝つ

  > ✅ Automated — `packages/core/src/renderer/multi-system-same-id.test.ts` › per-node maps are keyed by path; bare ids answer with the winner (#2934) › falls to traversal order on a priority tie, so the first system wins

- [x] AT-H: 勝者がその Map に居ない（ルートに無い domain が勝者）とき、bare の entry は順位の次点で決まり、Map の組み立て順では決まらない

  > ✅ Automated — `packages/core/src/renderer/multi-system-same-id.test.ts` › per-node maps are keyed by path; bare ids answer with the winner (#2934) › answers with the next ranked path when the winner is not on the canvas ／ `packages/core/src/parser/node-path.test.ts` › bareIdView (#2934) › does not depend on the order the map was filled in

### AC-4: bare id の定義ファイルは勝者のファイル

- [x] AT-I: `Shop` と `Admin` を別ファイルに置くと、`nodeFileIndexByPath` は各ノードのファイルを持ち、`nodeFileIndex.get("Api")` は import 順によらず勝者 `Shop` のファイル

  > ✅ Automated — `packages/core/src/renderer/multi-system-same-id.test.ts` › per-node maps are keyed by path; bare ids answer with the winner (#2934) › keeps each node's own file, and the winner's under the bare id (%s)

### AC-5: draw.io のルートページで各 `Api` が自分の cell を持つ

- [x] AT-J: system ページの cell id が一意で、`queues` は `Shop` の `Api` cell から、`runs` は `Admin` の `Api` cell から出る

  > ✅ Automated — `packages/core/src/renderer/multi-system-same-id.test.ts` › per-node maps are keyed by path; bare ids answer with the winner (#2934) › gives each system's Api its own draw.io cell, with its own system's edge

- [ ] AT-K: 上のモデルを draw.io 形式で出力して draw.io で開くと、`Shop` と `Admin` の枠にそれぞれ `Api` が 1 つずつあり、各 `Api` から自分の system の edge が出ている

  > 🧑 Manual — 上のモデルを `index.krs` に保存し、公開版の CLI で `npx karasu render index.krs --format drawio --view system --output system.drawio` を実行して、`system.drawio` を draw.io（https://app.diagrams.net/）で開く

### AC-6: compare モードでカードは自分の diff 状態だけを持つ

- [x] AT-L: before / after で `Admin.Api` の description だけを変えたとき、ルートの `Shop.Api` は `unchanged` のまま、`Admin.Api` は `Shop.Api` の状態を借りない（ルートで `systems[0]` 以外の子に状態が付かない件は #3126）

  > ✅ Automated — `packages/core/src/renderer/multi-system-same-id.test.ts` › per-node maps are keyed by path; bare ids answer with the winner (#2934) › does not let Admin.Api borrow Shop.Api's diff state, nor move Shop.Api's

### AC-7: 同名 id を持たないモデルの出力は変わらない

- [x] AT-M: 同名 id を持たないモデルの SVG・metadata は既存の fence のまま。draw.io は multi-system ルートページの cell id だけが path 形（`system-Shop_Api`）に変わる

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › multi-system root view routes its edges (#2363) › keeps every system's routes inside its own strip, on either side (#2610) ／ `packages/core/src/renderer/layout.test.ts` › layout > multi-system root view › lays out all systems side by side

## 手動確認

- AT-K: draw.io が出力の cell と親子・edge の端点をどう読むかは draw.io でしか判定できない（自動テストは XML の cell id と `source` / `target` までを見る）。
