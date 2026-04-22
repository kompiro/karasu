---
id: ADR-20260317-02
title: "プロジェクトとファイルシステム抽象化 — `FileSystemProvider` + OPFS"
status: accepted
date: 2026-03-17
topic: project
scope:
  packages:
    - app
    - core
  domains:
    - filesystem
    - project
---

# ADR-20260317-02: プロジェクトとファイルシステム抽象化 — `FileSystemProvider` + OPFS

- **日付**: 2026-03-17
- **ステータス**: 決定済み
- **関連**: [docs/concepts.md](../concepts.md), [docs/spec/syntax.md](../spec/syntax.md)

## 背景

従来の karasu はサンプルの `.krs` / `.krs.style` を `App.tsx` にハードコードして初期表示するだけで、複数ファイルを扱えなかった。実際のアーキテクチャ記述では複数の `.krs` ファイルと `.krs.style` を組み合わせて使うため、「プロジェクト」の概念導入とファイル群の管理が必要だった。加えて、将来 VSCode 拡張として Explorer ビューに統合したいため、ブラウザ版と VSCode 版でファイルアクセスを抽象化する必要があった。

## 決定

### 1. `FileSystemProvider` インターフェース

`packages/core/src/fs/types.ts` に定義し、環境ごとに実装を差し替える。

```typescript
interface FileSystemProvider {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  readDir(path: string): Promise<DirEntry[]>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
  watch?(path: string, cb: (event: FsEvent) => void): Disposable;
}
```

### 2. 実装

| 実装 | 用途 | 配置 |
|---|---|---|
| `OpfsFileSystemProvider` | ブラウザ (OPFS) | `packages/app` |
| `InMemoryFileSystemProvider` | テスト + OPFS 非対応ブラウザ | `packages/app` |
| `NodeFileSystemProvider` | CLI | `packages/cli` |
| （将来）`WorkspaceFileSystemProvider` | VS Code 拡張 | `packages/vscode` |

### 3. プロジェクト型

```typescript
interface Project {
  id: string;           // UUID
  name: string;
  rootPath: string;     // OPFS 内のルートパス
  createdAt: string;
  updatedAt: string;
}
```

メタデータは OPFS 内の `/meta/projects.json` に格納する。

### 4. `compileProject()` の追加

既存の `compile(krsSource, options?)` は変更せず、新たに `compileProject(entryPath, fs, options?)` を追加する。内部で `ImportResolver` が `FileSystemProvider.readFile()` を使って import を再帰解決する。

### 5. OPFS 非対応時のフォールバック

`detectStorageMode()` が `navigator.storage?.getDirectory` を見て `'opfs' | 'memory'` を返し、非対応環境では単一ファイル編集モード（`InMemoryFileSystemProvider`）にフォールバックする。

## 理由

- **VSCode への移行パス**: `FileSystemProvider.readFile/writeFile` は `vscode.workspace.fs` の API 形状と対称で、VSCode 拡張実装時にそのままマップできる
- **OPFS のネイティブなディレクトリ構造**: `@import` の相対パス解決がシンプルに実装できる（IndexedDB ベース案のように自前で prefix scan する必要がない）
- **容量制限がない**: `localStorage` ベース案（5MB 制限）と異なり、大きなプロジェクトに対応できる
- **テスト容易性**: インターフェース経由で差し替え可能なため、ユニットテストで `InMemoryFileSystemProvider` を注入できる
- **既存 `compile()` を壊さない**: 文字列ベースの `compile()` はそのまま残し、`compileProject()` を追加する後方互換設計

## 却下した案

### 案2: IndexedDB ベース

ブラウザ互換性が高く DevTools Application タブで確認できる利点はあるが、ディレクトリ構造を自前管理する必要があり `FileSystemProvider` 形状との対称性が低い。

### 案3: In-Memory + localStorage 永続化

実装は最もシンプルだが、localStorage の 5MB 制限に引っかかる可能性があり、VSCode 版との対称性も低い。

## 段階的実装

- **Phase 1**: `FileSystemProvider` 定義 + `InMemoryFileSystemProvider` + import 解決 + `compileProject()` + `detectStorageMode()`
- **Phase 2**: `OpfsFileSystemProvider` + プロジェクト CRUD + プロジェクトセレクタ UI + ファイルツリー UI
- **Phase 3**: ファイルツリーの作成/リネーム/削除操作 + コンテキストメニュー（自動保存、Esc キャンセル）
- **Phase 4**: ローカルファイルのインポート/エクスポート（別 Issue で対応）

## 残課題

- `@import` の循環参照検出
- グローバルスタイルライブラリ（プロジェクト間のスタイル共有）
- File System Access API（ローカルファイル直接操作）対応
- VSCode Language Server での `@import` 補完
