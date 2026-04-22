---
id: ADR-20260328-02
title: SVG エクスポートの 2 フェーズ実装（現在ビュー + Full View 単一ファイル）
status: accepted
date: 2026-03-28
depends_on:
  - ADR-20260317-01
  - ADR-20260320-01
scope:
  packages:
    - core
  domains:
    - rendering
    - export
---

# ADR-20260328-02: SVG エクスポートの 2 フェーズ実装（現在ビュー + Full View 単一ファイル）

- **日付**: 2026-03-28（2026-03-30 更新）
- **ステータス**: 決定済み
- **関連**: Issue #22, [ADR-20260317-01](20260317-01-two-layer-rendering.md), [ADR-20260320-01](20260320-01-interactive-svg-rendering.md)

## 背景

karasu のプレビューは React + DOM イベント委譲でドリルダウン・パン/ズームを実現しているが、図を他者と共有したりドキュメントに埋め込む際にはスタンドアローンなファイルが必要になる。加えてアプリ内でも「全ドリルダウンレベルを一度に閲覧できる Full View」をツールバーで切り替えられるようにし、**アプリ内の全体ビューとエクスポートされる SVG は同一のもの**を使う方針とした。

`core` が生成する SVG にはすでに `data-node-id`・`data-has-children` 属性が含まれており、これを活用して JavaScript 不要のドリルダウン対応 SVG を生成できる。

## 決定

2 フェーズで実装する。

### Phase 1: 現在ビュー Export（案A）

- ツールバーに「Export SVG」ボタンを追加（アイコン + テキストラベル、ADR-20260323-02 準拠）
- 現在の `svg` 文字列を `image/svg+xml` の Blob としてダウンロード
- ファイル名: `{diagram-label}-{activeView}.svg`
- `core` への変更なし

### Phase 2: Full View + 単一 SVG エクスポート（案C）

- `core` に `buildExportSvg(source, options?): string` を追加
  - 全ドリルダウンレベルを縦に積み上げた単一 SVG を返す（各レベルは `<g transform="translate(0, cumulativeY)">` で配置）
  - 各レベルに breadcrumb (`<a href="#krs-view-...">`) を付与してハッシュナビゲーションでレベル間移動可能
  - JavaScript 不要 / Pure TS / ブラウザ API 非依存
- アプリ側ではツールバーに「全体ビュー」トグルボタンを追加
  - ON: `<iframe srcdoc={multiLevelSvg}>` でプレビューエリアを置き換え（親ページの URL フラグメント汚染を防ぐ）
  - Export SVG ボタンは全体ビュー ON 時に multi-level SVG を、OFF 時に現在ビュー SVG をダウンロード
- 対象ビュー
  - **System ビュー**: 最大 4 深度（service / domain / usecase / resource）
  - **Org ビュー**: 最大 10 深度（実用上の上限）
  - **Deploy ビュー**: フラットなコンテナビューなので Full View 非対応（ボタン非表示）

## 理由

- **2 フェーズ分割**: Phase 1 は最小実装で即座に「図を他者と共有したい」ニーズを満たす。Phase 2 は設計・実装量が大きいため段階分離する
- **単一 SVG + ハッシュナビゲーション**: 単一ファイルで完結し、ZIP ライブラリ依存がなく、モダンなブラウザ・SVG ビューアで動作する。`core` パッケージに純粋関数として実装できブラウザ非依存
- **全レベル縦積み**: 当初は CSS `:target + :has()` による 1 レベル表示切替を想定したが、Full View の定義（全レベル同時表示）に合わせて縦積みスクロール方式に変更した。これにより `sandbox=""`（最大制限）の iframe でも動作する
- **iframe による分離**: SVG 内のハッシュリンクが親ページの URL に漏れるのを防ぐため、アプリ内では `<iframe srcdoc>` で表示し、エクスポート時は同じ文字列をそのまま Blob として出力する（表示とエクスポートの完全一致）
- **Deploy ビュー非対応**: フラットなコンテナビューでドリルダウン構造がない

## 却下した案

### 案B: 複数 SVG ファイルを ZIP でダウンロード

ZIP ライブラリ (`fflate` 等) の追加依存が必要で、複数ファイル間のリンクはローカルファイルシステムでのみ動作（HTTP 経由で相対パス問題が発生しやすい）。実装コストが案 C 同等以上に高い。

### CSS `:target` + `:has()` による 1 レベル表示切替

Full View の定義（全レベル同時表示）と合わなくなり、スクロール可能な縦積み方式に変更した。

## 未解決の課題

- ファイル名のフォールバック（diagram ラベルがない場合の `diagram.svg` 等）
- 大規模図のサイズ制限と警告表示
- 戻るボタンのデザイン統一
- iframe のアクセシビリティ追加対応
