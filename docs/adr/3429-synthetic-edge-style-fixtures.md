---
id: ADR-3429
title: "合成エッジのスタイル解決テストは、本物の受け渡しと同じ `extraEdges` で渡し、`.krs` から SVG までの柵と組にする"
status: accepted
date: 2026-11-01
topic: testing
related_to: [ADR-2756, ADR-2677]
scope:
  packages:
    - core
assumptions:
  - "symbol: packages/core/src/view/resource-promotion.ts :: deriveUsecaseResourceNodes"
  - "symbol: packages/core/src/resolver/style-resolver.ts :: addMissingEdgeStyles"
  - "symbol: packages/core/src/resolver/style-resolver.ts :: edgeSelectorMatches"
  - "symbol: packages/core/src/resolver/style-resolver.test.ts :: accessEdge"
  - "file: packages/core/src/integration/read-write-edge-width.test.ts"
---

# ADR-3429: 合成エッジのスタイル解決テストは、本物の受け渡しと同じ `extraEdges` で渡し、`.krs` から SVG までの柵と組にする

- **日付**: 2026-11-01
- **ステータス**: 決定済み
- **関連**:
  - Issue #3429（起点。#3073 のローカルレビューで見つかった）、実装 PR #3474
  - [ADR-2756](2756-root-view-system-edge-ownership.md)（派生エッジは `childEdges` から `resolveStyles` の `extraEdges` で届く）
  - [ADR-2677](2677-language-v2-act.md)（`.krs language v2.0`。背景の入れ子の規則はここから来る）
  - 後続 Issue: #3493（`[implicit]` エッジの fixture を本 ADR に揃える）
  - TPL: [TPL-2756](../test-perspectives/TPL-2756-downstream-consumes-what-upstream-assembled.md)（柵は下流の出力に張る）
  - コード: `packages/core/src/resolver/style-resolver.test.ts`、`packages/core/src/integration/read-write-edge-width.test.ts`、`packages/core/src/view/resource-promotion.ts`、`packages/core/src/resolver/style-resolver.ts`

## 背景

`style-resolver.test.ts` の read / write エッジの `stroke-width` テストは、`system` ノードを手で組み、その直下に `usecase` と `resource` を置いていた。`.krs language v2.0` 以降、`canContain` はどちらも `system` 直下に置くことを許さない。パーサーなら `node-not-in-context` で落とす形である。テストはパーサーを通らないので通っていたが、karasu が受け付けない入力を正しい形のように見せていた。

Issue #3429 の Scope は「正しい入れ子（service や domain を端点にする）で組み直し、同じ assert を残す」だった。

調べると、問題は入れ子の形だけではなかった。read / write エッジは `.krs` に書かれない。domain のドリルダウンで `deriveUsecaseResourceNodes` が `operations` から導出する usecase→resource の合成エッジで、どのノードの `edges` にも入らない。抽出が `childEdges` に載せ、`resolveStyles` の第 6 引数 `extraEdges`（`addMissingEdgeStyles`）で届く。旧テストはそれをノードの `edges` に置いて `collectEdges` の経路で解決させており、本物が通らない経路を試していた。

## 決定

合成エッジのスタイル解決を単体で試すときは、ノードの木を組まず、エッジを本物と同じ `extraEdges` で `resolveStyles` に渡す。そのうえで、`.krs` から導出・スタイル解決・描画までを通して SVG の値を見る統合テストを同じ PR で組にする。

対象は抽出が導出してノードの `edges` に入らないエッジすべてで、read / write に限らない。#3474 で揃えたのは read / write だけで、同じファイルの `[implicit]` エッジ（`derived-edges.ts` が導出する）の fixture はまだ `system.edges` に置かれている。これは #3493 で揃える。

## 理由

- **エッジのスタイルはノードの木を読まない。** `edgeSelectorMatches` が見るのはエッジ自身（tags・kind・cyclic・facets・canonicalId・from / to）だけである。木に同じ端点のエッジがない限り、木を置いても結果は変わらない（同じ端点のエッジがあれば、`addMissingEdgeStyles` は `collectEdges` が先に書いた値を残す）。置けば「木が結果に効く」と読めてしまう
- **本物と同じ入口で渡せば、入口の取り違えが起きない。** `collectEdges` 経由で通るテストは、`extraEdges` の経路が壊れても通り続ける。`collectEdges` 自体は通常のエッジを使う別のテストが覆っている
- **単体テストだけでは導出と受け渡しが守られない。** 手組みのエッジは導出を通らないので、`operations` から read / write タグが付くこと、`childEdges` が `extraEdges` に渡ることは単体テストの外にある。TPL-2756 のとおり柵を下流の出力（SVG）に張り、`integration/read-write-edge-width.test.ts` がそれを受け持つ
- **統合テストは、ユーザーのシートが効いたことも見る。** `edge { stroke-width: 3px; }` を与えたとき、read / write が既定の幅のままであるだけでは、シートが落ちても同じ結果になる。同じモデルの通常の usecase→usecase エッジが 3 になることで、シートが適用されたうえで `edge[read]` / `edge[write]` が勝っていると分かる

## 却下した案

- **正しい入れ子で組み直し、エッジはノードの `edges` に置く（Issue #3429 の案）**: 入れ子の違反は消えるが、read / write エッジが本物では通らない `collectEdges` の経路を試し続ける。fixture が「受け付けられる形」になっても「本物の形」にはならない
- **正しい入れ子を組み、エッジは `extraEdges` で渡す**: 入口は本物と揃うが、結果に効かない木がテストに残る。読み手は木の形を変えれば結果が変わると受け取り、次にこのテストを直す人が木の保守まで背負う
- **統合テストだけにして単体テストを消す**: 失敗したときに、導出・受け渡し・カスケード・描画のどこで壊れたかが分からない。カスケードの優先（`edge` より `edge[write]` が勝つ）を最小の入力で縛る単体テストは残す
