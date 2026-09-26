---
id: ADR-2756
title: root view の各 system フレームは自分の子から導出したエッジ集合を持つ
status: accepted
date: 2026-09-26
topic: renderer
related_to: [ADR-2521, ADR-2223, ADR-681, ADR-1884, ADR-463, ADR-1314]
scope:
  packages:
    - core
assumptions:
  - "symbol: packages/core/src/view/view-extract.ts :: deriveCanvasEdges"
  - "symbol: packages/core/src/view/view-extract.ts :: SystemFrameEdges"
  - "symbol: packages/core/src/diff/view-diff.ts :: diffSystemFrames"
  - "grep: packages/core/src/renderer/svg-renderer.ts :: edgeLayout\\.diffState"
---

# ADR-2756: root view の各 system フレームは自分の子から導出したエッジ集合を持つ

- **日付**: 2026-09-26
- **ステータス**: 決定済み
- **関連**:
  - Issue #2756（起点）、#2646 / PR #2741 のレビューで発見
  - 実装 PR: #2891（本体）、#2892（TPL の帰属修正）
  - 設計（本 ADR に集約し削除）: `docs/design/root-view-system-edge-ownership.md`
  - [ADR-2521](2521-multi-system-pipeline-convergence.md)（multi は single の計算に合わせる）、[ADR-2223](2223-service-anchored-edge-renders-on-parent-canvas.md)（同じ罠を「実装上の落とし穴」として記録済み）、[ADR-681](681-top-level-service-rendering.md)（`__unassigned__` 擬似 system）、[ADR-1884](1884-group-by-team-multi-system-root-per-system-frames.md)（per-system フレーム）、[ADR-463](463-implicit-edge-detail-panel.md)（集約エッジの詳細パネル）
  - [TPL-2756](../test-perspectives/TPL-2756-downstream-consumes-what-upstream-assembled.md)（本 Issue から起こした観点）、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)、[TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md)
  - コード: `packages/core/src/view/view-extract.ts`、`packages/core/src/renderer/layout.ts`、`packages/core/src/diff/view-diff.ts`、`packages/core/src/renderer/svg-renderer.ts`

## 背景

root view が、**矢印で宣言されていない依存を 1 本も描いていなかった**。`.krs` は service とインフラの依存を 2 通りで書ける。矢印を明示する書き方と、`usecase` の `resource` 参照・`delivers`・domain 間依存から karasu が導出する書き方である。後者は single system のビューでは描かれるが、root view では消えていた。

欠落は 2 段階で起きていた。`extractRootSystemView` が導出ヘルパーを `systems[0]` にしか適用しないので 2 番目以降の system の派生エッジは**そもそも作られず**、`layoutMultipleSystems` は抽出の成果物ではなく各 system の `sys.edges` から**作り直す**ので、primary の分もレイアウト直前でもう一度落ちていた。[ADR-2223](2223-service-anchored-edge-renders-on-parent-canvas.md) は同じ罠を「実装上の落とし穴」として記録し、anchored edge **だけ**をレイアウト側にも持ち上げて塞いでいた。本 Issue はその塞ぎ残しである。

対象は Issue の記述より広かった。`compile.ts` は top-level のノードを `__unassigned__` 擬似 system に包む（[ADR-681](681-top-level-service-rendering.md)）。擬似 system が 1 つだけでも自分のラベル付きフレームを持つために multi-system 経路を通るので、**`system` を 1 つも書いていないモデルも派生エッジを全部失っていた**。

## 決定

**root view の各 system フレームは、自分が並べる子から導出したエッジ集合を持ち、その導出は全フレームで 1 本の関数を通る。**

- 抽出は `deriveCanvasEdges()` を system ごとに呼び、`ViewSlice.systemEdges` としてフレームごとに載せる。レイアウトは `systemEdges.get(sys.id)` を読むだけにし、再導出をやめる
- `childEdges` は全フレームの union にする。`assignEdgeCanonicalIds` と `resolveStyles` の `extraEdges`、compare モードのマージが既存の配線のまま全 system を覆う
- **フレームに閉じるものは 3 つ**: エッジ集合、集約 implicit エッジの構成要素（詳細パネルの行）、compare モードの diff state。いずれもキーが `${from}->${to}` 系で system を含まないため、1 枚のマップでは同名 id を持つ 2 system が互いの答えを上書きする
- cross-system エッジの provenance は**宣言済み集合から取り続ける**。フレームの導出集合は両端が自分の子であるエッジだけを残すので限定子付き target が落ち、#2646 の折り畳み端点の再アンカーが起点 system を失う

## 理由

- **ADR-2521 が既に方向を決めている。** 「multi は single の計算に合わせる」。今回は計算ではなく計算の**入力**が食い違っているが、片方だけが正しく選択の余地がないという構図は同じ。
- **spec が推奨する記法が沈黙していた。** 同じ構造に 2 つの綴りを与えたうえで片方だけを描いていた。構文は 1 文字も変えず描画対象が増えるだけなので v1.x で許される（[ADR-1314](1314-krs-spec-v1-freeze.md)）。
- **混線はキーの規律ではなく構造で防ぐ。** 実測すると、詳細マップを slice 全体の無修飾キーに集めた場合、`Alpha` と `Beta` がそれぞれ `Api`→`Other` を集約するモデルで **Alpha の線が Beta の構成要素（`B1->B2`, `B3->B2`）を出した**。フレームに閉じればキー形を 1 文字も変えずに消えるので、`layout-edges.ts`・single 経路・`extractOrphanView`・`diffImplicitEdgeDetails` のキー解析はいずれも無変更で済む。
- **diff state を先送りできなかった。** 設計の初版はこれを「bare id キー正規化の残件」として範囲外にしていた。実測で覆った。両 system が `Api->Store` を導出し Alpha だけが失う revision 間で、共有マップは `unchanged` を返す。つまり **Alpha の削除が unchanged として描かれ差分から消える**。修正前の挙動では同じ形が `removed` を返していたので、衝突自体は既存だが**向きが過剰報告から過小報告へ反転する**。見える誤りが見えない誤りに変わるのは差分ツールとして許容できない。
- **`system` なしモデルも同じ経路なので同じ修正で閉じる。** 柵を 1 本足すだけで足りた。

## 却下した案

- **`childEdges` を root 全体の union にするだけ**（新フィールドなし、レイアウトは既存の id 集合フィルタで切る）: root view の node map は bare id キーなので、`system Alpha { service Api  database Store }` と `system Beta { service Api  database Store }` が並ぶとき Alpha 由来の `Api->Store` が Beta のフレームのフィルタも通り、**Beta に存在しない依存が描かれる**。誤爆が「線が 1 本増える」形で出るため既存テストを素通りする。
- **`ViewSlice` を system ごとのスライス配列に正規化する**: 構造的に正しく、bare id を前提にした map の歪みも順に畳める終着点。ただし `ViewSlice` 型を参照する非テストファイルが 19 あり、drawio exporter・org / deploy view・diff 3 種・compile 2 経路・app が追随する。bug 1 件で払う額ではない。採用案はこの案への橋を焼かない（`systemEdges` map は畳める形）。
- **`layoutMultipleSystems` が導出ヘルパーを直接呼ぶ**: `ViewSlice` の契約に触らずに済むが、導出の呼び出し側が 2 箇所になる。抽出に族が増えるたび renderer が追随せず今回と同じ穴が開く。ADR-2223 が実際にこの手を打っており、その結果が本 Issue である。加えて `compile` は `childEdges` しか style / canonical id に渡さないので、renderer で作ったエッジには色も id も付かない。
- **system ごとに `extractView` を再帰させる**: drill-down の slice は `containerNode` / `ancestorChain` を持ち ghost 解決も走る別の意味の成果物で、root view の 1 フレームと同一ではない。モデル全体を歩く構築が system 数だけ走り、compare モードでは N+1 個の slice を差分することになる。
- **詳細マップを 1 枚に集めてキーを system で接尾修飾する**（設計初版の方針）: 単一の真実が 1 枚に残るが、書き込み（`view-extract.ts`）と lookup（`layout-edges.ts`）の 2 箇所を恒久的に同期させる必要があり、single 経路のキー形も動く。フレームに閉じる案は同じ危険を構造で消し、その同期を発生させない。代償は primary の詳細が slice 側とフレーム側の 2 箇所から読めることだけで、multi root では slice 側を読む consumer が無い。

## 既知の限界

- **共有 `edgeDiff` のキー形は bare のまま。** `diffEdgeArray` は `` `${from}->${to}` `` で突き合わせるので、同名エッジを持つ 2 system は共有マップ上で 1 エントリに畳まれる。multi 経路の描画はもうこのマップを読まない（エッジ自身に刻んだ state を優先する）ので観測可能な誤りは残らないが、キー形そのものの正規化は「slice 配列への正規化」と同じ残件である。
- **`ViewSlice.implicitEdgeDetails` は primary フレームのぶんだけ。** multi root でこのマップを読む consumer は無く（`computeLayoutEdges` は single 経路専用）、compare モードはフレーム側のマージで覆われるので欠落は観測できない。ただし「slice の詳細は root view 全体ではなく primary のもの」という非対称は残る。
- **in-place 展開（#1921）は primary 限定のまま。** 展開フレームを跨ぐエッジが描かれるようになったのは派生族がまるごと落ちていたぶんが直った副産物で、展開の対象を広げたわけではない。
