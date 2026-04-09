# Directory Import: `import "dir/"` Syntax

- **日付**: 2026-04-09
- **ステータス**: 検討中
- **関連**: [multi-file-wildcard-import.md](multi-file-wildcard-import.md), Issue #292

## 背景・課題

`examples/ec-platform/05-multifile/` のようにディレクトリ内の複数 `.krs` ファイルを統合するには、現状は各ファイルをエントリポイントで列挙する必要がある。

```krs
import { ECommerce } from "./ecommerce.krs"
import { Payment } from "./payment.krs"
```

チームが新しいサービスファイルを追加するたびに、エントリファイルを編集しなければならない。
「ディレクトリ = チームの所有範囲」という構造を表現したい場合に、ファイル単位の列挙は煩雑になる。

[multi-file-wildcard-import.md](multi-file-wildcard-import.md) の「未解決の問い」セクションでは、
この機能を #292 として独立した Issue に分割し、`FileSystemProvider` の拡張が必要な独立した機能として扱うことにしている。
しかし `FileSystemProvider.readDir` は既に実装済みであり、実装の前提条件は整っている。

## 制約・前提

- `FileSystemProvider` インターフェースは変更しない（`readDir` は既に存在する）
- `ImportDeclaration` の AST 型を変更しない（`ids: []` = ワイルドカードを流用）
- `ImportResolver` の 2 パス構成を維持する（Pass 1: 非同期ファイルロード, Pass 2: 同期マージ）
- Pass 2 の `resolveKrsFromMap` は同期のまま保つ（大規模な型変更を避ける）
- ブラウザ（OPFS）・VSCode（workspace.fs）・Node.js・テスト（InMemory）で同一の動作をする
- 既存の `import "file.krs"` および `import { X } from "file.krs"` の動作は変更しない

## 検討した選択肢

### 案1: パス末尾 `/` = ディレクトリ import（採用）

```krs
import "teams/"
import "./services/"
```

パーサーの変更は不要。`ImportDeclaration.path` が `/` で終わる場合、
`ImportResolver` がディレクトリ展開として処理する。

**メリット**:
- パーサー変更なし・AST 型変更なし
- `import "file.krs"` との区別がパスの末尾文字で即判定できる
- `FileSystemProvider.readDir` をそのまま利用可能

**デメリット**:
- パス末尾の `/` という慣習が `.krs` 構文内では非自明
- ディレクトリパスの表記が OS 依存に見える（実際は `/` のみサポート）

### 案2: 専用構文 `import dir "path/"`

```krs
import dir "teams/"
```

新しいキーワード `dir` を追加して意図を明示する。

**メリット**: 構文レベルでディレクトリ import であることが明確

**デメリット**:
- パーサー・字句解析・仕様ドキュメント全体への波及が大きい
- 既存のワイルドカード import（`import "file.krs"`）との一貫性が崩れる

### 案3: `exists` チェックによる自動判定

パスが `/` で終わらなくても、`fs.exists(path)` で directory か file かを自動判定する。

```krs
import "teams"   # ディレクトリかファイルか実行時に判定
```

**メリット**: 記法が自然

**デメリット**:
- `fs.exists` を Pass 1 の前に呼ぶ必要があり、ファイルロードの順序が複雑化
- 同名のファイル `teams.krs` とディレクトリ `teams/` が共存した場合に曖昧

## 設計詳細（案1 の実装方針）

### パーサー変更なし

`import "teams/"` は既存パーサーで `ImportDeclaration { ids: [], path: "teams/" }` として解析される（ワイルドカード扱い）。

### Pass 1: ディレクトリ展開とファイルロード

`loadFileRecursive` 内で各 `nodeImport` を処理する際、`path` が `/` 終わりの場合にディレクトリ展開を行う。

```
nodeImport.path が "/" で終わる?
  → resolvePath でディレクトリパスを解決
  → fs.readDir(dirPath) で DirEntry[] を取得
  → kind === "file" かつ name が ".krs" で終わるものを抽出
  → name でアルファベット順ソート（決定論的な処理順）
  → dirExpansions.set(resolvedDirPath, expandedFilePaths) に保存
  → 各ファイルを loadFileRecursive で再帰ロード
存在しないディレクトリ → error diagnostic
```

### Pass 2: 展開済みパスの参照（同期）

`resolveKrsFromMap` はディレクトリ import に対し `this.dirExpansions` を参照することで同期のままマージを行う。

```
nodeImport.path が "/" で終わる?
  → resolvePath で同じ dirPath を復元
  → dirExpansions.get(dirPath) で展開済みファイルパスを取得
  → 各ファイルに mergeWildcardResolved を適用（visited セットで二重マージを防ぐ）
```

### ソート順

- アルファベット順（`Array.prototype.sort` のデフォルト: ロケール非依存の Unicode コードポイント順）
- 同じディレクトリに対して Pass 1・Pass 2 ともに同じソート済みリストを参照するため、`dirExpansions` に格納する時点でソートを適用する

### 除外ルール

- `.krs.style` ファイルは除外（name が `.krs` 終わりのもののみ対象）
- サブディレクトリは再帰しない（フラット展開のみ）
  - サブディレクトリを含めたい場合は、そのサブディレクトリに対する別の `import "sub/"` で対応する

## 比較

| 観点 | 案1（末尾 `/`） | 案2（`import dir`） | 案3（自動判定） |
|------|--------------|------------------|--------------|
| パーサー変更 | なし | 必要 | なし |
| 意図の明示度 | 中（慣習的） | 高 | 低（曖昧） |
| 実装コスト | 低 | 高 | 中 |
| 既存構文との一貫性 | 高 | 低 | 高 |
| 曖昧性 | なし | なし | あり |

## 現時点の方針

**案1（パス末尾 `/` = ディレクトリ import）** を採用する。

- パーサー・AST 型の変更なし
- `ImportResolver` の Pass 1/2 に分岐を追加するだけで実装可能
- `FileSystemProvider.readDir` は既に全実装に存在する
- サブディレクトリは再帰しない（フラット展開のみ）で初期実装を行い、必要に応じて拡張する

## 未解決の問い

### サブディレクトリの再帰展開

`import "teams/"` で `teams/payment/` のようなネストされたディレクトリも対象にするか。
初期実装ではフラット展開のみとし、再帰展開は別 Issue で検討する。

### ブラウザ（OPFS）環境での動作

OPFS ベースの `FileSystemProvider` 実装が `readDir` をどう実装するかは実装依存。
現状の `InMemoryFileSystemProvider` は `readDir` 対応済み。
アプリ側の OPFS 実装（`packages/app/`）でも `readDir` が正しく機能するか別途確認が必要。
