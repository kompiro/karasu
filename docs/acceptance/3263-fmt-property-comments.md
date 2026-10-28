---
type: product
---

# AT: フォーマットしてもプロパティ行のコメントがその行から離れない（#3263）

- **日付**: 2026-10-22
- **関連 Issue**: [#3263](https://github.com/kompiro/karasu/issues/3263)
- **Related TPLs**: [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)
- **対象ファイル**: `packages/core/src/formatter/formatter.ts`（`Printer.withPropertyComments` / `Printer.closeBlock`）

> formatter はプロパティ行（`label` / `link` / `description` / `resource` / `capability` など）を AST から出力するが、AST にはその行の位置が無い。そのため行の上と行末のコメントが回収されず、すべてファイル末尾にまとめて出力されていた。ブロック末尾のコメントと閉じ括弧の後ろのコメントも同じく末尾に寄っていた。トークン列から各ブロック本体の文の位置を引き、プロパティをキーワードで対応づけてコメントを付け直す（ADR-438 のトークン列ベース方針のまま）。

## 受け入れ条件

### AC-1: プロパティ行のコメントがその行に付いたまま残る

- [x] AT-A: Issue の再現例（client の `label` / `capability`、service の `link` の上と行末のコメント）をフォーマットすると、どのコメントも元の行の上か行末に残り、ファイル末尾には何も出ない

  > ✅ Automated — `packages/core/src/formatter/formatter.test.ts` › `format()` › `keeps comments on and above property lines in place (#3263)`

- [x] AT-B: 正規化でプロパティの順序が入れ替わっても（edge の後に書いた `link`、`link` の後に書いた `description`）、コメントはプロパティと一緒に動く

  > ✅ Automated — `packages/core/src/formatter/formatter.test.ts` › `format()` › `moves a property's comments with it when the canonical order reorders it`

- [x] AT-C: 複数行の `description """…"""` の閉じ引用符の後ろのコメントは、閉じ引用符の後ろに残る

  > ✅ Automated — `packages/core/src/formatter/formatter.test.ts` › `format()` › `keeps a comment after a multi-line description after its closing quotes`

- [x] AT-D: 1 行にまとめられるプロパティ（複数行の `facets`）は、元の各行のコメントをすべて持つ。最初の行の行末コメントは行末に、残りは行の上に出る

  > ✅ Automated — `packages/core/src/formatter/formatter.test.ts` › `format()` › `gives a merged property the comments of every line it came from`

### AC-2: ブロックの末尾と閉じ括弧のコメントが残る

- [x] AT-E: ブロック本体の最後のコメントは閉じ括弧の直前に、閉じ括弧の後ろのコメントは閉じ括弧の後ろに残る

  > ✅ Automated — `packages/core/src/formatter/formatter.test.ts` › `format()` › `keeps comments at the end of a block body and after its closing brace`

- [x] AT-F: コメントだけを持つ空のブロックは `{}` に畳まれず、コメントを中に持ったまま残る

  > ✅ Automated — `packages/core/src/formatter/formatter.test.ts` › `format()` › `keeps an empty body open when a comment is written inside it`

### AC-3: ノード以外のブロックでも同じ

- [x] AT-G: edge のブロック内のコメントはブロック内に残り、`label` だけのブロックが 1 行に畳まれるときは、中のコメントが edge の上に出る

  > ✅ Automated — `packages/core/src/formatter/formatter.test.ts` › `format()` › `keeps comments inside an edge block, and above a block that folds to the shorthand`

- [x] AT-H: `deploy`（とその配下の node）、`organization` / `team` / `member`、`boundary`、`facet`、`legend` のプロパティ行のコメントがその行に残り、ファイル末尾に何も出ない

  > ✅ Automated — `packages/core/src/formatter/formatter.test.ts` › `format()` › `keeps property comments in deploy, organization, boundary, facet and legend blocks`

### AC-4: ノードのプロパティを足しても、コメントの置き場所がテストで確かめられる

- [x] AT-I: round-trip の fixture 表（全 `KrsNode` の `properties` のキーから型で導出）の各 fixture について、全行の上と行末にコメントを入れてフォーマットすると、どのコメントも同じキーワードの行の上か行末に戻り、2 回目のフォーマットで差分が出ない

  > ✅ Automated — `packages/core/src/formatter/formatter-property-coverage.test.ts` › `formatter node-property comment placement` › `keeps comments next to the %s property lines`

## 手動確認

N/A — 自動テストですべて覆っている
