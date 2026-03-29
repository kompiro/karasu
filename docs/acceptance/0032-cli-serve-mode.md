# AT-0032: CLI serve mode

## 概要

`karasu serve <dir>` コマンドでローカルの `.krs` ファイルをリアルタイムプレビューできる。

## 前提条件

- Node.js 環境がある
- `packages/cli` がビルド済み（`npm run build`）
- テスト用ディレクトリに `index.krs` が存在する

## テストケース

### TC-01: サーバー起動

**手順**:
1. テスト用ディレクトリを作成し `index.krs` を置く
2. `node packages/cli/dist/index.js serve <dir>` を実行する

**期待結果**:
- `Serving <dir> at http://localhost:3000` のようなメッセージが表示される
- ブラウザで `http://localhost:3000` にアクセスできる

---

### TC-02: index.krs のプレビュー

**手順**:
1. TC-01 の状態でブラウザを開く

**期待結果**:
- Monaco Editor が表示されない（エディタペインが非表示）
- `index.krs` の内容がプレビューとしてレンダリングされる

---

### TC-03: 複数ファイルの URL ルーティング

**手順**:
1. テスト用ディレクトリに `index.krs` と `system.krs` を置く
2. サーバー起動後、`http://localhost:3000/system` にアクセスする

**期待結果**:
- `system.krs` の内容がプレビューとしてレンダリングされる

---

### TC-04: リアルタイム更新

**手順**:
1. ブラウザで `http://localhost:3000` を開く
2. 外部エディタで `index.krs` を編集・保存する

**期待結果**:
- ブラウザが自動的にリロードまたは再レンダリングされる
- 編集内容が反映される

---

### TC-05: index.krs が存在しない場合のフォールバック

**手順**:
1. `index.krs` を含まず `system.krs` 1 ファイルのみのディレクトリでサーバーを起動する
2. `http://localhost:3000` にアクセスする

**期待結果**:
- `system.krs` が自動的に選択されてプレビューされる

---

### TC-06: 存在しないファイルへのアクセス

**手順**:
1. `http://localhost:3000/nonexistent` にアクセスする

**期待結果**:
- エラー画面またはファイルが見つからない旨のメッセージが表示される

---

## 自動検証項目

- `GET /api/files` が `.krs` ファイル一覧を返す
- `GET /api/file/index` が `index.krs` の内容を返す
- `GET /api/file/nonexistent` が 404 を返す
- `GET /api/watch` が SSE ストリームを返す
