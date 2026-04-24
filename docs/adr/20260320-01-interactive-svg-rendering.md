---
id: ADR-20260320-01
title: インタラクティブ SVG レンダリングと NodeDetailPanel
status: accepted
date: 2026-03-20
topic: renderer
depends_on:
  - ADR-20260320-02
  - ADR-20260317-01
scope:
  packages:
    - core
    - app
---

# ADR-20260320-01: インタラクティブ SVG レンダリングと NodeDetailPanel

- **日付**: 2026-03-20
- **ステータス**: 決定済み
- **関連**: [ADR-20260320-02](20260320-02-ast-restructure-discriminated-union.md), [ADR-20260317-01](20260317-01-two-layer-rendering.md)

## 背景

AST 再構成により各ノードが `description`（複数行 Markdown）、`link`（複数 URL）、`team` 等のリッチなプロパティを持つようになった。これらをどのように図上で表現し、ユーザーが操作できるようにするかを設計する必要があった。従来の SVG レンダリングはドリルダウンクリックとパン/ズームのみで、リッチプロパティへのアクセス手段が無かった。

## 決定

ノード情報を 3 つの表示レイヤーに分けて段階的に提示する：

| レイヤー | タイミング | 内容 |
|---|---|---|
| **常時表示** | 図上に常時 | label, description サマリ（1 行・約 50 文字）, link 数, team |
| **ホバーヒント** | マウスホバー | ツールチップ風情報 |
| **詳細パネル** | クリック（leaf）または `[ⓘ]` ボタン | Markdown 全文, link 一覧, 全プロパティ |

### `data-*` 属性によるメタデータ埋め込み

```xml
<g data-node-id="ECommerce"
   data-node-kind="service"
   data-has-children="true"
   data-has-description="true"
   data-link-count="2">
```

description 全文や link URL は `data-*` に入れず、`CompileResult.nodeMetadata: Map<string, NodeMetadata>` から取得する（SVG サイズを最小化）。

### CompileResult の拡張

```typescript
interface CompileResult {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;  // 追加
}
```

### NodeDetailPanel（React HTML オーバーレイ）

詳細パネルは SVG の上に React で描画する HTML オーバーレイとし、Markdown レンダリング・リンククリック・スクロールを HTML として実装する。

### クリック判定

- 子を持つノードのボディクリック → ドリルダウン
- 子を持つノードの `[ⓘ]` クリック → 詳細パネル
- leaf ノードクリック → 詳細パネル
- link アイコンクリック → 外部 URL を新タブで開く（複数なら詳細パネルの link セクションを開く）

### resource のタグベースデフォルト shape

スタイルリゾルバの組み込みルールで `resource[table] { shape: cylinder; }` 等を提供し、`.krs.style` で上書き可能とする。

### SVG エクスポート時のリンク

純粋な SVG エクスポート時は `<a href="..." target="_blank">` を埋め込み、SVG ビューアでもクリック可能にする。

## 理由

- **3 レイヤー分離**: ノード上は情報を絞ってノイズを抑え、詳細はオンデマンドで開く方式が認知負荷を最小化する
- **`data-*` 最小化**: SVG 文字列に description 全文を埋めるとファイルサイズが膨らむ。`nodeMetadata` を別マップとして渡せばアプリ層が必要なときだけ参照できる
- **HTML オーバーレイ**: Markdown レンダリング・スクロール・リンクは HTML の方が圧倒的に実装が楽。SVG 内に書こうとすると `<foreignObject>` 依存になる
- **`marked` + `dompurify`**: 軽量 Markdown ライブラリ + XSS 対策の組み合わせが SPA 用途で実績ある
- **タグベース shape をビルトインで提供**: ユーザーが何も書かなくても resource の種別が伝わる

## 決定済みの細部

- **Markdown レンダリングライブラリ**: `marked` + `dompurify`
- **イベント伝播**: NodeDetailPanel は `stopPropagation` で背面のパン/ズーム操作と干渉しない
- **link ラベル未指定時**: URL をフォールバック表示

## 残課題

- 詳細パネルの表示アニメーション
- モバイル/タッチ環境での代替インタラクション
- メタ行のズームレベル別表示閾値
- info ボタンの常時表示 vs ホバー時のみ
