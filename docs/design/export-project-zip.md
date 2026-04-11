# Export Project as ZIP

- **日付**: 2026-04-11
- **ステータス**: 検討中
- **関連**: [プロジェクトとファイルシステム抽象化](./project-and-filesystem.md), [ProjectSelector UI 操作設計](./project-selector-operations.md), [Issue #461](https://github.com/kompiro/karasu/issues/461)

## 背景・課題

ProjectMode では `.krs` / `.krs.style` ファイルをすべてブラウザの OPFS（Origin Private File System）に保存する。
OPFS はサンドボックス内仮想ファイルシステムであり、ユーザーは通常のファイルマネージャーからアクセスできない。

その結果、以下のユースケースが実現できない：

- **バックアップ**: プロジェクトファイルをローカルに保存しておきたい
- **共有**: 別のユーザー・環境にプロジェクトを渡したい
- **マイグレーション**: CLI や VS Code 拡張など別環境に持ち込みたい

ZIP ダウンロード機能を追加することでこれらを解決する。

## 制約・前提

- ブラウザ内で完結する（サーバーサイド処理なし）
- ファイル読み取りは既存の `FileSystemProvider` API（`readDir()` / `readFile()`）を使い、OPFS 実装に直接依存しない
- ZIP にはプロジェクト配下の全ファイルを含める（現時点では `.krs` / `.krs.style` のみ存在する。SVG 出力は OPFS には保存されないため除外対象なし）
- ダウンロードトリガーは `<a download>` 要素経由（`showSaveFilePicker` は Safari 未対応のため不使用）
- `ProjectSelector` の既存アクションボタン（`project-selector-btn`）と同一 UI 系統で追加する

## 検討した選択肢

### A. fflate

- 現代的な純 JavaScript ZIP ライブラリ（TypeScript 型同梱）
- 圧縮・展開とも同期 / 非同期 API を提供
- バンドルサイズ約 12 KB（gzip）、ツリーシェイク可能
- `zipSync({ "path/to/file": Uint8Array })` という直感的な API

```ts
import { zipSync, strToU8 } from "fflate";

const files: Record<string, Uint8Array> = {
  "index.krs": strToU8(content),
  "services/ecommerce.krs": strToU8(content2),
};
const zipped = zipSync(files);
```

### B. JSZip

- 長年実績があり知名度が高い ZIP ライブラリ
- Promise ベースの `generateAsync()` API
- バンドルサイズ約 100 KB（gzip）、fflate の約 8 倍
- API が冗長（`zip.file(name, content).generateAsync({ type: "blob" })`）

### C. ネイティブ Compression Streams API

- ブラウザ組み込みで依存なし
- ただし ZIP **形式**（ローカルファイルヘッダ + セントラルディレクトリ）は自分で実装する必要がある
- ZIP ヘッダ構造の手実装はエラーを生じやすく、メンテナンスコストが高い
- テキストのみなら圧縮率の差は軽微

## 比較

| 観点              | fflate       | JSZip        | ネイティブ   |
| ----------------- | ------------ | ------------ | ------------ |
| バンドルサイズ    | ◎ ~12 KB     | △ ~100 KB    | ◎ 0          |
| API の簡潔さ      | ◎            | ○            | ✕（自前実装）|
| TypeScript 対応   | ◎（型同梱）  | ○（@types）  | ◎            |
| ZIP 形式の信頼性  | ◎            | ◎            | △（要実装）  |
| 依存の追加        | △（1 pkg）   | △（1 pkg）   | ◎ なし       |

## 現時点の方針

**fflate を採用する**。バンドルサイズが最小で TypeScript サポートも充実しており、
API も同期・非同期ともに扱いやすい。

ZIP 構築ロジックは `packages/app/src/utils/export-project-zip.ts` に独立したユーティリティ関数として配置する。
`ProjectManager` に混ぜると FS 操作と ZIP 生成が結合しテストしにくくなるため避ける。

```ts
// export-project-zip.ts（概略）
export async function exportProjectAsZip(
  fs: FileSystemProvider,
  rootPath: string,   // "/projects/{id}"
  projectName: string,
): Promise<void>
```

**ファイル収集の方針**:  
`readDir()` は `DirEntry[]`（name + kind）を返すが、拡張子フィルタリングは `DirEntry` には含まれない。
「プロジェクト配下の全ファイルを収集する」方針とし、`.krs` / `.krs.style` 以外のファイルが将来追加された場合も自然に対応できるようにする。

**パスマッピング**:  
`rootPath`（`/projects/{id}`）をプレフィックスとして除去し、ZIP ルートをプロジェクトルートに直接マップする。

```
OPFS: /projects/abc123/services/ecommerce.krs
→ ZIP: services/ecommerce.krs
```

**ファイル名**:  
`{projectName}.zip`（例: `my-project.zip`）

**UI 配置**:  
`ProjectSelector` のアクション行（`project-selector-actions`）に `↓ Export` ボタンを追加。
プロジェクトが選択されている時のみ表示する（`Rename` / `Delete` と同じ条件）。

```
[ 鴉 ] [ ECプラットフォーム ▼ ] [ + New ] [ ↓ Export ] [ ✎ Rename ] [ ✕ Delete ]
```

`onExportProject` コールバック prop を `ProjectSelector` に追加し、
`ProjectModeApp` 側で `exportProjectAsZip(fs, currentProject.rootPath, currentProject.name)` を呼び出す。

## アーキテクチャ図

```
ProjectModeApp
  └─ handleExportProject()          ← ProjectModeApp でハンドラを定義
       └─ exportProjectAsZip(fs, rootPath, name)  ← utils/ に配置
            ├─ collectFiles(fs, rootPath)           ← 再帰的ファイル収集
            │    ├─ fs.readDir(dir)
            │    └─ fs.readFile(path)
            ├─ zipSync(files)                        ← fflate
            └─ triggerDownload(blob, filename)       ← <a download> 要素
```

## 未解決の問い

なし（Issue #461 の仕様で方針は確定）
