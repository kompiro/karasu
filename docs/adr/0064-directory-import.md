# ADR-0064: Directory Import — `import "dir/"` 構文

- **日付**: 2026-04-09
- **ステータス**: 決定済み
- **関連**: Issue #292, [ADR-0023](0023-wildcard-import-two-pass-resolution.md)

## 背景

`examples/ec-platform/05-multifile/` のようにディレクトリ内の複数 `.krs` ファイルを統合するには、エントリポイントで各ファイルを列挙する必要があった。

```krs
import { ECommerce } from "./ecommerce.krs"
import { Payment } from "./payment.krs"
```

チームが新しいサービスファイルを追加するたびにエントリファイルを編集しなければならず、「ディレクトリ = チームの所有範囲」という構造の表現に向いていなかった。`FileSystemProvider.readDir` は既に実装済みで、ディレクトリインポートの前提条件は整っていた。

## 決定

**パス末尾が `/` で終わる import はディレクトリ展開として扱う**（案1）。パーサー・AST 型の変更は不要で、`ImportResolver` に分岐を追加するだけで実装する。

```krs
import "teams/"
import "./services/"
```

### 実装方針

1. **Pass 1（非同期ロード）**: `loadFileRecursive` 内で `nodeImport.path` が `/` 終わりなら `fs.readDir(dirPath)` を呼び、`kind === "file"` かつ `.krs` 終わりのファイルを抽出、name でアルファベット順ソートして `dirExpansions: Map<string, string[]>` に保存。各ファイルを再帰ロードする
2. **Pass 2（同期マージ）**: `resolveKrsFromMap` は `/` 終わりパスに対して `this.dirExpansions` を参照し、各ファイルに `mergeWildcardResolved` を適用（`visited` セットで二重マージを防ぐ）
3. **除外ルール**: `.krs.style` ファイルは除外、サブディレクトリは再帰しない（フラット展開のみ）
4. **存在しないディレクトリ**: error diagnostic

## 理由

- **パーサー変更なし**: 既存パーサーが `import "teams/"` を `ImportDeclaration { ids: [], path: "teams/" }`（ワイルドカード扱い）として解析するため、新規トークンや構文拡張が不要
- **末尾 `/` による即判定**: `import "file.krs"` との区別がパスの末尾文字だけで済み、`fs.exists` の事前呼び出しのような複雑な順序依存を避けられる
- **`FileSystemProvider.readDir` はすべての実装で対応済み**: `InMemoryFileSystemProvider`（テスト）、`OpfsFileSystemProvider`（ブラウザ）、`NodeFileSystemProvider`（CLI）すべてで動作する
- **アルファベット順ソート**: `Array.prototype.sort` のデフォルト（ロケール非依存の Unicode コードポイント順）を使い、Pass 1 / Pass 2 で同じソート済みリストを参照することで決定論的に処理できる
- **サブディレクトリを再帰しない**: 再帰展開は「コードを変えていないのにファイル追加で動作が変わる」という暗黙の依存を生み、深さ優先/幅優先の順序選択が直感に反する。1 階層のフラット展開ならアルファベット順で決定論的に保てる

## 却下した案

### 案2: 専用構文 `import dir "path/"`

新しいキーワード `dir` を追加する案。パーサー・字句解析・仕様ドキュメント全体への波及が大きく、既存のワイルドカード `import "file.krs"` との一貫性が崩れる。

### 案3: `fs.exists` による自動判定

パスが `/` で終わらなくても自動判定する案。`fs.exists` を Pass 1 の前に呼ぶ必要があり順序が複雑化する。同名のファイル `teams.krs` とディレクトリ `teams/` が共存した場合に曖昧。

## 残課題

- サブディレクトリを階層的に展開したいケース（将来的に必要になれば別 Issue で検討）
