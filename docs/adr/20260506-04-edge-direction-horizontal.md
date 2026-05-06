---
id: ADR-20260506-04
title: "edge `direction: left` / `direction: right` の layered layout 反映"
status: accepted
date: 2026-05-06
topic: edges
depends_on: [ADR-20260506-03]
related_to: [ADR-20260409-04, ADR-20260429-04, ADR-20260430-04]
refines: [ADR-20260506-03]
scope:
  packages: [core]
---

# ADR-20260506-04: edge `direction: left` / `direction: right` の layered layout 反映

- **日付**: 2026-05-06
- **ステータス**: 決定済み
- **関連**:
  - 親 Issue [#1135](https://github.com/kompiro/karasu/issues/1135)
  - 実装 PR [#1138](https://github.com/kompiro/karasu/pull/1138)（Design Doc）、
    [#1139](https://github.com/kompiro/karasu/pull/1139)（実装）
  - 親 ADR: [ADR-20260506-03](./20260506-03-edge-direction-style.md)
  - 関連 ADR: [ADR-20260409-04](./20260409-04-barycenter-layer-ordering.md)（layer 内 x の baseline）、
    [ADR-20260429-04](./20260429-04-style-column-layout-hint.md)（node `column` hint）、
    [ADR-20260430-04](./20260430-04-resource-rw-edges.md)（last-wins 慣習）

## 背景

ADR-20260506-03 で `direction` enum の 5 値を定義したが、`left` / `right`
のレイアウト反映方法はそこでは触れていなかった。`up` / `down` は層間
（縦方向）の関係なので layer 反転で素直に実装できたが、`left` / `right`
は層内（横方向）の関係であり、(a) 同一層に引き寄せるか、(b) 既に同一層に
いる場合のみバイアスを掛けるか、(c) node 側 `column` hint との優先順位、
(d) 矛盾するヒントの解決方法、を別途決める必要がある。

## 決定

`left` / `right` を以下のセマンティクスで layered layout に反映する:

- **値の意味**: `direction:` は **矢印の流れる向き** を指定する
  （`up` / `down` と同じく flow direction メンタルモデル）。
  source endpoint は矢印と逆側に置かれる:
  - `direction: right` → 矢印が右へ流れる → source は target の **左**
  - `direction: left`  → 矢印が左へ流れる → source は target の **右**
- **同一層引き寄せ**: source / target が異なる layer にいるとき、
  `applyDirectionHintsToForcedLayers` が source.layer = target.layer に
  修正する。`up` / `down` の "source 局所変位" モデルと同じ
- **within-layer 並び替え**: 同一 layer に揃った後、
  `applyEdgeDirectionWithinLayer` が source を target の隣（左 / 右）に
  並び替える。`bucketByColumn` の **後段** に挿入されるため、source
  endpoint について node `column` hint を上書きする
  （target の `column` は尊重）
- **矛盾解決**: 同一 source への複数の矛盾するヒントは declaration 順で
  **last-wins**（ADR-20260430-04 の cascade 規約と整合）

## 理由

- **値の命名が `up` / `down` と統一**: 5 値すべて「矢印の流れる向き」と
  読める。ユーザーが spec を一度学べば 4 方向に応用できる
- **`up` / `down` の "source 局所変位" モデルを横方向に拡張**: target と
  他のノードは動かさない。kind stratification への影響は明示された
  source endpoint のみ
- **service 同士の典型エッジでも honor**: 当初は「同一層のときのみ」と
  弱く取っていたが、forced 段組内の topological sub-sort で別 sub-layer
  に分かれて no-op 化することが多く実用上効かなかった。引き寄せ採用で
  service-to-service が動くようになった
- **ADR-20260429-04（column hint）と直交**: column は absolute bucket
  指定、edge `direction` は二項関係を表す上位 override 層という関係に
  整理した。`bucketByColumn` の出力に重ねる形で実装するので、bucket
  境界をまたぐが整合性は崩れない
- **ADR-20260430-04 の last-wins 慣習に整合**: GUI 編集器（#1129）の
  append-only 流に乗り、後発操作が必ず反映される予測可能性を提供

## 却下した案

### 案 B: 同一層内バイアスのみ（弱い意味）
source / target が **既に同一層にいる場合に限り** 並び替える。異なる層
なら no-op（auto 扱い）。
- 却下理由: forced kind-based layout 内の topological sub-sort で
  service A → service C が別 sub-layer に分かれるため、典型ケースで
  発火しない。当初採用したが [#1139](https://github.com/kompiro/karasu/pull/1139)
  の追加コミットで撤回し、同一層引き寄せに切り替えた

### 案: source 位置で値を命名（`direction: right` = source on right）
`direction: right` を「source が右」と読む案。
- 却下理由: `up` / `down` は「矢印の流れる向き」で命名されているのに
  `left` / `right` だけ命名規則が異なるとユーザーが混乱する。レビュー
  指摘で flow direction 命名に統一した（[#1139](https://github.com/kompiro/karasu/pull/1139) 末尾コミット）

### 案: `left` / `right` を別プロパティに分離（例: `column-bias:`）
edge プロパティを増やさず、別名で導入する。
- 却下理由: 5 値 enum 1 個で `direction` を統一したほうが spec が小さい。
  ユーザーが学ぶ概念を最小化

## スコープ外

- 自由方向（斜め）への拡張
- drill-down view の column hint 対応（drill-down では bucketByColumn が
  動かない設計上、edge hint が同一層引き寄せ後に意味を持つ範囲に限定）
- deploy / org view への適用（layout 機構が異なる）
