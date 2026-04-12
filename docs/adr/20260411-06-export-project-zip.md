# ADR-0068: Export Project as ZIP — `fflate` による OPFS エクスポート

- **日付**: 2026-04-11
- **ステータス**: 決定済み
- **関連**: Issue #461, [ADR-0053](20260317-02-project-and-filesystem.md), [ADR-0051](20260407-03-project-selector-operations.md)

## 背景

ProjectMode では `.krs` / `.krs.style` ファイルをすべてブラウザの OPFS に保存する。OPFS はサンドボックス内の仮想ファイルシステムでユーザーは通常のファイルマネージャーからアクセスできず、以下のユースケースが実現できなかった：

- **バックアップ**: プロジェクトファイルをローカルに保存しておきたい
- **共有**: 別のユーザー・環境にプロジェクトを渡したい
- **マイグレーション**: CLI や VS Code 拡張など別環境に持ち込みたい

## 決定

### 1. ZIP ライブラリ: `fflate`

バンドルサイズ約 12 KB（gzip）、TypeScript 型同梱、同期 `zipSync({ "path/to/file": Uint8Array })` の直感的な API。

```ts
import { zipSync, strToU8 } from "fflate";

const files: Record<string, Uint8Array> = {
  "index.krs": strToU8(content),
  "services/ecommerce.krs": strToU8(content2),
};
const zipped = zipSync(files);
```

### 2. 配置

`packages/app/src/utils/export-project-zip.ts` に独立したユーティリティ関数として配置する。`ProjectManager` には混ぜない（FS 操作と ZIP 生成の結合を避け、テストしやすくするため）。

```ts
export async function exportProjectAsZip(
  fs: FileSystemProvider,
  rootPath: string,      // "/projects/{id}"
  projectName: string,
): Promise<void>
```

### 3. ファイル収集: プロジェクト配下の全ファイル

拡張子フィルタリングは行わず、プロジェクト配下を再帰的に全ファイル収集する。将来 `.krs` / `.krs.style` 以外のファイルが追加された場合も自然に対応できる。

### 4. パスマッピング

`rootPath`（`/projects/{id}`）をプレフィックスとして除去し、ZIP ルートをプロジェクトルートに直接マップする：

```
OPFS: /projects/abc123/services/ecommerce.krs
→ ZIP: services/ecommerce.krs
```

### 5. ダウンロード

`<a download>` 要素経由でトリガー（`showSaveFilePicker` は Safari 未対応のため不使用）。ファイル名は `{projectName}.zip`。

### 6. UI

`ProjectSelector` のアクション行に `↓ Export` ボタンを追加する。プロジェクトが選択されている時のみ表示（`Rename` / `Delete` と同じ条件）。

```
[ 鴉 ] [ ECプラットフォーム ▼ ] [ + New ] [ ↓ Export ] [ ✎ Rename ] [ ✕ Delete ]
```

`ProjectSelector` に `onExportProject` コールバック prop を追加し、`ProjectModeApp` 側で `exportProjectAsZip(fs, currentProject.rootPath, currentProject.name)` を呼び出す。

## 理由

- **`fflate` のバンドルサイズ**: JSZip（〜100 KB gzip）の約 1/8 で、カラスはクライアントサイド SPA のためバンドルサイズに敏感
- **直感的 API**: `zipSync({ path: Uint8Array })` はファイルマップを直接渡す形で、`ProjectManager` の収集結果を最小変換で渡せる
- **ユーティリティ関数として分離**: `ProjectManager` に混ぜると FS 操作と ZIP 生成が結合しテストしにくくなる
- **`FileSystemProvider` API 経由**: OPFS 実装に直接依存せず、`InMemoryFileSystemProvider` でのユニットテストも可能
- **拡張子フィルタなし**: 将来のファイル種別追加（テンプレート、メタデータ等）にコード変更なしで対応できる
- **`<a download>` 経由**: `showSaveFilePicker` は Safari 非対応でクロスブラウザ互換性が下がる

## 却下した案

### 案B: JSZip

長年実績はあるがバンドルサイズ約 100 KB（fflate の約 8 倍）。API も冗長（`zip.file(name, content).generateAsync({ type: "blob" })`）。

### 案C: ネイティブ Compression Streams API

依存なしで動くが、ZIP 形式（ローカルファイルヘッダ + セントラルディレクトリ）の手実装が必要でエラーを生じやすくメンテナンスコストが高い。テキストのみなら圧縮率の差も軽微。

## アーキテクチャ

```
ProjectModeApp
  └─ handleExportProject()
       └─ exportProjectAsZip(fs, rootPath, name)
            ├─ collectFiles(fs, rootPath)  ← 再帰的ファイル収集
            ├─ zipSync(files)              ← fflate
            └─ triggerDownload(blob, filename)
```
