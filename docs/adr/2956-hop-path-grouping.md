---
id: ADR-2956
title: 交差ホップを同じ stroke の連続区間ごとに 1 本の `<path>` にまとめる
status: accepted
date: 2026-10-13
topic: renderer
related_to: [ADR-1859, ADR-2631, ADR-3090]
scope:
  packages:
    - core
  concerns:
    - performance
assumptions:
  - "symbol: packages/core/src/renderer/svg-renderer.ts :: renderCrossingMarks"
  - "symbol: packages/core/src/renderer/svg-renderer.ts :: continuesHopRun"
  - "file: docs/acceptance/2956-hop-path-grouping.md"
  - "file: docs/test-perspectives/TPL-2956-regrouping-svg-elements-keeps-paint-order.md"
---

# ADR-2956: 交差ホップを同じ stroke の連続区間ごとに 1 本の `<path>` にまとめる

- **日付**: 2026-10-13（実装 PR #3080 のマージは 2026-10-07）
- **ステータス**: 決定済み
- **関連**:
  - Issue #2956（起点。#2757 の計測で見つかり、出力を変えるので切り出した）、設計 PR #2960（本 ADR に集約し削除: `docs/design/hop-path-grouping.md`）、実装 PR #3080
  - [ADR-1859](1859-system-view-p2c-grouped-edge-routing-and-marks.md)（交差マークの導入。ホップは host エッジの線に隙間を空け、その隙間を弧で橋渡しする）、[ADR-2631](2631-trunk-legibility-by-count.md)（装飾で交差マークを覆わない。レイヤ間の順序）、[ADR-3090](3090-crossing-marks-follow-edge-focus.md)（区切りのキーに「同じエッジ」を足した後続の決定）
  - TPL: [TPL-2956](../test-perspectives/TPL-2956-regrouping-svg-elements-keeps-paint-order.md)（設計 PR で起こした proactive TPL）、[TPL-2631](../test-perspectives/TPL-2631-decoration-must-not-hide-a-crossing-mark.md)、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)
  - AT: `docs/acceptance/2956-hop-path-grouping.md`
  - spike: `spike/2956-hop-path-per-stroke`（`KRS_HOP_GROUP` で 4 通りのまとめ方を切り替える計測用。マージしない）
  - コード: `packages/core/src/renderer/svg-renderer.ts`（`renderCrossingMarks` / `continuesHopRun`）

## 背景

交差ホップ（ある線が別の線を飛び越える箇所に描く小さな弧）が、出力 SVG の大半を占めていた。Dify モデルの全ビュー bundle では、8.72MB のうち 3.74MB（42.8%）が `<g class="crossing-marks">` の中身で、`<path>` 43,079 個のうち 38,572 個がホップの弧だった（`DifyDB` のビュー 1 枚だけで 16,349 個）。ホップは 1 個ずつ独立した `<path>` で、毎回同じ表示属性（`fill="none" stroke=… stroke-width=…`）を繰り返していた。

コストを払うのは SVG を表示する側で、アプリのプレビューは 1 枚のビューのために数万の DOM 要素を組む。CLI の描画時間への効きは小さい（全ビューで −30〜50ms、測定の揺れと同程度）。本件の目的は出力サイズと、表示側の要素数である。

制約は 3 つあった。

- **見た目を変えない。** 交差マークは「交差＝非接続」を示す記号で、欠けたり上下が変わったりすると読み違いにつながる（TPL-2631）。
- **描画順を黙って変えない。** 同じ点に重なる要素は後に描いたほうが勝つ。どちらが勝つかが、まとめ方という意味と無関係な理由で変わってはならない（TPL-2956）。
- **レイヤの中に `<g>` を入れ子にしない。** 既存テストはレイヤを最初の `</g>` まで切り出している。

## 決定

`renderCrossingMarks` は `marks.hops` の順を保ったまま、stroke（色と線幅）が同じホップが**連続している区間**を 1 本の `<path>` のサブパスにまとめる。区切りのキーは `continuesHopRun` 1 箇所に置く。ホップの幾何（位置・寸法・角度）と junction chip の出力は変えない。

区切りのキーには、後に [ADR-3090](3090-crossing-marks-follow-edge-focus.md) が「同じエッジ」を足した（本設計の案3）。ホップをエッジごとに減光するためで、そのとき本 ADR の連続区間の原則（描画順を保つ）はそのまま残っている。

## 理由

- **描画順を変えずに、最もまとめる案とほぼ同じ効果が出る。** 実装後の計測（Dify 全ビュー、before = `main` `dbfb3a52`）:

  | | before | after |
  | --- | --- | --- |
  | 出力 | 8.72 MB | **6.48 MB（−25.6%）** |
  | `<path>` 要素 | 43,079 | **5,401** |
  | ホップの `<path>` 要素 | 38,572 | **894** |
  | `crossing-marks` レイヤ | 3.74 MB | 1.50 MB |
  | `DifyDB` の表示（Chromium、20 ラウンドの中央値） | 50.5 ms | **16.6 ms** |
  | `buildAllViewsSvg`（`pnpm bench:render`、5 回の最良） | 539 ms | 506 ms |

- **幾何と順番が同じであることを確かめた。** 両側のサブパスをすべて展開して比べ、Dify の 38,572 ホップ、examples の 85 ファイルすべてで、幾何・stroke・順番が一致した。Dify では `crossing-marks` レイヤの外の SVG がバイト単位で同一だった。
- **要素への詰め方を 1 箇所の関数で決める。** 区切りのキーを `continuesHopRun` にまとめたので、後に ADR-3090 が「同じエッジ」を足したときも 1 行の変更で済んだ。

### 画素の差（設計時の想定との違い）

変わった全ビューを Chromium で 1 viewBox 単位 = 1 画素で描き、前後を比べた。設計は差が同色ホップの重なりの内側にだけ出ると見込んでいたが、重なりの外にも出た。

- 重なりの外の差は Dify で最大 9/255（examples で 5/255）。Chromium は複数のサブパスを持つ 1 本の path と別々の path を、わずかに違うアンチエイリアスで描く。差のある画素の 99.6% は 8/255 未満。
- 同色ホップの重なりの内側では `DifyDB` で最大 64/255。1 本の path は共有する縁の画素を 2 回ではなく 1 回だけ塗るためで、設計で受け入れた差である。
- 色の違うホップの重なり（設計の計数で Dify に 9,798 組）は、順番が変わらないので上下が入れ替わらない。

表の全体は AT に記録した。

### 既知の差: 半透明の stroke

計測は組み込みの不透明な色で行った。スタイルシートがエッジに alpha 付きの色（例: `#dc143c80`。SVG に検証なしで渡る）を与えると、重なった同色ホップは 2 回ではなく 1 回だけ塗られ、重なりが弧の他の部分より濃くならない。`docs/spec/style.md` がエッジに文書化しているのは不透明な hex 色だけなので、範囲外として扱う。

## 却下した案

計測はすべて Dify の全ビュー bundle（`main` の `6c9b13b1` 時点。上の実装後の計測とは base が違う）。

- **stroke ごとに 1 本（初出順）。** ホップの要素は 55 個、出力 −26.2% で最も減るが、色の違うホップが重なったときの上下がグループの初出順で決まる。Dify で色違いのバウンディングボックスが重なる 9,798 組のうち 4,757 組で上下が入れ替わる。ホップ同士は意味が同じなので読み違いにはならないが、「見た目を変えない」を満たさない。採用案との差は出力で 0.6 ポイント、`DifyDB` では同じ出力になる。
- **同じ stroke かつ同じエッジの連続区間ごとに 1 本（案3）。** 描画順はそのままで、ホップをエッジごとに参照できる形になる。ホップの要素は 3,153 個、出力 −24.1%、`DifyDB` の表示 33ms（採用案は 23ms）。当時はそれを使う側（ホップをエッジに結ぶ hover の規則）が無かったので採らず、区切りのキーを 1 箇所にして塞がないようにした。後に ADR-3090 がこの形に切り替えた。
- **要素は 1 ホップ 1 個のまま、共通の属性を親の `<g>` に上げる。** 出力は −20.4% だが要素数が減らず（`<path>` 43,079 個のまま `<g>` が増える）、目的の半分を満たさない。レイヤの中に `<g>` が入れ子になり、既存テストの切り出しが壊れる。
- **変更しない。** ホップが出力の 43% を占め、密な図ほど表示側の要素数が増える状態が続く。

パン（transform の変更）1 回の再描画は、どの案も 33〜38ms で差が出なかった。描く線の量は同じで、減るのは要素ごとのスタイル計算とレイアウトだけである。

## 影響

- SVG のホップの要素構造が変わった（見た目は上の画素の差を除いて変わらない）。ホップを 1 個ずつ扱う外部の後処理があれば影響するが、ホップは当時エッジの識別を持たなかったので、個別に扱う手掛かりはもともと無かった。
- `docs/spec/` の変更は無い（ホップの要素構造は仕様として公開していない）。
- junction chip のまとめ方は扱わない。junction は grouped ビューでだけ描かれ（ADR-1859）、`<text>` を伴うので同じ方法ではまとめられない。
