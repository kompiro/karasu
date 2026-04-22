---
id: ADR-20260329-02
title: "KarasuPreviewColumn からの SVG エクスポート責務分離"
status: accepted
date: 2026-03-29
depends_on:
  - ADR-20260328-02
scope:
  packages:
    - app
  domains:
    - ui
    - export
---

# ADR-20260329-02: KarasuPreviewColumn からの SVG エクスポート責務分離

- **日付**: 2026-03-29
- **ステータス**: 決定済み
- **関連**: Issue #131, [ADR-20260328-02](20260328-02-svg-export-two-phase.md)

## 背景

`KarasuPreviewColumn` は SVG プレビュー表示と SVG ダウンロードのトリガーという 2 つの責務を同時に持っていた。`downloadSvg` はブラウザ API（`Blob`, `URL.createObjectURL`, `<a>` クリック）に依存するサイドエフェクト処理であり、SVG を**表示する**コンポーネントが**ダウンロードする**処理まで担うのは責務過多だった。将来的に PNG エクスポート等別フォーマットに対応する場合、`KarasuPreviewColumn` を変更しなければならなくなる。

## 決定

`KarasuPreviewColumnProps` に `onExportSvg: (svg: string, filename: string) => void` を追加し、`downloadSvg` の import を削除する。`KarasuPreviewColumn` は SVG の選択（`activeView` に基づく `systemView.svg` / `deployView.svg` / `orgView.svg`）とファイル名計算（`buildSvgExportFilename`）を内部で行い、結果を callback に渡すだけにする。ブラウザ API 呼び出し（`downloadSvg`）は呼び出し元（`ProjectModeApp`, `MemoryModeApp`, `ServeModeApp`）が担う。

```tsx
// 呼び出し元
<KarasuPreviewColumn
  onExportSvg={(svg, filename) => downloadSvg(svg, filename)}
/>
```

## 理由

- **SVG 選択ロジックの集約**: `KarasuPreviewColumn` がすでに `activeView`・各ビューの `svg`・`breadcrumbItems`・`deployBlocks` 等を受け取っているため、選択ロジックを呼び出し元に移すと 3 箇所に重複する
- **ファイル名計算の集約**: `buildSvgExportFilename` の引数も `KarasuPreviewColumn` 内に揃っているため、計算を呼び出し元に移すと同様に重複する
- **ブラウザ API 依存の分離**: `KarasuPreviewColumn` が `Blob` / `URL.createObjectURL` / `<a>` クリックに依存しなくなる
- **将来の PNG 対応**: 呼び出し元の callback を変えるだけで対応できる
- **呼び出し元の変更最小**: `downloadSvg` の import と 1 行の callback 追加のみ

## 却下した案

### 案A: `onExportSvg: () => void`（純粋な通知のみ）

`KarasuPreviewColumn` が最もシンプルになるが、SVG 選択ロジック（`activeView` に応じた切替）が呼び出し元 3 箇所に重複する。`buildSvgExportFilename` の import も 3 箇所に追加が必要。

### 案C: `onExportSvg: (svg: string) => void`（SVG のみ渡す）

ファイル名計算が呼び出し元 3 箇所に重複する。`KarasuPreviewColumn` がすでに `activeView` を持っているため、中途半端な責務分担になる。

## 残課題

- `onExportSvg` を `required` にするか `optional`（デフォルト noop）にするか — 現状は `required` で運用し、必要になれば変更
