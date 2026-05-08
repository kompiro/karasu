---
id: ADR-20260506-02
title: "`.krs.style` の `edge#<id>` セレクタ — base ID + opt-in 著者 ID"
status: accepted
date: 2026-05-06
topic: edges
depends_on: [ADR-20260508-01]
related_to: [ADR-20260429-04, ADR-20260506-01]
scope:
  packages: [core]
---

# ADR-20260506-02: `.krs.style` の `edge#<id>` セレクタ — base ID + opt-in 著者 ID

- **日付**: 2026-05-06
- **ステータス**: 決定済み
- **関連**:
  - 親 Issue [#1096](https://github.com/kompiro/karasu/issues/1096)
  - 実装 PR [#1099](https://github.com/kompiro/karasu/pull/1099)（Design Doc）、
    [#1114](https://github.com/kompiro/karasu/pull/1114)（Phase A: parser + canonicalId）、
    [#1117](https://github.com/kompiro/karasu/pull/1117)（Phase B: style selector）、
    [#1120](https://github.com/kompiro/karasu/pull/1120)（project-wide uniqueness）
  - 親 ADR: [ADR-20260508-01](./20260508-01-gui-style-inplace-update.md)（旧: [ADR-20260506-01](./20260506-01-gui-driven-style-editing.md)、本決定で superseded）
  - 関連 ADR: [ADR-20260429-04](./20260429-04-style-column-layout-hint.md)（node `#<id>` の specificity 階段に揃える）

## 背景

ADR-20260506-01 の append-only round-trip で **個々の edge を一意に指す
selector** が必要になった。既存の `.krs.style` は `edge` / `edge[tag]`
までしか持たず、「この edge だけ」スタイルを当てる手段が無かった。
さらに usecase→resource 合成 edge のような構造的に一意な edge にも、
explicit な edge にも、両方に対応できる仕組みが要る。

## 決定

`.krs.style` に **`edge#<id>` セレクタ** を追加する。`<id>` は以下の優先順
で確定する canonical id:

1. 著者が `.krs` で `#<id>` を **opt-in で書いた authorId**
   （edge 宣言・`usecase` の `resource` 行のいずれにも書ける）
2. それ以外は **base form** `<from><arrow><to>`
   （`->` は sync、`-->` は async）

衝突したら自動 tie-break しない。著者が `#<id>` を付けて解決する。
project-wide で uniqueness を保証（重複は `duplicate-edge-id` エラー、
view extract 後の base 衝突は `ambiguous-edge-base` warning）。

specificity は **101**（id 寄与 100 + 種別 `edge` 寄与 1）で、ノード ID の
specificity 100（ADR-20260429-04 の階段）に整合する。

## 理由

- **`.krs` 文法に最小限のオプションだけ追加**: `#<id>` は opt-in、書かない
  場合は base form が機械的に求まるので既存の `.krs` を壊さない
- **論理 / 物理分離を維持**: edge への命名は logical identity であって
  presentation ではない（node ID と同じ筋）。`.krs.style` 側で書くのは
  selector のみ
- **silent breakage を避ける**: base 衝突時に推測で 1 つを選ばず、warning
  を出して `canonicalId` を `undefined` に落とす。GUI で書かれた rule が
  「いつの間にか別 edge を指す」事故を防ぐ
- **GUI から自動生成しやすい**: ID 形式は semantic 解析なしで Preview の
  click から復元可能。`data-edge-canonical-id` 属性で SVG 上に直に乗る
- **合成 edge も同じ規則で addressable**: usecase→resource は `(usecase,
  resource)` で構造的に一意、aggregated service edge は base + 矢印で一意
  なので、tie-break ladder 抜きでカバーできる

## 却下した案

### 案 B: index 必須（`from->to#N`）
全 edge に強制で 1-based の宣言出現順 index を付ける。
- 却下理由: ソース順依存が常に表に出る。`A -> B` を 1 本書いただけでも
  `edge#A->B#1` のような不格好な selector になる

### 案 C: label を tie-break のキーにする
同 base の重複は label 文字列で区別する（`edge#A->B:"retry"`）。
- 却下理由: 通常 edge は使えるが、aggregated label `"3 domain edges"` の
  ようにカウントを含むラベルは関係ない変更で文字列が変わり、override が
  silent に外れる

### 案 D: 階段式 tie-break ladder（base → label → index）
重複時に label・occurrence index を順次足して一意化する。
- 却下理由: karasu の合成 edge は構造的に一意で、tie-break が発火する
  ケースが極めて少ない。ladder の複雑さに見合う実用上の利益が無い。
  当初採用したが [#1099](https://github.com/kompiro/karasu/pull/1099) の
  追加コミットで撤回し、シンプルな base + 著者 ID の併用に切り替えた

### 案 E: 不透明ハッシュ（`from->to@a3f1`）
全 edge に決定的な短ハッシュを当てる。
- 却下理由: 読めない。`.krs.style` の保守性が下がる。GUI から書き戻した
  rule を人間が読んで理解できることを優先する
