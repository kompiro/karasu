# ADR-0073: CLI `karasu serve` モード — ローカル `.krs` のリアルタイムプレビュー

- **日付**: 2026-03-28
- **ステータス**: 決定済み
- **関連**: [ADR-0053](20260317-02-project-and-filesystem.md)

## 背景

従来の karasu はブラウザ内（OPFS またはメモリ）でファイルを管理していたが、実際のアーキテクチャ記述では `.krs` ファイルをローカルの git リポジトリで管理したいニーズがあった：

- チームで diff・レビューしたい
- コードと同じリポジトリに置きたい
- VS Code 等、使い慣れたエディタで書きたい
- CI でアーキテクチャ図を生成したい

## 決定

`karasu serve <dir>` コマンドを `packages/cli` に追加し、ローカルディレクトリの `.krs` ファイルをリアルタイムプレビューする HTTP サーバーを立ち上げる。ブラウザ版（standalone モード）と UI コードを共用する。

### システム構成

```
packages/cli (Node.js)
  ├─ HTTP Server
  │   ├─ GET /api/files            ← .krs ファイル一覧
  │   ├─ GET /api/file/:name       ← ファイル内容
  │   ├─ GET /api/watch (SSE)      ← ファイル変更通知
  │   ├─ GET /assets/*             ← build 済み app アセット
  │   └─ GET /*  → index.html      ← SPA fallback
  └─ FS Watcher（chokidar）
       └─ ./arch/**/*.krs

Browser (packages/app) serve モード:
  Monaco 非表示、URL → ファイル名解決
```

### ルーティング

| URL | 解決先 |
|---|---|
| `/` | `index.krs` |
| `/:name` | `${name}.krs` |

`index.krs` がない場合、`.krs` が 1 ファイルのみなら自動選択、複数あればエラー画面で候補一覧を表示する。

`/api/file/:name` は `/api` 名前空間に閉じるため、`api.krs` というファイル名でも衝突しない。

### app のモード判定

`packages/app` は serve モードと standalone モードを共用する。起動時に `/api/files` に `AbortSignal.timeout(500)` 付きでアクセスし、成功すれば `serve`、失敗すれば `standalone` と判定する。

| 機能 | serve モード | standalone モード |
|---|---|---|
| Monaco Editor | 非表示 | 表示 |
| ファイルソース | `/api/file/:name` | ブラウザ内メモリ / OPFS |
| ファイルツリー | `/api/files` | OPFS |
| リアルタイム更新 | SSE (`/api/watch`) | Monaco onChange |

### API 仕様

- `GET /api/files` → `{ "files": ["index", "system", "services/ecommerce"] }`（拡張子なし、サブディレクトリは `/` 区切り）
- `GET /api/file/:name` → テキスト（404 if not found）
- `GET /api/watch` → Server-Sent Events `event: change\ndata: {"file": "index"}`

### 配布

CLI は npm publish 時に `karasu` コマンドとして提供し、build 済みの `packages/app` アセットを `packages/cli` に同梱する。

## 理由

- **`packages/core` をそのまま活用できる**: Pure TypeScript のため CLI から直接使える
- **git 管理・エディタ統合・CI との相性**: ローカルファイルを直接扱うことでエコシステムとの親和性が高い
- **モード自動判定**: `/api/files` の到達可否で判定することで、同じブラウザバンドルが standalone と serve の両方に対応できる
- **SSE による更新通知**: WebSocket より軽量で、HTTP 接続だけで完結する。プレビュー用途には SSE で十分
- **chokidar による FS 監視**: Node.js エコシステムの事実上の標準ライブラリで、クロスプラットフォームでの動作実績が豊富

## 却下した案

### 案C: VS Code 拡張として実装する

エディタ統合が最も自然で git 操作も VS Code が担うが、拡張機能のメンテナンスが必要で別パッケージ・別リリースフローになる。CLI 版とのコードベース分離管理も必要。serve モードが安定したあとに ADR-0070（LSP-first VSCode 拡張）として並行展開する方針にした。

## 残課題

- ファイルツリーサイドバーを Phase 1 から含めるか Phase 2 に先送りするか
- サブディレクトリの URL 表現（`/services/ecommerce` vs クエリパラメータ）
- `karasu build <dir> -o <outdir>` でのビルドモードを将来追加するか
- app アセット同梱方法（`npm pack` 時に `dist/` を含める vs CDN 経由）
- SSE 切断時のブラウザ側リトライ戦略
