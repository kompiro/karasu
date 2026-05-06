---
id: ADR-20260506-03
title: "`.krs.style` の edge `direction` プロパティ — 矢印の流れる向きを 5 値 enum で指定"
status: accepted
date: 2026-05-06
topic: edges
depends_on: [ADR-20260506-01, ADR-20260506-02]
related_to: [ADR-20260506-04]
scope:
  packages: [core, app]
---

# ADR-20260506-03: `.krs.style` の edge `direction` プロパティ — 矢印の流れる向きを 5 値 enum で指定

- **日付**: 2026-05-06
- **ステータス**: 決定済み
- **関連**:
  - 親 Issue [#1071](https://github.com/kompiro/karasu/issues/1071)（edge readability ブレスト）、
    [#1098](https://github.com/kompiro/karasu/issues/1098)（GUI MVP）、
    [#1124](https://github.com/kompiro/karasu/issues/1124)（layout 反映）
  - 実装 PR [#1097](https://github.com/kompiro/karasu/pull/1097)（Design Doc）、
    [#1125](https://github.com/kompiro/karasu/pull/1125)（property 追加）、
    [#1132](https://github.com/kompiro/karasu/pull/1132)（layered layout で `up` を honor）、
    [#1136](https://github.com/kompiro/karasu/pull/1136)（`down` 強化）
  - 親 ADR: [ADR-20260506-01](./20260506-01-gui-driven-style-editing.md)、
    [ADR-20260506-02](./20260506-02-edge-id-selector.md)
  - 派生 ADR: [ADR-20260506-04](./20260506-04-edge-direction-horizontal.md)（`left` / `right` を refine）

## 背景

dense な図で edge が交差したり、レイアウトエンジンが選んだ方向のせいで
label が窮屈になるケースがある（[#1071](https://github.com/kompiro/karasu/issues/1071)）。
PlantUML は `-down->` `-d->` のように edge ごとに方向ヒントを与えられる
が、karasu でこれをどう扱うかが論点だった。

ADR-20260506-01 の GUI 駆動編集が固まったことで、判断軸が変わった:

- 文法を増やすコスト = ユーザー認知負荷だった
- が、Preview の右クリックメニューで操作できるなら discoverability の
  問題は GUI が吸収する → 文法追加のハードルが下がる

## 決定

edge の **方向ヒント** を `.krs.style` の `direction` プロパティとして
追加する。`.krs` には載せない（presentation は presentation の場所に
留める）。

- **値**: `auto | up | down | left | right` の 5 値 enum、default `auto`
- **意味**: `direction` は **矢印の流れる向き** を指定する
  （`up` = 矢印が上に流れる、source は target の下）。5 値全てが
  「flow direction」のメンタルモデルで一貫
- **ヒント扱い**: layout engine がサイクル等で honor できないと判断したら
  自然な orientation に fall back（warning は出さない）
- **forced kind-based layout でも局所的に honor**: source の layer を
  target に合わせて per-edge で修正。target と他の同種ノードは動かない
- **Selector**: `edge` / `edge[tag]` / `edge#<id>` の各セレクタで書ける
  （ADR-20260506-02 と組み合わせる）

`auto` を default にする理由:
- 既存の `.krs.style` を壊さない（書かなくても観察上同じ）
- ヒントを与えない = engine が今まで通り動く、を明示できる

## 理由

- **論理 / 物理分離（`docs/concepts.md`）の維持**: 方向は presentation で
  あって logical model ではない。`.krs` には載せない
- **レイアウトエンジン非依存**: 5 値 enum に閉じることで、将来 layout
  エンジンを切り替えたとき（dagre → ELK → 自前 …）に陳腐化しない
- **ヒント扱いで cycle に強い**: `up` 反転がサイクルを作るとき
  `applyDirectionHintsToForcedLayers` / `buildGraph` の cycle guard が
  自然な orientation に fall back。layout が破綻しない
- **GUI の append flow と整合**: ADR-20260506-01 の cascade-tail-wins と
  noisy-diff 回避のセマンティクスにそのまま乗る
- **値の命名が一貫**: 5 値全て「矢印の流れる向き」で読めるため、ユーザーが
  spec を一度学べば全方向に応用できる

## 却下した案

### 案: `.krs` 構文で表現（PlantUML 風 `-d->`）
```
ECommerce -d-> Database
```
- 却下理由: presentation を logical に混ぜる。論理/物理分離に反する。
  layout エンジン差し替え時に意味が壊れる可能性。スタイル変更で
  `.krs` の git 履歴が汚れる

### 案: 自由角度（`direction: 45deg`）
- 却下理由: layout エンジン依存が強すぎる。3 値 enum + auto / 4 値 enum
  + auto で十分実用上の用途を満たせる。MVP では 5 値に閉じる

### 案: layered layout 改善のみで auto に任せる（property 追加なし）
edge 交差・label 衝突を engine 側で全自動で解く。
- 却下理由: 全自動で解けるなら既にそうなっている。最後の数 % は人間の
  意図（「writes は下に流したい」など）が要る。property 追加と layout
  改善は両立して進める

## 段階的実装の経緯

- [#1125](https://github.com/kompiro/karasu/pull/1125): property 追加。
  parse / resolve / `ResolvedEdgeStyle.direction` まで通す。
  layout は honor しない（MVP 制約として spec に明記）
- [#1132](https://github.com/kompiro/karasu/pull/1132): layered layout が
  `up` を honor。topological sort のエッジ反転 + cycle guard を実装
- [#1136](https://github.com/kompiro/karasu/pull/1136): `down` を `up` の
  鏡像として実装。`applyDirectionHintsToForcedLayers` を up/down 一元化
- ADR-20260506-04: `left` / `right` の refinement（横方向の honor）

## スコープ外

- `left` / `right` の詳細仕様 → ADR-20260506-04
- 自由角度・斜め方向（将来要望が出たら別 ADR）
- deploy / org view での `direction` honor（layered layout と layout 機構
  が異なるため別議論）
