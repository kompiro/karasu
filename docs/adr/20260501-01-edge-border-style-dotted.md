---
id: ADR-20260501-01
title: エッジの border-style に dotted を追加してユーザーが第3の線スタイル軸を定義できるようにする
status: accepted
date: 2026-05-01
topic: edges
related_to:
  - ADR-20260413-02
  - ADR-20260430-03
scope:
  packages:
    - core
assumptions:
  - "file: packages/core/src/renderer/edge-routing.ts"
  - "file: packages/core/src/types/style.ts"
  - "symbol: packages/core/src/types/style.ts :: ResolvedEdgeStyle"
  - "grep: packages/core/src/renderer/edge-routing.ts :: STROKE_DASHARRAY"
  - "grep: packages/core/src/resolver/style-resolver.ts :: EDGE_STROKE_STYLES"
---

# ADR-20260501-01: エッジの border-style に dotted を追加してユーザーが第3の線スタイル軸を定義できるようにする

- **日付**: 2026-05-01
- **ステータス**: 決定済み
- **実装**: PR #1065
- **関連**:
  - Issue #1064
  - ADR-20260413-02: Implicit エッジにおける sync/async の視覚的区別
  - ADR-20260430-03: Resource CRUD operations
  - `packages/core/src/renderer/edge-routing.ts`
  - `packages/core/src/resolver/style-resolver.ts`
  - `packages/core/src/types/style.ts`
  - `docs/spec/style.md`

## 背景

ノードシェイプは以前から `solid` / `dashed` / `dotted` の3値を SVG `stroke-dasharray` にマッピングしていた（`packages/core/src/renderer/shapes.ts`）が、エッジ側のレンダリング (`edge-routing.ts`) は `dashed` のみを判定し、`dotted` は黙って無視していた。`ResolvedEdgeStyle.strokeStyle` の型も `"solid" | "dashed"` に絞られていたため、ユーザーが `.krs.style` で `edge[my-tag] { border-style: dotted; }` と書いても何も起こらない、という中途半端な実装になっていた。

`stroke-style` の組み込み軸は ADR-20260413-02 により sync/async の表現に予約されており、ADR-20260430-03 の `operations` プロパティが read/write 区別のために stroke-width 軸を消費する予定である。そのため karasu は組み込み軸を増やせない一方で、「ユーザーが `.krs.style` カスケードで第3の軸（speculative dependency, deprecated edge など）を作り込む」余地を残しておく必要がある。`solid` / `dashed` の次に自然な3つ目の値は `dotted` であり、ノード側の既存実装ともマッピングを揃えやすい。

## 決定

`ResolvedEdgeStyle.strokeStyle` を `"solid" | "dashed" | "dotted"` に拡張し、エッジレンダラーで `dotted → stroke-dasharray="2 2"` を出力する（ノードシェイプと同一マッピング）。組み込みスタイルでは `dotted` を使わず、ユーザーが自身の `.krs.style` で意味を割り当てるための受け皿として開放する。

## 理由

- **半実装の解消** — 型定義・リゾルバ・レンダラーのうちレンダラーだけが `dotted` を取りこぼしていた。型と実装を揃えるのが直接の目的。
- **karasu の設計哲学に沿う** — 「core は直交軸を出荷し、ユーザーは `.krs.style` カスケードで合成する」という方針に従い、組み込みでは意味を与えず軸だけを開放する。
- **ノード側と一貫したマッピング** — `dashed` → `"8 4"`, `dotted` → `"2 2"` をノード `shapes.ts` から踏襲することで、ノード境界とエッジ線で見た目の dotted が一致する。
- **将来の軸追加に強い構造** — 実装はネスト三項ではなく `STROKE_DASHARRAY` ルックアップテーブルに集約しており、4つ目の値が必要になった場合は1行追加で済む。
- **不正値の安全な扱い** — リゾルバ側で既知集合 `EDGE_STROKE_STYLES` に対する検証を追加し、未知の値はデフォルト (`solid`) にフォールバックする。レンダラーで `undefined` のまますり抜ける挙動を排除した。

## 却下した案

- **エッジで `dotted` を意図的に拒否する** — 「半実装は完成させるか拒否する」の選択肢のうち拒否側。ノード側がすでに3値をサポートしている以上、エッジ側だけ拒否するのは型システム上の非対称を生み、ユーザーに対する説明コストが高い。完成させる方を選んだ。
- **組み込みで `dotted` に意味を割り当てる（例: `@deprecated` を dotted にする）** — 軸の使い切りに繋がり、将来ユーザーが第3軸を求めた時の逃げ道がなくなる。組み込みは引き続き軸を割り当てない方針。
- **新たな専用プロパティ（例: `edge-stroke-style: dotted`）を導入する** — `border-style` で既に2値が通っているところに新プロパティを追加するのは語彙の重複であり、ノード/エッジで揃った既存の語彙を活かす方が一貫する。
