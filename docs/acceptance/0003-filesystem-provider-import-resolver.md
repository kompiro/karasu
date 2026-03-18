# AT-0003: FileSystemProvider と @import 解決

- **日付**: 2026-03-18
- **関連ADR**: なし
- **対象**: `packages/core/src/fs/` — FileSystemProvider interface、InMemoryFileSystemProvider、パスユーティリティ、ImportResolver、compileProject()

## 概要

環境非依存のファイルシステム抽象化（FileSystemProvider）と、`.krs` ファイルの `@import` / `import { } from` を再帰的に解決する ImportResolver を導入する。これにより複数ファイルで構成されるプロジェクトのコンパイルが可能になる。

## 受け入れ条件

### AC-1: FileSystemProvider interface と InMemoryFileSystemProvider

- [ ] `writeFile("/hello.txt", "world")` 後に `readFile("/hello.txt")` が `"world"` を返す
- [ ] 同じパスへの `writeFile` で既存ファイルが上書きされる
- [ ] 存在しないファイルの `readFile` が `ENOENT` エラーを throw する
- [ ] `writeFile` がネストしたパス（例: `/a/b/c.txt`）に対して親ディレクトリを自動作成する
- [ ] `readDir` がファイルを `{ name, kind: "file" }` として返す
- [ ] `readDir` がサブディレクトリを `{ name, kind: "directory" }` として返す
- [ ] `readDir` が空ディレクトリを含めて返す
- [ ] 存在しないディレクトリの `readDir` が `ENOENT` エラーを throw する
- [ ] `exists` がファイル・ディレクトリの存在に対して `true`、不在に対して `false` を返す
- [ ] `exists("/")` がルートディレクトリに対して `true` を返す
- [ ] `delete` でファイルが削除される
- [ ] `delete` でディレクトリとその配下のファイル・サブディレクトリが再帰的に削除される
- [ ] 存在しないパスの `delete` が `ENOENT` エラーを throw する
- [ ] `mkdir` でディレクトリが作成され、親ディレクトリも再帰的に作成される
- [ ] `mkdir` が同じパスに対して冪等（エラーなく繰り返し呼べる）

### AC-2: パスユーティリティ

- [ ] `normalizePath("/a/./b/./c")` が `/a/b/c` を返す（`.` セグメント除去）
- [ ] `normalizePath("/a/b/../c")` が `/a/c` を返す（`..` セグメント解決）
- [ ] `normalizePath("/a/b/c/../../d")` が `/a/d` を返す（複数 `..` 解決）
- [ ] `normalizePath("/a/../..")` が `/` を返す（絶対パスでルートより上に行かない）
- [ ] `normalizePath("/a//b///c")` が `/a/b/c` を返す（二重スラッシュ除去）
- [ ] `normalizePath("")` と `normalizePath(".")` が `"."` を返す
- [ ] `resolvePath("/a/b/c.krs", "../d.krs")` が `/a/d.krs` を返す
- [ ] `resolvePath("/a/b/c.krs", "./d.krs")` が `/a/b/d.krs` を返す
- [ ] `resolvePath("/a/b/c.krs", "d.krs")` が `/a/b/d.krs` を返す
- [ ] `resolvePath("/a/b/c.krs", "/x/y.krs")` が `/x/y.krs` を返す（絶対パスはそのまま）
- [ ] `dirname("/a/b/c.krs")` が `/a/b` を返す
- [ ] `basename("/a/b/c.krs")` が `c.krs` を返す
- [ ] `extname("style.krs.style")` が `.style` を返す（最後の拡張子）
- [ ] `extname(".gitignore")` が `""` を返す（ドットファイルは拡張子なし）

### AC-3: ImportResolver — @import によるスタイル解決

- [ ] `@import "default.krs.style"` を含む `.krs` ファイルから、対応するスタイルファイルのルールが `styleSheets` に含まれる
- [ ] 存在しないスタイルファイルの `@import` で severity `"error"` の diagnostic（`"Style file not found: ..."` メッセージ）が出力される
- [ ] 同じスタイルファイルが2回 `@import` された場合、severity `"warning"` の diagnostic（`"Circular style import detected: ..."` メッセージ）が出力される

### AC-4: ImportResolver — import { } from によるノード解決

- [ ] `import { Payment } from "services/payment.krs"` で、`payment.krs` 内の `Payment` ノードが同名 system の children にマージされる
- [ ] import 元のエッジのうち、import されたノードに関連するものもマージされる
- [ ] 存在しない identifier の import で severity `"error"` の diagnostic（`'Imported identifier "..." not found'` メッセージ）が出力される
- [ ] 存在しないファイルの import で severity `"error"` の diagnostic（`"File not found: ..."` メッセージ）が出力される

### AC-5: ImportResolver — チェーンと循環参照

- [ ] `A → B → C` のチェーン import が再帰的に解決される（A が B の identifier を import し、B が C の identifier を import する場合、A に指定した identifiers がすべてマージされる）
- [ ] `.krs` ファイル間の循環参照（A → B → A）で severity `"warning"` の diagnostic（`"Circular import detected: ..."` メッセージ）が出力され、無限ループしない

### AC-6: compileProject()

- [ ] `compileProject(entryPath, fs)` が `CompileResult` を返し、`svg` フィールドに SVG 文字列が含まれる
- [ ] `compileProject` が ImportResolver を使って `@import` と `import { } from` を解決してからレンダリングする
- [ ] 既存の `compile(krsSource, styleSource)` の動作が変わらない（シグネチャ・戻り値ともに後方互換）

## 検証方法

```bash
npx vitest run packages/core/src/fs/   # 53テスト（path-utils: 23, in-memory-provider: 19, import-resolver: 11）
npx vitest run packages/core/          # 既存テスト含む全150テスト通過で後方互換を確認
npm run build                          # ビルド成功
```
