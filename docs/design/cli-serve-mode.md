# CLI serve モード

- **日付**: 2026-03-28
- **ステータス**: ドラフト
- **関連**: [プロジェクトとファイルシステム抽象化](project-and-filesystem.md), [.krs 構文リファレンス](../spec/syntax.md)

## 背景・課題

現状の karasu はブラウザ内（OPFS またはメモリ）でファイルを管理する。
しかし実際のアーキテクチャ記述では、`.krs` ファイルをローカルの git リポジトリで管理したいニーズがある。

- チームで diff・レビューしたい
- コードと同じリポジトリに置きたい
- VS Code 等、使い慣れたエディタで書きたい
- CI でアーキテクチャ図を生成したい

このニーズに応えるため、ローカルの `.krs` ファイルをリアルタイムプレビューする CLI コマンド `karasu serve` を導入する。

## 制約・前提

- `packages/core` は Pure TypeScript で環境依存なし。CLI からそのまま利用できる
- ブラウザ版（standalone モード）との UI コード共有が望ましい
- ファイルの編集・git 操作はユーザーの外部ツール（エディタ・ターミナル）が担う
- ルーティングは SPA パターンで実装し、サーバー側の複雑さを最小化する

## システム構成

```
karasu serve ./arch/
      │
      ▼
┌─────────────────────────────────┐
│ packages/cli (Node.js)          │
│                                 │
│  ┌─ HTTP Server ───────────┐   │
│  │ GET /api/files           │   │  ← .krs ファイル一覧
│  │ GET /api/file/:name      │   │  ← ファイル内容
│  │ GET /api/watch  (SSE)    │   │  ← ファイル変更通知
│  │ GET /*  → index.html     │   │  ← SPA fallback
│  │ GET /assets/*            │   │  ← build 済み app アセット
│  └─────────────────────────┘   │
│                                 │
│  FS Watcher (chokidar 等)       │
│   └── ./arch/**/*.krs           │
└─────────────────────────────────┘
      │ SSE
      ▼
┌─────────────────────────────────┐
│ Browser (packages/app)          │
│  serve モード: Monaco 非表示    │
│  URL → ファイル名 解決          │
│  /          → index.krs         │
│  /system    → system.krs        │
└─────────────────────────────────┘
```

## ルーティング設計

アプリは SPA として動作し、URL パスをファイル名に変換してAPIからコンテンツを取得する。

| URL | 解決先ファイル |
|-----|----------------|
| `/` | `index.krs` |
| `/:name` | `${name}.krs` |

### index.krs が存在しない場合のフォールバック

1. ディレクトリ内に `.krs` が 1 ファイルのみ → そのファイルを自動選択
2. 複数存在するが `index.krs` がない → エラー画面（候補一覧を表示）

### `/api` との衝突回避

ファイル名の解決は `/api/file/:name` 名前空間に閉じるため、`api.krs` というファイルが存在しても衝突しない。

## app のモード判定

`packages/app` は serve モードと standalone モードを共用する。
起動時に `/api/files` にアクセス可能かで自動判定する。

```typescript
async function detectAppMode(): Promise<'serve' | 'standalone'> {
  try {
    const res = await fetch('/api/files', { signal: AbortSignal.timeout(500) });
    if (res.ok) return 'serve';
  } catch {
    // fallthrough
  }
  return 'standalone';
}
```

| 機能 | serve モード | standalone モード |
|------|-------------|------------------|
| Monaco Editor | 非表示 | 表示 |
| ファイルソース | `/api/file/:name` | ブラウザ内メモリ / OPFS |
| ファイルツリー | `/api/files` から取得（オプション） | OPFS から取得 |
| リアルタイム更新 | SSE (`/api/watch`) | Monaco onChange |

## API 仕様

### GET /api/files

ディレクトリ内の `.krs` ファイル一覧を返す。

```json
{
  "files": ["index", "system", "services/ecommerce"]
}
```

ファイル名は拡張子 `.krs` を除いた形式で返す。サブディレクトリは `/` 区切りのパスで表現する。

### GET /api/file/:name

指定ファイルの内容を返す。

- `:name` は `index`、`system`、`services/ecommerce` 等（拡張子なし）
- 対応する `.krs` ファイルが存在すればテキストで返す
- 存在しなければ `404`

### GET /api/watch (SSE)

ファイル変更を Server-Sent Events でブラウザに通知する。

```
event: change
data: {"file": "index"}

event: change
data: {"file": "system"}
```

## パッケージ構成

```
packages/
├── core/          ← 変更なし
├── app/           ← serve モード対応を追加
└── cli/           ← 新規
    ├── package.json
    ├── src/
    │   ├── index.ts        ← CLI エントリポイント（commander 等）
    │   ├── serve.ts        ← serve コマンド実装
    │   └── watcher.ts      ← FS ウォッチャー
    └── tsconfig.json
```

CLI は npm publish 時に `karasu` コマンドとして提供する。
build 済みの `packages/app` アセットを `packages/cli` に同梱する。

## 検討した選択肢

### 案A: CLI + ファイルウォッチ（本案）

上記の構成。serve コマンドがローカルサーバーを立ち上げ、ブラウザにプレビューを提供する。

**メリット**:
- git 管理、エディタ、CI との相性が良い
- `packages/core` をそのまま活用できる
- 実装範囲が明確

**デメリット**:
- app アセットの同梱・配布が必要
- ユーザーは Node.js 環境が必要

### 案C: VS Code 拡張

`.krs` ファイルを開いたときにサイドパネルでプレビューを表示する。

**メリット**:
- エディタとの統合が最も自然
- git 操作は VS Code が担う

**デメリット**:
- 拡張機能のメンテナンスが必要（別パッケージ・別リリースフロー）
- 案Aとコードベースを分離管理する必要がある

## 現時点の方針

**案A（CLI serve モード）を先行実装する。**

理由:
1. 案Cより実装コストが低く、早期に価値を提供できる
2. CLI が安定したあと、案Cへ発展させる道が残る（core・app の再利用）
3. CI での図生成（`karasu build`）にも発展させやすい

## 未解決の問い

- ファイルツリーサイドバーは Phase 1 から含めるか、Phase 2 に先送りするか
- サブディレクトリ（`services/ecommerce.krs`）の URL 表現をどうするか（`/services/ecommerce` or クエリパラメータ）
- `karasu build <dir> -o <outdir>` でSVGファイルを出力するビルドモードを将来追加するか
- app アセットの同梱方法（`npm pack` 時に `dist/` を含める、または CDN 経由）
- SSE が切断された場合のブラウザ側リトライ戦略
