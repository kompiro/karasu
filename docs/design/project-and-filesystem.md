# プロジェクトとファイルシステム抽象化

- **日付**: 2026-03-17
- **ステータス**: ドラフト
- **関連**: [コアコンセプト](../concepts.md), [.krs 構文リファレンス](../spec/syntax.md), [2レイヤレンダリング](two-layer-rendering.md)

## 背景・課題

現状の karasu はサンプルの krs / krs.style を App.tsx にハードコードして初期表示しているだけで、複数ファイルを扱えない。実際のアーキテクチャ記述では複数の `.krs` ファイルと `.krs.style` ファイルを組み合わせて使うため、「プロジェクト」の概念を導入し、ファイル群を管理する仕組みが必要になる。

また、将来的に VSCode 拡張としてリリースし Explorer ビューに統合したいため、ブラウザ版と VSCode 版でファイルアクセスの抽象化が求められる。

## 制約・前提

- `packages/core` は純粋な TypeScript ライブラリ。ブラウザ API や Node.js API に直接依存しない
- 現在の `compile()` は `krsSource: string` と `styleSource: string` を受け取る関数。ファイルシステムの概念がない
- `.krs` の構文には `@import` が既に定義されている（構文リファレンス参照）が、パーサーでの解決は未実装
- ブラウザ版（packages/app）と VSCode 拡張版（将来）の2つの実行環境を想定する

## 検討した選択肢

### 案1: FileSystemProvider 抽象 + OPFS（ブラウザ版）

core に `FileSystemProvider` interface を定義し、環境ごとに実装を差し替える。

```typescript
// packages/core/src/fs/types.ts
interface FileSystemProvider {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  readDir(path: string): Promise<DirEntry[]>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
  watch?(path: string, callback: (event: FsEvent) => void): Disposable;
}

interface DirEntry {
  name: string;
  kind: 'file' | 'directory';
}
```

**ブラウザ版**: Origin Private File System (OPFS) で実装。
**VSCode 版**: `vscode.workspace.fs` で実装。

```
packages/
├── core/
│   └── src/fs/types.ts          ← interface 定義
├── app/
│   └── src/fs/opfs-provider.ts  ← OPFS 実装
└── (将来) vscode-ext/
    └── src/fs/workspace-provider.ts  ← vscode.workspace.fs 実装
```

**メリット**:
- ディレクトリ・ファイルの階層構造をネイティブに持てる（OPFS）
- API が `readFile` / `writeFile` に近く、VSCode の `workspace.fs` との対称性が高い
- core の `@import` 解決が「パスでファイルを読む」のでそのまま対応できる
- テスト用の InMemory 実装も容易

**デメリット**:
- OPFS は比較的新しい API（2023〜）。古いブラウザでは動かない
- OPFS はブラウザの DevTools から直接見えにくい（デバッグしづらい）

### 案2: IndexedDB ベース

すべてのファイルを IndexedDB のキーバリューストアに格納し、パス文字列をキーとして管理する。

**メリット**:
- ブラウザ互換性が高い
- DevTools の Application タブで中身を確認できる

**デメリット**:
- ディレクトリ構造を自前で管理する必要がある（prefix scan でディレクトリ列挙など）
- `FileSystemProvider` interface との対称性が低い
- ファイル操作のたびにトランザクション管理が必要

### 案3: In-Memory + localStorage 永続化

メモリ上に Map<string, string> を持ち、保存/復元時に localStorage へシリアライズ。

**メリット**:
- 実装が最もシンプル
- 同期的に操作できる

**デメリット**:
- localStorage は容量制限が厳しい（5MB）
- 大きなプロジェクトでは容量不足になる
- 将来の VSCode 版との対称性が低い

## 比較

| 観点 | 案1: OPFS | 案2: IndexedDB | 案3: In-Memory + localStorage |
|------|-----------|---------------|------------------------------|
| ディレクトリ構造 | ネイティブ対応 | 自前管理 | 自前管理 |
| VSCode版との対称性 | 高い | 低い | 低い |
| ブラウザ互換性 | モダンブラウザのみ | 広い | 広い |
| 容量制限 | 実質なし | 実質なし | 5MB |
| デバッグ容易性 | やや難 | 良い | 良い |
| 実装複雑度 | 中 | 中〜高 | 低 |
| テスト容易性 | interface経由で差替可 | interface経由で差替可 | interface経由で差替可 |

## 現時点の方針

**案1（FileSystemProvider + OPFS）を採用する。**

理由:
1. VSCode 拡張への移行パスが最も自然
2. karasu が対象とするユーザー層（アーキテクト・開発者）のブラウザはモダンブラウザが前提
3. ディレクトリ構造がネイティブに表現できるため、`@import` の相対パス解決がシンプル
4. core の `compile()` がファイルシステムを知る必要があるのは `@import` 解決時のみ。それ以外は文字列ベースのまま

### OPFS 非対応ブラウザへのフォールバック

OPFS が利用できない環境では、**単一ファイル編集モード（InMemory）** にフォールバックする。
これは現在の App.tsx の動作と同等で、1つの krs ソースと1つの style ソースをメモリ上で編集する。

```typescript
function detectStorageMode(): 'opfs' | 'memory' {
  if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
    return 'opfs';
  }
  return 'memory';
}
```

| 機能 | OPFS モード | InMemory モード |
|------|-----------|---------------|
| 複数ファイル編集 | o | x（単一 krs + 単一 style） |
| プロジェクト管理 | o | x |
| `@import` 解決 | o | x |
| ファイルツリー | o | x |
| プレビュー | o | o |
| 永続化 | o（OPFS に自動保存） | x（ブラウザリロードで消失） |

InMemory モードでは既存の `compile(krsSource, styleSource)` をそのまま使うため、追加実装は不要。
UI はプロジェクトセレクタやファイルツリーを非表示にし、現在と同じエディタ + プレビューの2ペイン構成で動作する。

起動時にモードを検出し、OPFS 非対応の場合はバナーで通知する：

```
⚠ お使いのブラウザは OPFS に対応していないため、単一ファイル編集モードで動作しています。
  複数ファイルやプロジェクト管理を利用するには、モダンブラウザをお使いください。
```

## プロジェクトの概念

### プロジェクトの定義

```typescript
interface Project {
  id: string;           // UUID
  name: string;         // 表示名
  rootPath: string;     // OPFS 内のルートパス（例: "/projects/{id}"）
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
}
```

プロジェクトは OPFS 内の1ディレクトリに対応する。

### プロジェクトの構成パターン

```
/projects/{id}/
├── index.krs          ← エントリポイント（@import で他ファイルを参照）
├── default.krs.style  ← デフォルトスタイル
├── services/
│   ├── ecommerce.krs
│   ├── payment.krs
│   └── shipping.krs
└── styles/
    └── theme.krs.style
```

最小構成（単一ファイル）:

```
/projects/{id}/
└── index.krs          ← スタイルは @import で外部参照 or インラインで不使用
```

### プロジェクトの管理

プロジェクト一覧のメタデータは OPFS 内の `/meta/projects.json` に格納する。

```json
[
  {
    "id": "abc-123",
    "name": "ECプラットフォーム",
    "rootPath": "/projects/abc-123",
    "createdAt": "2026-03-17T00:00:00Z",
    "updatedAt": "2026-03-17T00:00:00Z"
  }
]
```

## @import の解決

### 解決フロー

```
1. Parser が @import "path" を検出
2. ImportResolver に (importPath, currentFilePath) を渡す
3. ImportResolver が FileSystemProvider.readFile() で内容を取得
4. 取得した内容を再帰的にパース
5. マージされた AST / StyleSheet を返す
```

```typescript
// packages/core/src/fs/import-resolver.ts
class ImportResolver {
  constructor(private fs: FileSystemProvider) {}

  async resolveKrs(entryPath: string): Promise<string> {
    // @import を再帰的に解決し、結合した krs ソースを返す
  }

  async resolveStyle(entryPath: string): Promise<string> {
    // @import を再帰的に解決し、結合した style ソースを返す
  }
}
```

### compile() の拡張

既存の `compile(krsSource, styleSource)` は変更しない。
新たに `compileProject()` を追加する。

```typescript
// 既存（変更なし）— 文字列を直接渡す
function compile(krsSource: string, styleSource?: string, viewPath?: ViewPath): CompileResult;

// 新規 — ファイルシステム経由でプロジェクトをコンパイル
async function compileProject(
  entryPath: string,
  fs: FileSystemProvider,
  viewPath?: ViewPath
): Promise<CompileResult>;
```

## ブラウザ版の UI 構成

### プロジェクトセレクタ

```
┌─────────────────────────────────────────┐
│ 📁 ECプラットフォーム          ▼ [+ New] │  ← プロジェクトセレクタ
├─────────────────────────────────────────┤
│ ┌─ files ────┐ ┌─ preview ──────────┐  │
│ │ index.krs  │ │                    │  │  ← ファイルツリー + プレビュー
│ │ ecommerce  │ │   SVG Preview      │  │
│ │  .krs      │ │                    │  │
│ │ default    │ │                    │  │
│ │  .krs.style│ │                    │  │
│ └────────────┘ └────────────────────┘  │
│ ┌─ editor ──────────────────────────┐  │
│ │ Monaco Editor                     │  │  ← 選択ファイルの編集
│ └───────────────────────────────────┘  │
│ ┌─ warnings ────────────────────────┐  │
│ │ ⚠ Warning panel                   │  │
│ └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### VSCode 拡張時の UI 対応

| ブラウザ版 | VSCode 版 |
|-----------|-----------|
| プロジェクトセレクタ | ワークスペースフォルダ（Explorer ビュー） |
| ファイルツリー | Explorer ビュー |
| Monaco Editor | VSCode 標準エディタ + Language Server |
| SVG Preview | Webview パネル |
| Warning panel | Problems パネル |

ブラウザ版で作った UI コンポーネントのうち、VSCode 版で再利用されるのは **SVG Preview（Webview 内）のみ**。

## 段階的な実装計画

### Phase 1: FileSystemProvider + InMemory 実装

- core に `FileSystemProvider` interface を定義
- `InMemoryFileSystemProvider` を実装（テスト用 + OPFS 非対応ブラウザのフォールバック）
- `@import` の解決ロジックを実装
- `compileProject()` を実装
- `detectStorageMode()` によるモード検出とフォールバック分岐

### Phase 2: OPFS 実装 + プロジェクト管理

- `OpfsFileSystemProvider` を実装
- プロジェクトの CRUD（作成・読取・更新・削除）
- プロジェクトセレクタ UI
- ファイルツリー UI

### Phase 3: ファイル管理の統合

Phase 2 で実装したファイルツリーにファイル操作機能を追加する。

#### ファイルツリーヘッダーのアクションボタン

```
Files          [+File] [+Dir]
├── index.krs
├── services/
│   ├── ecommerce.krs
│   └── payment.krs
└── default.krs.style
```

- **[+File]**: 新規ファイル作成。クリックでインライン入力欄を表示し、ファイル名を入力して作成
- **[+Dir]**: 新規ディレクトリ作成。同様にインライン入力欄で名前を入力

いずれも現在選択中のディレクトリ（またはルート）配下に作成する。

#### コンテキストメニュー（右クリック）

ファイルツリーの項目を右クリックした際に表示する。
プロジェクトセレクタの UI（ボタン・入力欄のスタイル）と統一感を持たせる。

| 対象 | メニュー項目 |
|------|------------|
| ファイル | Rename / Delete |
| ディレクトリ | New File / New Folder / Rename / Delete |

```
┌──────────────┐
│ New File      │
│ New Folder    │
│ ──────────── │
│ Rename        │
│ Delete        │
└──────────────┘
```

**スタイル**: ダーク背景（`#1e293b`）、`#e2e8f0` テキスト、ホバーで `#334155` 背景。
Delete はホバーで赤系（`#7f1d1d` 背景、`#ef4444` ボーダー）。
プロジェクトセレクタの `.project-selector-btn` / `.project-selector-btn-danger` と同じパターン。

#### 操作フロー

**新規ファイル作成**:
1. [+File] ボタンまたはコンテキストメニューの "New File" をクリック
2. ファイルツリー内にインライン入力欄が表示される
3. ファイル名を入力して Enter（`.krs` 拡張子が無ければ自動付与）
4. `fs.writeFile(path, "")` で空ファイルを作成
5. ファイルツリーを再読み込み
6. 作成したファイルを自動選択してエディタに表示

**新規ディレクトリ作成**:
1. [+Dir] ボタンまたはコンテキストメニューの "New Folder" をクリック
2. インライン入力欄でディレクトリ名を入力
3. `fs.mkdir(path)` でディレクトリを作成
4. ファイルツリーを再読み込み

**リネーム**:
1. コンテキストメニューの "Rename" をクリック
2. 現在の名前が入ったインライン入力欄が表示される
3. 名前を変更して Enter
4. 内容を新パスに書き込み → 旧パスを削除（OPFS にはネイティブの rename がないため）
5. エディタで開いていたファイルがリネーム対象なら、新パスで再選択

**削除**:
1. コンテキストメニューの "Delete" をクリック
2. 確認ダイアログ（`confirm()`）を表示
3. `fs.delete(path)` で削除
4. ファイルツリーを再読み込み
5. 削除対象がエディタで開かれていた場合はエディタをクリア

#### 保存方式

エディタでの変更は**自動保存**（onChange のたびに `fs.writeFile()` を呼ぶ）。
Phase 2 の `ProjectModeApp` で既に実装済み。明示的な保存ボタンは設けない。

#### Esc キーでのキャンセル

インライン入力欄で Esc キーを押した場合は、入力をキャンセルして元の状態に戻す。

### Phase 4: インポート・エクスポート

- ローカルファイルのインポート（File System Access API or input[type=file]）
- URL からの krs ファイル取り込み（fetch）
- プロジェクトのエクスポート（zip ダウンロード）

## 未解決の問い

- OPFS のデバッグ体験をどう改善するか（DevTools 拡張? ダンプ機能? エクスポート機能で代替?）
- InMemory モードでも localStorage 等で簡易的な永続化を提供するべきか
- `@import` の循環参照をどう検出・報告するか
- プロジェクト間でスタイルファイルを共有する仕組みは必要か（グローバルスタイルライブラリ）
- ブラウザ版で File System Access API（ローカルファイルの直接読み書き）をサポートするか
- VSCode 拡張の Language Server で `@import` の補完をどう実現するか
