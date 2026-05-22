---
id: ADR-20260522-01
title: SVG 図のライト / ダークテーマ対応（パレット引数 + 解決済み色の埋め込み）
status: accepted
date: 2026-05-22
topic: renderer
related_to: [ADR-20260520-06, ADR-20260312-04]
scope:
  packages: [core, app, cli, vscode]
  concerns: [accessibility]
assumptions:
  - "file: packages/core/src/renderer/palette.ts"
  - "symbol: packages/core/src/renderer/palette.ts :: resolvePalette"
  - "symbol: packages/core/src/builtins/default-style.ts :: BUILTIN_STYLE_SOURCE_LIGHT"
  - "file: packages/core/src/theme-meta.test.ts"
---

# ADR-20260522-01: SVG 図のライト / ダークテーマ対応（パレット引数 + 解決済み色の埋め込み）

- **日付**: 2026-05-22
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1479](https://github.com/kompiro/karasu/issues/1479)
  - PR [#1484](https://github.com/kompiro/karasu/pull/1484)（Design Doc）/ PR [#1485](https://github.com/kompiro/karasu/pull/1485)（実装）
  - [ADR-20260520-06](20260520-06-app-css-modularization-and-light-theme.md) — app.css モジュール化・ライトテーマ（SVG 図は対象外と明記）
  - [ADR-20260312-04](20260312-04-css-inspired-styling.md) — CSS 風スタイリング・built-in stylesheet
  - [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md) — 表示モード / グローバル切替の全描画面点検

## 背景

ADR-20260520-06 で app の chrome（パネル・ツールバー・サイドバー・エディタ）に
ライトテーマが入ったが、レンダリングされる SVG 図そのものは対象外と明記された。
そのため light モードでは「明るい chrome の中に暗い背景の図が乗る」という不整合
が残っていた。原因は `packages/core` の SVG レンダラが色をハードコードしている
ことにある。

色は 2 レイヤーに分かれる。(a) レンダラの構造色（chrome）— キャンバス背景・
凡例・パンくず・タブバー・空状態など約 35 個の hex リテラル。(b) `.krs.style`
カスケードの built-in stylesheet（`default-style.ts`）— ノード / エッジの色。

制約として、SVG は app プレビュー（DOM 内インライン）・`karasu render`
（standalone `.svg`）・VS Code 拡張（プレビュー + export）の 3 経路で消費される。
standalone `.svg` はブラウザ以外（Inkscape・OS の画像プレビュー等）でも開かれ、
それらは CSS `<style>` ブロックや `prefers-color-scheme` メディアクエリを十分に
サポートしないことがある。設計の中心は「standalone SVG が色をどう持ち運ぶか」
だった。

## 決定

`DiagramPalette` 抽象と `theme: "dark" | "light"` 引数を導入し、**解決済みの色を
SVG 属性に直接埋め込む（resolve-and-embed）**。`theme` を `displayMode` と同じ
経路で全 SVG エントリポイントに貫通させ、レンダラの chrome パレットと built-in
stylesheet の light 変種の両方を駆動する。デフォルトは `"dark"` で既存出力は
byte 不変。

- `packages/core/src/renderer/palette.ts` に `DiagramPalette` 型・`darkPalette`
  （現行値）・`lightPalette`・`resolvePalette(theme)` を置く。
- `default-style.ts` に `BUILTIN_STYLE_SOURCE_LIGHT` を追加し、
  `getBuiltinStyleSheet(theme)` が dark / light を別キャッシュで返す。カスケード
  最下層に theme 対応 built-in シートを置き、ユーザー `.krs.style` は従来どおり
  その上で勝つ。
- consumer はそれぞれの実効テーマを渡す。app はテーマ変更で再レンダリングし、
  CLI は `karasu render --theme <dark|light>`、VS Code はエディタのカラーテーマ
  に追従する。app は system / deploy / org / multi-level の view ごとに別フック
  から core を呼ぶため、全フックに `theme` を配線する。

## 理由

- Issue が解きたいのは「app プレビューの図を chrome のテーマに一致させる」こと。
  app は実効テーマを知っており、テーマ変更時に再レンダリングする経路が既にある
  （`displayMode` と同じ）。resolve-and-embed で過不足なく解決できる。
- standalone `.svg` の堅牢性（非ブラウザレンダラでも表示される）は制約であり、
  リテラル色のみを埋め込む方式はこれを満たす。`<style>` / メディアクエリ依存の
  方式はこの制約に反する。
- presentation attribute `fill="..."` は `var()` を確実には解決しないため、
  CSS カスタムプロパティ方式は要素出力の全面改修が必要になり変更量が大きい。
- デフォルト `"dark"` で既存スナップショットが無変更。`theme-meta.test.ts` が
  全 SVG エントリポイントで「theme 省略時 == dark」「dark != light」を検証し、
  TPL-20260510-06 に従って全描画面の追従を回帰テストで担保する。

## 却下した案

- **SVG 内 `<style>` + CSS カスタムプロパティ + `prefers-color-scheme`**:
  standalone SVG が閲覧環境の OS テーマに自動追従できる利点はあるが、
  presentation attribute での `var()` 非互換、ブラウザ以外の SVG レンダラでの
  メディアクエリ / `<style>` 非対応、app が OS と異なるテーマを強制できない、
  という問題がある。standalone の堅牢性という制約に反するため却下した。
- **ハイブリッド（`prefers-color-scheme` と `data-theme` 属性の両対応 `<style>`）**:
  自動追従と強制切替を両立できるが、上記の `var()` / 非ブラウザレンダラ問題を
  抱えたまま機構が最も複雑になる。本 Issue の要求に対し過剰なため却下した。
- standalone SVG を OS テーマに追従させる `karasu render --theme auto`
  （メディアクエリ出力）は本 Issue の要求ではないため見送り、要望があれば
  resolve-and-embed の上に追加機構として検討する。
