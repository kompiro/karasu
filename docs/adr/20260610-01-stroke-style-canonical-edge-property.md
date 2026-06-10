---
id: ADR-20260610-01
title: stroke-style をエッジ線スタイルの正準プロパティとして採用する
status: accepted
date: 2026-06-10
topic: edges
related_to:
  - ADR-20260501-01
  - ADR-20260413-02
scope:
  packages:
    - core
assumptions:
  - "file: docs/spec/style.md"
  - "symbol: packages/core/src/style/property-schema.ts :: PROPERTY_SCHEMAS"
  - "grep: packages/core/src/resolver/style-resolver.ts :: stroke-style"
  - "grep: packages/core/src/builtins/reference-data.ts :: stroke-style"
---

# ADR-20260610-01: stroke-style をエッジ線スタイルの正準プロパティとして採用する

- **日付**: 2026-06-10
- **ステータス**: 決定済み
- **関連**:
  - Issue #1492
  - ADR-20260501-01: エッジの border-style に dotted を追加
  - ADR-20260413-02: Implicit エッジにおける sync/async の視覚的区別
  - `packages/core/src/resolver/style-resolver.ts`
  - `packages/core/src/style/property-schema.ts`
  - `docs/spec/style.md`

## 背景

packages/core の仕様適合性監査（#1492）で、`stroke-style` プロパティが
`PROPERTY_SCHEMAS`（validator スキーマ）にのみ存在し、`docs/spec/style.md`
に記載がなく、resolver も消費しない「ゴーストプロパティ」であることが
分かった。`edge { stroke-style: dashed; }` と書くと警告なく受理されるのに
何の効果も持たない状態だった。

監査時の当初案はスキーマからの削除（unknown-property 警告に戻す）だったが、
エッジは既に SVG 系の `stroke-*` 語彙（`stroke-width`）を使っており、
エッジの線スタイルだけ HTML 系の `border-style` を使うのは語彙が捻れていた。
削除ではなく正式採用する方向で再検討した。

なお ADR-20260501-01 は「新たな専用プロパティ（例: `edge-stroke-style`）の
導入」を語彙の重複として却下しているが、それは `border-style` と無関係な
新語彙を増やす案への却下であり、本決定は同じ値域を持つ正準名 +
エイリアスの関係に整理するもので矛盾しない（dotted を含む 3 値の決定は
そのまま有効）。

## 決定

`stroke-style`（`solid | dashed | dotted`）をエッジ線スタイルの**正準名**
として採用し、`border-style` はエッジでは後方互換のためのエイリアスとして
維持する。カスケード後に両方が宣言されている場合は宣言順にかかわらず
`stroke-style` が勝つ。ノードの線スタイルは従来どおり `border-style` のみで、
`stroke-style` はノードには効果を持たない。

## 理由

- エッジの語彙が `stroke-width` + `stroke-style` で揃い、SVG レンダリングの
  メンタルモデルと一致する。ノード（`border-*`）とエッジ（`stroke-*`）の
  語彙分離が明確になる。
- `border-style` をエイリアスとして残すことで、既存のスタイルシート
  （ビルトインの `edge[async] { border-style: dashed; }` 等）は無変更で
  動き続ける。breaking change がない。
- 「両方宣言時は stroke-style が勝つ」を宣言順非依存にしたのは、プロパティ
  名が異なるとカスケードの last-wins が働かず、resolver が決めるしか
  ないため。正準名固定勝ちは説明が一文で済み、診断も将来足しやすい。
- スキーマ・spec・reference データ・resolver の 4 点が揃い、#1492 の
  ゴースト状態が解消される。`PROPERTY_SCHEMAS ⊆ spec doc` の subset テスト
  （TPL-20260511-02 拡張）で再発を防ぐ。

## 却下した案

- **スキーマから削除する（監査時の当初案）** — 未知プロパティ警告に戻せば
  最小修正で済むが、エッジ線スタイルの語彙の捻れ（`stroke-width` なのに
  `border-style`）が残る。正準名を導入する価値の方が大きいと判断した。
- **`border-style` をエッジで deprecated にして警告を出す** — 既存ユーザー
  資産への影響に対して得るものが少ない。エイリアスとして無警告で維持する。
- **ノードにも `stroke-style` を適用する（完全エイリアス化）** — ノードは
  `border-color` / `border-width` / `border-radius` と HTML 系語彙で
  統一されており、線スタイルだけ stroke 系を許すと今度はノード側の語彙が
  捻れる。エッジ限定とした。
