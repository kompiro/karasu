# AT: `karasu fmt` / `translate` が文字列値を escape して出力する

- **日付**: 2026-07-20
- **関連 Issue**: [#2087](https://github.com/kompiro/karasu/issues/2087)
- **対象ファイル**:
  - `packages/core/src/formatter/quote-string.ts`（新規）
  - `packages/core/src/formatter/formatter.ts`
  - `packages/core/src/translate/{openapi,db,compose,k8s,wrangler}.ts`
- **関連**: ADR-2087（本件の決定）、ADR-438（formatter）、ADR-9008（`"""` は raw）、TPL-1101（round-trip 保証）

## 受け入れ条件

- [x] `label` に `"` を含む値が `fmt` を通っても parse 可能なまま残り、値が変化しない
  > ✅ Automated — `packages/core/src/formatter/escape-round-trip.test.ts` › `node label`、`preserves the decoded value, not the escaped text`

- [x] 文字列値を持つ全構文（label / description / role / link URL・label / edge label / deploy runtime・image・type・schedule / organization・team・member の label・slack・github / boundary label / legend title・entry label / import path）で hostile value が round-trip する
  > ✅ Automated — `escape-round-trip.test.ts` の 14 ケース（各ケースで parse エラー 0・AST 構造等価・冪等性を検証）

- [x] escape 集合が lexer のデコード集合と一致する（`\"` / `\\` / `\n` の 3 種のみ。それ以外は生のまま）
  > ✅ Automated — `packages/core/src/formatter/quote-string.test.ts` › hostile value 11 種の lexer round-trip、`leaves characters with no lexer escape raw`（CR を escape すると値が壊れることを固定）

- [x] escape の置換順序が正しい（`\` を先に処理しないと値が壊れる）
  > ✅ Automated — `escapes backslash before quote so the quote does not become an escape`

- [x] 繰り返し `fmt` してもバックスラッシュが増殖しない
  > ✅ Automated — `does not grow backslashes across repeated formatting`（5 回適用して値が不変）

- [x] `"""` を含む description が単一行形式に fallback し、round-trip する
  > ✅ Automated — `falls back from a triple-quote block when the body contains the terminator`、`quote-string.test.ts` › `canUseTripleQuote / emitDescription`

- [x] formatter のソースに生のテンプレート補間 `` `"${...}"` `` が 1 件も残っていない（次に追加される emit site の escape 忘れを検出する構造ガード）
  > ✅ Automated — `quote-string.test.ts` › `formatter emits no unescaped string values`

- [x] `karasu translate --from openapi` が `summary` に `"""` / 改行 / `"` を含む spec を渡されても parse 可能な `.krs` を出力し、summary 本文が失われない
  > ✅ Automated — `packages/core/src/translate/escape-hostile-input.test.ts` › `openapi: a summary containing the triple-quote terminator`、`a summary containing a newline`

- [x] `translate --from compose` / `--from k8s` が名前・image に `"` を含む入力でも parse 可能な `.krs` を出力する
  > ✅ Automated — `escape-hostile-input.test.ts` › `compose: ...`、`k8s: ...`

- [x] escape が無効化されたとき上記テストが実際に落ちる（ガードが空振りしていない）
  > ✅ Automated（負のテストで確認済み） — `escapeStringValue` を素通しにすると 28 件、生補間を 1 箇所戻すと構造ガードが落ちることを実測

## 範囲外（follow-up）

- **`translate --from db` が引用符付き SQL 識別子を落とす**: `CREATE TABLE "we""ird" (...)` は SQL パーサ側（`parseTables` の `headerPattern` が `\w+` のみ）でテーブルごと認識されず、出力が空になる。emit 前段の別バグであり本 Issue の escape とは独立。別 Issue で扱う。
- **`"""` を含む description の可読性**: fallback 先の単一行形式は長い Markdown では読みにくい。triple-quote 側に escape を導入する案は ADR-2087 で却下済み（verbatim Markdown の前提が崩れるため）。
- **生補間の禁止を lint ルール化**: 現状は formatter 1 ファイルを対象にした test でのガード。emit site が他パッケージに広がったら oxlint のカスタムルール化を再検討する（ADR-2087「却下した案」）。
