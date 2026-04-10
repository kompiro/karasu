# .krs フォーマッター設計

- **日付**: 2026-04-10
- **ステータス**: 検討中
- **関連**: Issue #438, `docs/spec/syntax.md`, `packages/core/src/types/ast.ts`

## 背景・課題

`.krs` ファイルを書くときのインデント・スペーシング・プロパティ順序が作者によってバラバラになる。
`gofmt` / `prettier` のように「フォーマッターを通せば常に同じ出力になる」仕組みが欲しい。

コメントはアーキテクチャの意図・注記を記述する重要な情報であるため、フォーマット後も必ず保持する。

対象は以下の 4 箇所:

| 対象 | 機能 |
|---|---|
| `packages/core` | フォーマッター本体（純粋関数） |
| `packages/cli` | `karasu fmt` コマンド（ファイル書き換え・`--check`・`--stdin`） |
| `packages/lsp` | `textDocument/formatting` プロバイダー |
| `packages/app` | Monaco エディタのツールバーボタン + `Shift+Alt+F` ショートカット |

## 制約・前提

- フォーマッターは **冪等** でなければならない（`format(format(src)) === format(src)`）。
- パースエラーがある入力にはフォーマッターを適用しない（壊れた入力を上書きしない）。
- スタイル設定ファイルは持たない（opinionated ツール）。
- コメント（`//` 行コメント・`/* */` ブロックコメント）は保持する。

## 現状の問題点

現在の `Lexer.skipWhitespaceAndComments()` はコメントを完全に破棄する。
AST（`KrsFile`）にコメントノードは存在しない。

パーサーは `Parser.parse(src)` → `new Lexer(src).tokenize()` と呼んでいる。
`tokenize()` が返すトークン列にコメントは含まれていないため、コメント保持を実現するには
**レキサーの拡張が必要**。

## アーキテクチャ方針

### コメント保持の実現方法

コメントを保持する方法として以下を比較した。

| 方法 | 概要 |
|---|---|
| **A: AST 拡張** | `KrsNode` に `leadingComments` / `trailingComments` フィールドを追加。パーサーがコメントをノードに紐付ける。 |
| **B: トークン列ベース** | レキサーがコメントトークンを出力する `tokenizeWithComments()` を追加。フォーマッターは AST（構造）＋コメントトークン列（位置情報）を組み合わせて出力する。 |

**案B（トークン列ベース）を採用する。**

理由:
- `KrsNode` の型定義を変更するとパーサー全体・ビューアー・SVGレンダラーへの影響が広い。
- フォーマッター専用の処理を core の共有 AST 型に混入しない方が関心の分離が明確。
- コメントの「所属ノード」を決める責務はフォーマッター側に閉じられる。

### コメント配置アルゴリズム

フォーマッターは以下の 2 種類のコメントを扱う:

| 種類 | 判定 | 出力位置 |
|---|---|---|
| **leading comment** | コメントが次の非コメントトークンと別の行にある | その直前（同インデント） |
| **trailing comment** | コメントが直前の非コメントトークンと同一行にある | その行末に追記 |

アルゴリズム:

1. `tokenizeWithComments(src)` でコメントを含むトークン列を取得する。
2. コメントトークンを「直前の非コメントトークンの行番号」で分類し、leading / trailing を判定する。
3. `Parser.parse(src)` で AST を取得する（既存の `tokenize()` を使用するため影響なし）。
4. AST を再帰的に walk して出力文字列を構築する。各ノード・プロパティ・エッジを出力する前に、元ソースの「そのノードが始まる行より前」にある leading コメントを探して出力する。

**具体例:**

```
// Phase 1 の決済フロー
// TODO: async に変更予定
system Payment {
  label "決済"

  service Checkout {  // EC フロント
    domain D1 {}
  }
}
```

- `// Phase 1 の決済フロー` と `// TODO: async に変更予定` → `system Payment` の leading comments
- `// EC フロント` → `service Checkout` の trailing comment（同一行）
- 出力では上記の位置を再現しつつインデントを正規化する。

## フォーマットルール

```
@import "a.krs.style"     // まとめて先頭、最後の @import 後に 1 空行

system Foo {              // キーワード + id (+ タグ + アノテーション) + { は同一行
  label "..."             // 2 スペースインデント、プロパティは 1 行 1 つ
  description "..."
                          // プロパティブロック内に空行なし
  service Bar {
    label "Bar"
  }
                          // 兄弟ブロック間に 1 空行
  service Baz {}
}
                          // トップレベルブロック間に 1 空行
deploy Prod {
  ...
}
```

タグ・アノテーションはスペース区切り:

```
service Foo [external] @deprecated {
```

エッジは `->` / `-->` の前後に 1 スペース:

```
  A -> B "label"
  A --> B
```

## フェーズ分割

### Phase 1 — レキサー拡張（コメントトークン出力）

**変更ファイル**: `packages/core/src/lexer/lexer.ts`, `packages/core/src/types/tokens.ts`

**変更内容**:

1. `TokenType` に `LineComment` と `BlockComment` を追加する。
2. `Lexer` に `tokenizeWithComments(): Token[]` メソッドを追加する。
   - `skipWhitespaceAndComments` をリファクタリングして `skipWhitespace` と `readComment` に分離する。
   - `tokenizeWithComments` では `readComment` の結果をトークン列に追加する。
   - 既存の `tokenize()` は変更しない（パーサーへの影響ゼロ）。
3. コメントトークンの `value` フィールドにコメント本文（区切り文字を除く）を格納する。

**テスト**: `lexer.test.ts` に各コメント形式のテストを追加。

```ts
// 追加する型（tokens.ts）
LineComment = "LineComment",   // // ...
BlockComment = "BlockComment", // /* ... */
```

```ts
// 追加するメソッド（lexer.ts）
tokenizeWithComments(): Token[]
```

**破壊的変更**: なし（既存 API はそのまま）。

---

### Phase 2 — コアフォーマッター

**変更ファイル**: `packages/core/src/formatter/formatter.ts`（新規）、`packages/core/src/index.ts`

**変更内容**:

```ts
// packages/core/src/formatter/formatter.ts
export class FormatError extends Error {}

export function format(src: string): string
// - パースエラーがある場合は FormatError を throw する
// - 内部: tokenizeWithComments + Parser.parse を呼び、
//         コメントを保持しつつ AST を walk して文字列を生成する
```

内部構造:

```
format(src)
  └─ tokenizeWithComments(src) → commentTokens[]
  └─ Parser.parse(src)         → KrsFile (エラー時 throw)
  └─ Printer.print(ast, commentTokens) → string
       ├─ printFile()          ← styleImports / nodeImports / systems / services...
       ├─ printNode()          ← 再帰。出力前に leading comment を探す
       ├─ printProperties()    ← label / description / link など
       ├─ printEdge()
       └─ commentAt(lineRange) ← lineRange 内の leading / trailing comment を返す
```

冪等性の保証: `format(format(src))` は `format(src)` と等しい。
`format(src)` が出力する文字列は既にルール通りなので、再度 format しても変化しない。

**テスト**: `formatter.test.ts` で以下を確認:
- 基本的なフォーマットルール（インデント・空白行）
- leading comment の保持と位置
- trailing comment の保持
- 冪等性（各テストケースで `format(format(src)) === format(src)` を確認）
- パースエラー時の `FormatError` throw

---

### Phase 3 — CLI `karasu fmt`

**変更ファイル**: `packages/cli/src/fmt.ts`（新規）、`packages/cli/src/index.ts`

```
karasu fmt [files...]          # in-place（変更なければ無音）
karasu fmt --check [files...]  # CI 用。変更あれば exit 1
karasu fmt --stdin             # パイプ用。stdout に出力
```

- 引数なし: `**/*.krs`（カレントディレクトリ）をデフォルトグロブとする。
- exit codes: 0 = 成功, 1 = `--check` で差分あり, 2 = パースエラー / 読み取りエラー。

**テスト**: `fmt.test.ts` で各モードの動作を確認。

---

### Phase 4 — LSP `textDocument/formatting`

**変更ファイル**: `packages/lsp/src/server.ts`

- `onInitialize` の `capabilities` に `documentFormattingProvider: true` を追加。
- `connection.onDocumentFormatting` を実装:
  - `format(text)` を呼んで結果を取得する。
  - full-document replacement の `TextEdit` を 1 つ返す。
  - `FormatError` の場合は空配列を返す（エラーを上書きしない）。

**テスト**: `server.test.ts` に `textDocument/formatting` リクエストのテストを追加。

---

### Phase 5 — App ツールバー + ショートカット

**変更ファイル**: `packages/app/src/components/AppShell.tsx`, `packages/app/src/components/LeftPane.tsx`, `packages/app/src/components/EditorPane.tsx`, `packages/app/src/app.css`

- `AppShell` に `handleFormat` callback を追加:
  - `format(fileContent)` を呼ぶ。
  - 結果を `handleEditorChange` に渡す（ファイルへの書き込みも含む）。
  - `FormatError` の場合は何もしない。
  - パースエラーの有無は `systemDiagnostics` の `error` severity で判定する。
- `LeftPane` / `EditorPane` に `onFormat` prop を追加。
- `EditorPane.handleMount` で `editor.addCommand(KeyMod.Shift | KeyMod.Alt | KeyCode.KeyF, onFormat)` を登録。
- ツールバーボタンは Tier 1（`toolbar-btn--actionable toolbar-btn--format`）。アイコン + "Format" ラベル。パースエラー時は `disabled`。

**テスト**: `AppShell` の Format ボタン表示・disabled 状態の RTL テストを追加。

---

## フェーズ間の依存関係

```
Phase 1 (Lexer)
  └─ Phase 2 (Core Formatter)   ← Phase 1 に依存
       ├─ Phase 3 (CLI)          ← Phase 2 に依存
       ├─ Phase 4 (LSP)          ← Phase 2 に依存
       └─ Phase 5 (App)          ← Phase 2 に依存
```

Phase 2 完了後、Phase 3〜5 は並行して実装可能。
1 PR でまとめて実装・レビューする。

## 未解決の問い

1. **ブロックコメントのインデント正規化**: `/* */` 形式が複数行にまたがる場合、各行のインデントをどう扱うか（v1 では行ごとそのまま出力し、先頭インデントのみ差し替える方針とする）。
2. **`karasu fmt` のデフォルトグロブ範囲**: 引数なしでカレントディレクトリ再帰検索するか、明示ファイル必須にするか。
