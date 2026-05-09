---
type: product
---

# AT-1168: Style parser — `,` between properties emits a diagnostic and recovers

- **日付**: 2026-05-09
- **関連 Issue**: [#1168](https://github.com/kompiro/kalasu/issues/1168)
- **対象ファイル**:
  - `packages/core/src/parser/style-parser.ts`、`packages/core/src/parser/style-parser.test.ts`
  - `packages/core/src/types/style.ts`、`packages/core/src/types/ast.ts`
  - `packages/core/src/builtins/default-style.ts`、`packages/core/src/builtins/icon-theme.ts`
  - `packages/core/src/fs/import-resolver.ts`
  - `packages/core/src/parser/diagnostic-legacy-format.ts`
  - `packages/app/src/i18n/{en,ja,types,format-diagnostic}.ts`
  - `docs/spec/style.md`
- **関連 Design Doc**: [`docs/design/style-ast-shape.md`](../design/style-ast-shape.md) — Phase 1 のスコープ

## 受け入れ条件

- [x] AT-A: `edge#A->B { color: red, direction: down; }` を parse すると `expected-semicolon-between-properties` (severity=error) が 1 件発生し、`color` / `direction` の両 property が AST に残る
  > ✅ Automated — `packages/core/src/parser/style-parser.test.ts` › `StyleParser comma-as-separator recovery (#1168) › emits an error and recovers when ',' is used between properties`

- [x] AT-B: `service { a: 1, b: 2, c: 3; }` のように連鎖した misplaced comma で、診断は `,` の数だけ発生し、property は全件抽出される
  > ✅ Automated — `packages/core/src/parser/style-parser.test.ts` › `... emits one diagnostic per misplaced comma`

- [x] AT-C: `font-family: "Noto", sans-serif;` のような正当な multi-value comma は診断を出さない（non-regression）
  > ✅ Automated — `packages/core/src/parser/style-parser.test.ts` › `... does not flag legitimate comma-separated values like font-family`

- [x] AT-D: `StyleRule` / `StyleSelector` / `declarationLocs[propName]` に `SourceRange` がセットされる（Phase 1 の AST 拡張）
  > ✅ Automated — `packages/core/src/parser/style-parser.test.ts` › `StyleParser AST shape (Phase 1) › attaches a SourceRange to each rule, selector, and declaration`

- [x] AT-E: `StyleParser.parse(source)` は sheetId のデフォルトとして `<anonymous>` を、`StyleParser.parse(source, "<path>")` は与えられた値を、各 rule の `sheetId` にも伝搬する
  > ✅ Automated — `packages/core/src/parser/style-parser.test.ts` › `StyleParser AST shape (Phase 1) › uses '<anonymous>' as the default sheetId` / `... threads an explicit sheetId through every rule`

- [x] AT-F: 既存テスト (resolver / svg-builder / formatter) が新 AST shape でも壊れない
  > ✅ Automated — `pnpm --filter @karasu-tools/core test --run` で 1267+ tests 通過

- [ ] AT-G（manual）: VS Code / app の Monaco エディタで `.krs.style` を開き、`color: red, direction: down;` を書くと該当箇所に diagnostic（赤波線 / メッセージ）が表示される
  > 🧑 Manual — LSP 経由の表示確認。`pnpm --filter @karasu-tools/app dev` の Preview で `.krs.style` を開いて目視

## 補足

- 本 PR は Design Doc `docs/design/style-ast-shape.md` の **フェーズ 1**
  （位置情報追加 + `,` 誤用検出）に対応する。フェーズ 2/3（trivia 保持・
  構造化 value AST）は据え置き、機能要請が立ち上がった時に再検討する
- builtin / icon-theme は `<builtin>` / `<icon-theme>` の sentinel sheetId
  を使う。ファイルから読まれた `.krs.style` は `import-resolver.ts` で
  `filePath` を sheetId として渡す
- `StyleSheet.sheetId` は optional とした。test fixture で `{ rules: [...] }`
  リテラルを多数使っているため、強制すると 40 箇所以上の test を変える
  必要があった。`StyleRule.sheetId` は parser を通っていれば必ず必須で
  セットされるので、外向きの API としては実質 required と等価
