---
id: ADR-2473
title: テキストの縦位置は `dominant-baseline` ではなく em 単位の `dy` で指定する
status: accepted
date: 2026-08-13
topic: renderer
authors: [kompiro]
related_to:
  - ADR-22
  - ADR-1805
  - ADR-2366
assumptions:
  - "symbol: packages/core/src/renderer/svg-builder.ts :: DY_CENTER"
  - "symbol: packages/core/src/renderer/svg-builder.ts :: DY_HANGING"
  - "file: packages/core/src/renderer/baseline-portability.test.ts"
---

# ADR-2473: テキストの縦位置は `dominant-baseline` ではなく em 単位の `dy` で指定する

- **日付**: 2026-08-13
- **ステータス**: 決定済み
- **関連**:
  - 起点 Issue: [#2473](https://github.com/kompiro/karasu/issues/2473)（[#2366](https://github.com/kompiro/karasu/issues/2366) の P9 を分離したもの）
  - [ADR-22](22-svg-export-two-phase.md)（エクスポート SVG の到達先を「モダンなブラウザ・SVG ビューア」と置いた先例）
  - [ADR-1805](1805-resvg-wasm-png-rasterization.md)（PNG 経路は resvg-wasm + 同梱フォント）
  - [ADR-2366](2366-node-chrome-and-ports.md)（カード内の要素配置。本 ADR はその縦位置の指定方法を差し替える）
  - AT: [AT-2473](../acceptance/2473-svg-baseline-portability.md)

## 背景

karasu の SVG はラベル・チップ・バッジ・タブの縦中央揃えを `dominant-baseline`
に頼っていた（renderer 4 モジュールで 18 箇所）。この属性は SVG の text module に
属し、**ブラウザ以外のラスタライザには黙って無視するものがある**。無視されると
テキストはベースラインに落ち、カードの中で上に浮く。

#2366 の P9 として起票されたが、提案行が付かないまま 13 スライスのバッチを通過して
残っていた。分離（#2473）にあたって計測したところ、被害と代替案の精度が数値で出た。

## 決定

`dominant-baseline` を出力せず、**em 単位の `dy`** で縦位置を指定する。
`svg-builder.ts` が 2 つの定数を持ち、renderer はそれを使う。

| 置き換え対象 | 定数 | 値 |
| --- | --- | --- |
| `dominant-baseline="central"` | `DY_CENTER` | `0.35em` |
| `dominant-baseline="hanging"` | `DY_HANGING` | `0.73em` |

再発は `baseline-portability.test.ts` が止める。renderer モジュールのソースに
`"dominant-baseline":` が現れないこと、および system / deploy / org の実出力に
文字列が現れないことを、両側から検査する。

## 理由

- **無視されたときの被害は見える大きさ、置き換えの誤差は見えない大きさ。**
  Chromium 実測（アンカー y=40）:

  | font-size | `central` | `dy="0.35em"` | 属性を無視した場合 |
  | --- | --- | --- | --- |
  | 9px | 40.00 | 40.15 | 37.00 |
  | 11px | 40.00 | 40.35 | 36.50 |
  | 13px | 40.00 | 40.05 | 35.50 |

  無視されると 3〜4.5px 上へ、`dy` 置換の誤差は 0.35px 以下（20px まで確認）。
  `hanging` は 0.73em で誤差 0.6px 以下。
- **`dy` は SVG 1.1 コア**で、text module を実装しないラスタライザでも解釈される。
- **レイアウトは 1px も動かない。** 再生成したガイド図 18 枚の差分は 93 行すべてが
  属性の置換で、`x` / `y` は全て不変。差分合成で重ねても文字の縁が薄く出るだけ。

## 却下した案

- **到達先を明文化して現状維持**（#2473 が挙げていたもう一方の答え）。ADR-22 が
  既に「ブラウザ・SVG ビューア」と書いており、multi-level エクスポートは
  ハッシュナビゲーション前提でそもそもラスタライザでは使えない。したがって
  「境界を引き直さない」判断にも一貫性はあった。採らなかったのは、置換のコストが
  機械的（18 箇所 + 図の再生成 + ガード 1 本）で、誤差が知覚できない一方、
  図を他ツールへ貼る利用は診断ツールとしてごく自然だから。単一レベルの
  `karasu render --format svg` にはナビゲーションが無く、Inkscape や Office に
  持ち込まれる可能性が現実にある。
- **単一レベル SVG だけ `dy` にする折衷。** テキスト配置が 2 系統になり、
  surface 間の一貫性（[TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)）を
  将来必ず破る。
- **フォントメトリクスから厳密な `dy` を算出する。** `central` はフォントの
  ascent/descent 中点に合わせる指定なので、厳密一致にはレンダリング時の
  メトリクス取得が要る。karasu はテキストを出力するだけでフォントを測らない
  （幅も `estimateTextWidth` の推定）ので、精度に見合わない依存を持ち込む。

## 影響

- `dominant-baseline` を含むテキストの縦位置が全 surface で最大 0.35px 動く。
  レイアウト座標は不変。
- フォント未埋め込みの側（#2473 のもう半分）は本 ADR の対象外。PNG 経路は
  ADR-1805 が同梱フォントで解決済みで、エクスポート SVG を実フォントの無い環境で
  開いた場合の字幅ずれは残る。
