# KarasuPreviewColumn からSVGエクスポート責務を分離するリファクタリング

- **日付**: 2026-03-29
- **ステータス**: ドラフト
- **関連**: [Issue #131](https://github.com/kompiro/karasu/issues/131), [SVGエクスポート設計](svg-export.md)

## 背景・課題

`KarasuPreviewColumn` は現在、以下の2つの責務を同時に持っている。

1. **SVGプレビューの表示**: `PreviewPane` を通じてSVGを表示し、ドリルダウン操作を受け付ける
2. **SVGダウンロードのトリガー**: "Export SVG" ボタンのクリックで `downloadSvg` を直接呼び出す

該当するコード（`KarasuPreviewColumn.tsx`）:

```tsx
import { downloadSvg } from "../utils/download-svg.js";
import { buildSvgExportFilename } from "../utils/build-svg-export-filename.js";

// コンポーネント内部
const exportFilename = buildSvgExportFilename(activeView, {
  breadcrumbItems: ...,
  deployBlocks,
  selectedDeployBlockId,
});

<button onClick={() => downloadSvg(svg, exportFilename)}>
  ↓ Export SVG
</button>
```

`downloadSvg` はブラウザ API（`Blob`, `URL.createObjectURL`, `<a>` クリック）に依存するサイドエフェクト処理であり、
SVGを**表示する**コンポーネントが**ダウンロードする**処理まで担うのは責務過多である。

また、将来的に PNG エクスポートなど別フォーマットに対応する場合、`KarasuPreviewColumn` を変更しなければならなくなる。
エクスポート形式の決定は呼び出し元（`ProjectModeApp`, `MemoryModeApp`, `ServeModeApp`）が担うべきである。

## 制約・前提

- 純粋なリファクタリングであり、**動作に変化はない**
- `downloadSvg` および `buildSvgExportFilename` ユーティリティ自体は変更しない
- 3つの呼び出し元（`ProjectModeApp`, `MemoryModeApp`, `ServeModeApp`）すべてに変更が必要
- 既存のテスト（`KarasuPreviewColumn.test.tsx`）が壊れないこと

## 検討した選択肢

### 案A: `onExportSvg: () => void`（純粋な通知）

`KarasuPreviewColumn` はボタンクリック時に「エクスポートが要求された」という通知のみを行い、
SVGの取得・ファイル名の計算・ダウンロードはすべて呼び出し元が担う。

```tsx
// KarasuPreviewColumn.tsx（変更後）
interface KarasuPreviewColumnProps {
  onExportSvg: () => void;
  // downloadSvg・buildSvgExportFilename の import を削除
}

<button onClick={onExportSvg}>↓ Export SVG</button>
```

```tsx
// ProjectModeApp.tsx（変更後）
const currentSvg = activeView === "system" ? systemSvg : ...;
const filename = buildSvgExportFilename(activeView, { ... });

<KarasuPreviewColumn
  onExportSvg={() => downloadSvg(currentSvg, filename)}
/>
```

**メリット**
- `KarasuPreviewColumn` が最もシンプルになる。`buildSvgExportFilename` の import も不要
- 呼び出し元が完全に制御できる（将来のPNG対応も呼び出し元だけを変更）

**デメリット**
- 3つの呼び出し元それぞれに `buildSvgExportFilename` の import と呼び出しが追加される
- SVG選択ロジック（`activeView` に基づく `systemView.svg` / `deployView.svg` / `orgView.svg` の切り替え）が呼び出し元に複製される

---

### 案B: `onExportSvg: (svg: string, filename: string) => void`（計算は内部、実行は外部）

`KarasuPreviewColumn` はSVGの選択とファイル名の計算（すでに内部で行っている）を担い、
その結果を callback に渡す。ブラウザAPIの呼び出し（`downloadSvg`）のみ呼び出し元に移動する。

```tsx
// KarasuPreviewColumn.tsx（変更後）
interface KarasuPreviewColumnProps {
  onExportSvg: (svg: string, filename: string) => void;
  // downloadSvg の import を削除（buildSvgExportFilename は残す）
}

<button onClick={() => onExportSvg(svg, exportFilename)}>
  ↓ Export SVG
</button>
```

```tsx
// ProjectModeApp.tsx（変更後）
<KarasuPreviewColumn
  onExportSvg={(svg, filename) => downloadSvg(svg, filename)}
/>
```

**メリット**
- SVG選択・ファイル名計算ロジックは `KarasuPreviewColumn` に集約されたまま（重複なし）
- 呼び出し元の変更が最小（`downloadSvg` の import と1行の callback 追加のみ）
- 将来 PNG 対応する場合は呼び出し元の callback を変えるだけで済む

**デメリット**
- `KarasuPreviewColumn` に `buildSvgExportFilename` の import が残る
- `onExportSvg` の引数が「何のために使うか」が signature から自明でない（`(svg, filename)` はダウンロード前提の命名）

---

### 案C: `onExportSvg: (svg: string) => void`（SVGのみ渡す）

`KarasuPreviewColumn` はどの SVG を渡すかだけを決め、ファイル名の決定は呼び出し元に委ねる。

```tsx
// KarasuPreviewColumn.tsx（変更後）
<button onClick={() => onExportSvg(svg)}>↓ Export SVG</button>
```

```tsx
// ProjectModeApp.tsx（変更後）
<KarasuPreviewColumn
  onExportSvg={(svg) => {
    const filename = buildSvgExportFilename(activeView, { ... });
    downloadSvg(svg, filename);
  }}
/>
```

**メリット**
- `onExportSvg(svg)` は「SVGコンテンツを受け取って何かする」という汎用的なシグネチャ

**デメリット**
- ファイル名計算が呼び出し元に分散する（3箇所に `buildSvgExportFilename` が追加される）
- `KarasuPreviewColumn` がすでに `activeView` や各 view の svg を保持しているため、中途半端な責務分担になる

## 比較

| 観点 | 案A（通知のみ） | 案B（svg+filenameを渡す） | 案C（svgのみ渡す） |
|------|--------------|------------------------|-----------------|
| `KarasuPreviewColumn` の変更量 | 最大（import 2つ削除） | 中（import 1つ削除） | 小（import 1つ削除） |
| 呼び出し元の変更量 | 最大（3箇所に計算ロジック追加） | 最小（1行追加のみ） | 中（3箇所にfilename計算追加） |
| 将来の PNG 対応 | ◎ 呼び出し元だけ変更 | ◎ 呼び出し元だけ変更 | ○ 呼び出し元だけ変更 |
| コードの重複 | △ SVG選択ロジックが重複 | ○ 重複なし | △ filename計算が重複 |
| `KarasuPreviewColumn` の純粋さ | ◎ ブラウザAPI依存ゼロ | ○ buildSvgExportFilenameは残る | ○ |

## 現時点の方針

**案B を採用する。**

`KarasuPreviewColumn` がすでに `activeView`・各 view の props・`breadcrumbItems`・`deployBlocks` 等を受け取っており、
SVGの選択とファイル名の計算ロジックを呼び出し元に移動するとコードが3箇所に重複する（案A・案C）。

案Bは「ブラウザAPIを呼ぶサイドエフェクト処理を呼び出し元に移動する」という目的を達成しつつ、
ロジックの重複を避けるバランスの良い分割である。

### 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `KarasuPreviewColumn.tsx` | `downloadSvg` import 削除、`onExportSvg: (svg: string, filename: string) => void` prop 追加 |
| `KarasuPreviewColumn.test.tsx` | `onExportSvg` prop を `makeProps` に追加、Export SVG ボタンクリックのテスト修正 |
| `ProjectModeApp.tsx` | `downloadSvg` import 追加、`onExportSvg` prop に `downloadSvg` 呼び出しを渡す |
| `MemoryModeApp.tsx` | 同上 |
| `ServeModeApp.tsx` | 同上 |

## 未解決の問い

1. `onExportSvg` を `required` にするか `optional`（デフォルト: noop）にするか
   - Export SVG ボタンを常に表示する設計であれば `required` が明確
   - `ServeModeApp` など一部のモードでエクスポートが不要になる将来を考えると `optional` も選択肢
2. Phase 2（案Cドリルダウン SVG）実装時、`onExportSvg` のシグネチャを変更する必要があるか
   - 全体ビューモード時は multi-level SVG を渡すことになるため、`svg` の渡し方は引き続き `KarasuPreviewColumn` 内部で決定される見込み
   - 今回の案Bのシグネチャ `(svg: string, filename: string)` のままで対応可能と思われる
