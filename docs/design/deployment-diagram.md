# Deployment 図のサポートと System 図との行き来

- **日付**: 2026-03-23
- **ステータス**: 完了
- **関連**: [`docs/spec/syntax.md`](../spec/syntax.md) — deploy ブロック構文, [`docs/concepts.md`](../concepts.md) — 論理/物理分離, [ADR-0011](../adr/0011-deployment-diagram-design.md) — 設計決定の記録

## 背景・課題

karasu の `.krs` 構文には既に `deploy` ブロックが定義されており、`realizes` で論理構造（service）と物理構造（deploy ユニット）を対応付けられる。
しかし UI が system 図しかレンダリングしておらず、物理構造を可視化する手段がなかった。

## 目的

- `deploy` ブロックをレンダリングして **deploy 図** として表示する
- system 図と deploy 図を **タブ切り替え ＋ クリックジャンプ** で行き来できる
- deploy 図の主眼は「**どのサービスがどの技術スタックで構成されているか、関係サービスは何か**」を伝えること

## 設計決定

### Deploy 図のレイアウト

**フラット配置 ＋ `realizes` によるコンテナグループ化**

同じ service を `realizes` する deploy ユニットを、ラベル付きの枠（コンテナ）で囲む。
コンテナのラベルは `realizes` が指す service 名。

```
┌─ ECサイト ─────────────────────┐
│  [order-api]   [order-worker]  │
│  Node.js 20    Node.js 20      │
└────────────────────────────────┘

┌─ 決済サービス ──┐    ┌─ 未分類 ─────┐
│  [payment-svc]  │    │ [migration]   │
│  Go 1.22        │    │               │
└─────────────────┘    └──────────────┘
```

`realizes` が未指定の deploy ユニットは「未分類」コンテナに配置する。

### Ghost エッジ

system 図のエッジ（`ECommerce -> Payment`）を deploy 図のコンテナ間に
**ghost（半透明・破線）** で表示する。エッジはユニット間ではなく **コンテナ間** に引く。

### ファイル構成

任意分離 — `system` と `deploy` ブロックは同一ファイルでも別ファイルでも動作する。
小さく始めて育ったら extract するパターンと一致する。

### System ↔ Deploy の行き来

#### タブ切り替え

プレビューペイン上部に `System` / `Deploy` タブを追加。
deploy ブロックが存在しない場合は `Deploy` タブをグレーアウトし「deploy ブロックがありません」と表示。

#### クリックジャンプ（Deploy → System のみ）

| 操作 | 動作 |
|---|---|
| deploy 図のコンテナをクリック | system 図に切り替え、対応する service ノードをハイライト |

ハイライトは他のノードをクリックするまで維持する。

> Note: system 図からのクリックジャンプはドリルダウンと競合するため未実装。

### 各 deploy 種別のカラーコード

| 種別 | 背景色 | ボーダー |
|---|---|---|
| `oci` | #1E3A5F | #3B82F6（青） |
| `lambda` | #3B1F5F | #A855F7（紫） |
| `jar` | #1F3B2A | #22C55E（緑） |
| `war` | #3B2A1F | #F97316（オレンジ） |
| `function` | #2D3B1F | #EAB308（黄） |
| `assets` | #1F3B3B | #06B6D4（シアン） |
| `job` | #3B2222 | #EF4444（赤） |
| `artifact` | #2D2D2D | #9CA3AF（グレー） |

## 実装概要

### 新規ファイル（Core）

- `packages/core/src/view/deploy-view-extract.ts` — `realizes` グループ化・ghost エッジ抽出
- `packages/core/src/renderer/deploy-layout.ts` — コンテナ横並びレイアウト
- `packages/core/src/renderer/deploy-renderer.ts` — deploy SVG レンダリング

### 変更ファイル（Core）

- `renderer/layout.ts` — `LayoutNode.kind` を `LogicalNodeKind | DeployNodeKind` に拡張
- `renderer/svg-renderer.ts` — `renderFromLayout()` を切り出してエクスポート
- `index.ts` — `diagramType` パラメータ・`hasDeployDiagram`・新型エクスポート追加

### 変更ファイル（App）

- `state/app-reducer.ts` — `diagramType`, `highlightedNodeId` 追加
- `hooks/useKarasuProject.ts` — `diagramType` パラメータ・`hasDeployDiagram` 返却
- `components/DiagramTabBar.tsx` — タブ UI（新規）
- `components/PreviewPane.tsx` — コンテナクリック・ハイライト対応
- `ProjectModeApp.tsx` — 全体の配線
- `styles/app.css` — タブ・ハイライトスタイル追加

## 将来スコープ（今回対象外）

- [#28](https://github.com/kompiro/karasu/issues/28) インフラ構成図（prod/staging 環境差異、クラスタ、リージョンのトポロジー）— 新しい図種として別途設計
- [#29](https://github.com/kompiro/karasu/issues/29) System 図からのクリックジャンプ（ドリルダウンとの競合を解決してから）
- [#30](https://github.com/kompiro/karasu/issues/30) deploy ノードのスタイルシステム統合（現在はハードコードのカラー）
- [#31](https://github.com/kompiro/karasu/issues/31) 複数の deploy ブロック対応（現在は最初のブロックのみ使用）
