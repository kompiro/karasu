---
id: ADR-2317
title: プレビューの操作を 2 面に分ける — 図を変える操作はドリルパスの行、持ち出す操作はツールバー
status: accepted
date: 2026-08-14
topic: app-ui
related_to:
  - ADR-9009
  - ADR-307
  - ADR-164
  - ADR-1368
  - ADR-2174
scope:
  packages:
    - app
  concerns:
    - i18n
assumptions:
  - "file: packages/app/src/components/PreviewViewControls.tsx"
  - "file: packages/app/src/components/PreviewToolbar.tsx"
  - "symbol: packages/app/src/components/PreviewViewControls.tsx :: PreviewViewControls"
  - "symbol: packages/app/src/components/preview-group-by.ts :: availableGroupByAxes"
  - "grep: packages/app/src/styles/components/preview.css :: \\.preview-context-row"
---

# ADR-2317: プレビューの操作を 2 面に分ける — 図を変える操作はドリルパスの行、持ち出す操作はツールバー

- **日付**: 2026-08-14
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2317](https://github.com/kompiro/karasu/issues/2317)（i18n 側の半分は [#2332](https://github.com/kompiro/karasu/issues/2332) で解決済み）
  - 設計 PR [#2491](https://github.com/kompiro/karasu/pull/2491)、実装 PR [#2494](https://github.com/kompiro/karasu/pull/2494)
  - 14 個目のコントロールを足した [#2174](https://github.com/kompiro/karasu/issues/2174)（Facets）
  - 実装中に見つかった既存 bug [#2492](https://github.com/kompiro/karasu/issues/2492)
  - AT: [AT-2317](../acceptance/2317-preview-toolbar-density.md)
  - [ADR-9009](9009-toolbar-icon-label.md)（icon + text label 必須）、[ADR-164](164-toolbar-button-display-rules.md) / [ADR-307](307-toolbar-btn-actionable.md)（2 tier）、[ADR-1368](1368-adopt-shadcn-ui.md)（shadcn）、[ADR-2174](2174-facet-overlay.md)

## 背景

プレビューのツールバーは system view のリッチなモデルで 10 個以上のコントロールを並べ、
通常のウィンドウ幅で 2 行に折り返していた。`spike/preview-toolbar-density` で 7 案を実装し、
同一モデル・同一コントロール集合でツールバー高さを実測した（ja / dark / 50-50 分割、
34px = 1 行、61px = 2 行）:

| 案 | 1280px | 1440px | 1680px | 1280px (en) | メニューを開かずに届く数 |
| --- | --- | --- | --- | --- | --- |
| 現状（wrap） | 61 | 61 | 61 | 61 | 10 |
| 出口系を 1 メニューに集約 | 61 | 34 | 34 | 34 | 6 |
| 幅に応じた overflow（`⋯`） | 36 | 36 | 36 | 36 | 5 / 6 / 8 |
| view state を図の上に浮かせる | 34 | 34 | 34 | 34 | 10 |
| 上 2 案のハイブリッド（出口系を 1 メニュー） | 34 | 34 | 34 | 34 | 7 |
| **同（出口系を 3 コントロール）— 採用** | **34** | **34** | **34** | **34** | **9** |
| icon-only + tooltip | 34 | 34 | 34 | 34 | 10 |

3 点が読み取れた。現状は **1680px でも en でも 2 行**なので、これはラベル幅ではなく
コントロール数の問題である。集約だけでは 1280px の ja に届かない。overflow は 1 行にはなるが、
1280px で 11 個中 6 個が `⋯` の中に入り、しかも左詰めで退避するため Export と Focus という
優先度の高い側から消える。

## 決定

プレビューの操作を 2 面に分け、**図を変えるコントロールはドリルパス（パンくず）の行**に、
**図を持ち出すコントロールはツールバー**に置く。

| 面 | 置くもの |
| --- | --- |
| ドリルパスの行（右寄せ） | ◇ アイコンモード / グループ化 / ◎ ファセット / ⊖ すべて畳む / ◇ エンティティ / ⊞ 全レイヤー表示（org view では ⬡ ツリー表示） |
| ツールバー（右寄せ） | `[↓ SVG をエクスポート ǀ ▾]`（▾ = ドリルダウン / 全図 / draw.io / ⊟ 全ビューを開く）、`🔗 Share`、`📖 Docs ▾`（Reference / ドキュメントサイト）、`↗ フォーカス` |

「⊞ 全レイヤー表示」は Issue では出口系に分類されていたが、描かれる図を差し替える操作なので
図側に置く。判断基準を 1 つに保つための整理である。

## 理由

- **判断基準が 1 つになる** — 図を変えるなら行、図を持ち出すならツールバー。今後コントロールが
  増えたとき、置き場所を数え上げずに決められる。
- **ツールバーが折り返さなくなる** — 960px〜1680px の全幅・両ロケールで 34px（1 行）。
- **何も隠れない** — overflow 案と違い、コントロールは幅によって消えない。出口系は 3 つの
  名前付きコントロールに分かれているので、メニューの中身を開く前に予測できる（ファイルを
  書き出すもの＝エクスポート、共有＝単独、読み物＝Docs）。
- **ADR-9009 が無傷** — icon-only 案は実測では最も詰まるが、spike のスクリーンショットでは
  ラベル無しに機能を判別できず、同 ADR を覆すどころか裏づけた。

## 却下した案

### 図の上にフローティングバーとして浮かせる（設計時の採用案）

設計段階ではこれを採り、実装して取り下げた。レイアウト上の高さを消費しない点は魅力だったが、
その節約は図から借りていた — バーが図の左上を覆い、**その下のノードへのクリックを奪った**。
AT-1513 の e2e が `ECommerce` ノードを押せなくなり、Playwright が
`.preview-canvas-controls` を interceptor として名指しした（[TPL-948](../test-perspectives/TPL-948-event-handler-ui-restructure.md)）。
見えないノードは押せないので、テストだけの問題ではない。

**この却下によって、実測の見え方も変わる。** 1280px / ja で、従来はツールバー 61px +
パンくず 28px = 89px、採用案はツールバー 34px + 行 68px = 102px。**縦の総量はほぼ変わらない。**
上の表の 34px は、その差分だけ図を覆うことで得ていた数字だった。この決定が実際に買ったのは
「ツールバーが折り返さないこと」と「置き場所の基準」であって、縦スペースの節約ではない。
縦を本当に削るならコントロール自体の取捨になり、それは本 ADR の範囲外とした。

### 幅に応じた overflow（`⋯ n`）

どの幅でも 1 行になるが、1280px で 11 個中 6 個が隠れる。左詰めで退避するため優先度の高い
コントロールから消え、優先度規則・測定タイミング・ResizeObserver のフィードバックループと、
実装・検証コストが最大だった。

### icon-only + tooltip

最も詰まるが ADR-9009 の改訂が前提になる。spike の結果は同 ADR を裏づけたため採らない。

### 出口系をすべてエクスポートの ▾ に畳む

ツールバーは 2 コントロールまで減るが、共有と Docs もメニューに沈み、届くコントロールが
9 → 7 に減る。1 行に収まる結果が同じなら、メニューの中身が種類で説明できる側を選んだ。

## 影響

- ボタンの位置が変わる。消えたコントロールは無く、「全ビューを開く」だけがエクスポート
  メニューの中に移った。
- `PreviewColumn.tsx` からツールバーが `PreviewToolbar.tsx` と `PreviewViewControls.tsx` に
  分かれ、Group-by の軸テーブルは `preview-group-by.ts` に移った（`GROUP_BY_AXES` は
  `PreviewColumn` から再 export しており、軸追加ガードの import パスは不変）。
- ja の「英語ハードコード無し」ガードは 2 面 + 開いたメニューの portal 内容まで走査する。
  コントロールがドロップダウンへ移ると、帯だけを見る走査は空振りするため。
- ファセット所属一覧パネルがツールバーに食い込むずれは本 ADR とは独立の既存 bug
  （[#2492](https://github.com/kompiro/karasu/issues/2492)）。
