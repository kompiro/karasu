---
id: ADR-2501
title: 起点スコープに反するエッジ宣言はどのビューにも描画しない
status: accepted
date: 2026-09-02
topic: edges
refines: [ADR-2223]
related_to: [ADR-2075, ADR-1567, ADR-2184, ADR-1314]
scope:
  packages:
    - core
assumptions:
  - "symbol: packages/core/src/view/view-extract.ts :: isAnchoredAt"
  - "symbol: packages/core/src/view/view-extract.ts :: collectAnchoredPeerEdges"
  - "symbol: packages/core/src/view/view-extract.ts :: withChildAnchoredEdges"
  - "grep: packages/core/src/parser/parser.ts :: edge-source-mismatch"
  - "grep: docs/spec/syntax.md :: Edge origin scope"
---

# ADR-2501: 起点スコープに反するエッジ宣言はどのビューにも描画しない

- **日付**: 2026-09-02
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#2501](https://github.com/kompiro/karasu/issues/2501)（[#2459](https://github.com/kompiro/karasu/pull/2459) のレビュー指摘から）
  - 親 ADR: [ADR-2223](2223-service-anchored-edge-renders-on-parent-canvas.md)（子ブロックに anchored なエッジを親の canvas に描く。本 ADR はその描画対象を絞る）
  - 統治 ADR: [ADR-2075](2075-edge-endpoint-scope-diagnostic.md)（宣言スコープで描画できない endpoint の診断）, [ADR-1567](1567-rule-diagnostic-separation-and-catalog.md)（1 規則 ⊃ 複数診断）, [ADR-2184](2184-unassigned-domain-placement-parity.md)（同じ状態を表す配置は同じ扱いを受ける）
  - 関連 TPL: [TPL-2075](../test-perspectives/TPL-2075-parsed-construct-renders-or-warns.md)
  - spec: `docs/spec/syntax.md` § Edge declaration — Edge origin scope

## 背景

ADR-2223 が開いた `collectAnchoredPeerEdges` は「両端がその canvas の peer か」だけを
見て、**そのエッジが宣言元ブロックを起点にしているか**を確認していなかった。

parser は `service` / `domain` / `entity` ブロック内の explicit なエッジについて、
起点がブロック id と一致しなければ `edge-source-mismatch`（**error**）を出す。ただし
弾いたエッジは error recovery でそのまま `S1.edges` に push される。CLI も app も
error 診断で描画を止めないため、`service S1 { S2 -> S3 }` は **診断されているのに
矢印も描かれる**状態になっていた。

同じ PR で入った兄弟 helper `withChildAnchoredEdges` は `e.from === nodeId(child)` で
filter しており、doc comment にも「anchored edge は起点スコープ規則により自己起点で
ある」と書いてあった。**同じ規則について 2 つの helper が違う答えを返していた**。

描画側だけの新しい欠陥ではない。#2223 以前からある intra-service の domain pass も
同じ確認を欠いており、`domain C { A -> B }`（A / B は sibling domain）はずっと error
付きで描画されていた。#2459 はそれを service 粒度へ広げた。

## 決定

**子ブロックに anchored なエッジを親の canvas へ持ち上げる条件に「宣言元ブロックを
起点にしていること」を加える。判定は描画側 2 helper が共有する 1 つの述語
`isAnchoredAt` で行い、起点スコープ規則を持つ kind（`service` / `domain` / `entity`）
にだけ適用する。**

- `edge-source-mismatch` で弾かれた宣言は **どのビューにも描画されない**。author に
  返る信号は error だけで、エッジを起点のブロックへ移すことが唯一の直し方になる
- 起点スコープ規則を持たない kind（`client` / `database` / `queue` / `storage`）の
  ブロック内エッジは、**これまでどおり書かれたまま持ち上げる**。parser は
  `parentId` を渡さないので診断が無く、落とすと silent drop になる
- `withChildAnchoredEdges` の無条件 filter も同じ述語に置き換える。結果として
  `client W { S1 -> S2 }` は multi-system ルートでも描画されるようになり、単一 system
  ルートとの割れ（ADR-2184）が閉じる

## 理由

- **error で弾いた綴りを描くと、error に意味が無くなる**。`edge-source-mismatch` は
  spec が意図的に error register に置いた診断で（`docs/spec/diagnostics.md`）、
  §S6 の warn-don't-error は *未解決参照* の扱いを述べたもの — 規則違反そのものの
  register を決める節ではない。
- **1 つの関係に 2 つの綴りを与えない**。描き続けると `service S1 { S2 -> S3 }` は、
  規則が本来求める `service S2 { S2 -> S3 }` と**同じ絵**になる。error を直しても
  見た目が変わらないのだから、絵は規則が拒否した綴りを黙って追認していたことになる。
  これは ADR-2075 が「描画できるようにする」案を却下した理由と同じ形である。
- **描画側 2 helper の食い違いは、規則がどこにあるかを repo から消す**。述語を 1 つに
  抽出すると、片方だけ直された状態が存在しえなくなる。
- **ガードを規則の及ぶ範囲に限る**。無条件の `edge.from === nodeId(child)` は、
  `client W { S1 -> S2 }` のように**診断を一切持たない**配置まで落とす。実測では
  `client` / `database` ブロックの foreign source は parser も resolver も無言のまま
  描画されており、ここを落とすと TPL-2075 の silent drop を新たに 2 つ作る。
- **TPL-2075 の「ちょうど一方」を parser の診断まで含めて数える**。
  `anchored-edge-render-or-warn.test.ts` の判定が resolver の warning しか見ていな
  かったことが、描画と診断が同時に立つ本件を表の中で見逃した直接の原因だった。

## 却下した案

- **描画を続ける（error recovery として扱う）** — author が書いた矢印をそのまま描き、
  error は「宣言の置き場所を直せ」という指示に留める案。`withChildAnchoredEdges` から
  filter を外して両者を揃えることになる。1 つの関係に 2 つの綴りを与える点で
  ADR-2075 の却下理由に正面から反し、error を直しても絵が変わらないため診断が
  行動に結びつかない。
- **無条件に `edge.from === nodeId(child)` を課す**（Issue の option 1 の字義どおり）
  — `client` / `database` ブロックの foreign source が診断なしで消える。TPL-2075 の
  silent drop を新たに作るので採らない。
- **`client` などにも起点スコープ規則を広げてから無条件ガードを入れる** — 新しい
  error を増やす後方非互換な言語の狭めで、[ADR-1314](1314-krs-spec-v1-freeze.md) の
  v1.0 freeze により v2.0 待ちになる。本件（描画が診断と矛盾している）の修正に
  言語の変更は要らない。
