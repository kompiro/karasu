---
type: product
---

# AT: 必須の値が欠けていても、後の行で始まる edge を値として読まない（#3767）

- **日付**: 2026-11-14
- **関連 Issue**: [#3767](https://github.com/kompiro/karasu/issues/3767)（#3752 の修正のレビューで発見）
- **Related TPLs**: [TPL-3752](../test-perspectives/TPL-3752-optional-trailing-token-stops-at-next-statement.md), [TPL-3072](../test-perspectives/TPL-3072-parser-error-drops-exactly-the-rejected-construct.md)
- **対象ファイル**: `packages/core/src/parser/property-readers.ts`, `packages/core/src/parser/edge-parser.ts`, `packages/core/src/parser/block-contents.ts`, `packages/core/src/parser/node-parser.ts`, `packages/core/src/parser/infra-parser.ts`, `packages/core/src/parser/org-parser.ts`, `packages/core/src/parser/deploy-parser.ts`, `packages/core/src/parser/rejected-construct.ts`

> lexer は改行を token にしないので、値を必ず読む reader（`label`・`description`・`link` の URL・
> edge の target・宣言の id など）は、値が欠けていると次の行の edge の source を値として読んでいた。
> node の block の中では残った矢印が暗黙の source の edge になり、診断なしに違うモデルになった。
> どの reader も、後の行で次の edge を始める token を値にせず、値の無いことを構文の先頭で報告する。

## 受け入れ条件

### AC-1: 値の位置に後の行の edge があると、値にならず、構文の先頭で報告される

- [x] AT-A: service `a` の中で `label`・`description`・`link`・`->`・`domain` などの次の行に `"x y" -> b` を書くと、`"x y"` が値にならず、余分な `a -> b` も作られない。値の無い診断が 1 件、キーワード（`->` なら矢印、`a ->` なら `a ->`）の範囲に出る。organization・team・member・boundary・facet・deploy の各値と、infra・capability・`resource` の値でも同じ

  > ✅ Automated — `packages/core/src/parser/required-value-next-edge.test.ts` › `a required value stops at an edge on a later line (#3767)`

### AC-2: target の無い edge はモデルに残らず、次の行の edge は残る

- [x] AT-B: `->` の次の行に `"x y" -> b` か `x -> b` を書くと、その edge だけが `edge-source-mismatch` と一緒に残る。system 直下の `a ->` の次の行の `"x y" -> b` も残る。`->` の次が `}` なら edge は残らず、`-> { label "x" }` や `-> [t]` の後に書いた `label` は node の label になる

  > ✅ Automated — `packages/core/src/parser/required-value-next-edge.test.ts` › `an edge with no target (#3767)`

### AC-3: URL の無い link はモデルに残らない

- [x] AT-C: `link` の次が `}` か次の行の edge のとき、link は残らず、`expected-string-after`（`property: "link"`）が `link` の位置に出る

  > ✅ Automated — `packages/core/src/parser/required-value-next-edge.test.ts` › `a link with no URL (#3767)`

### AC-4: 値の後に `}` が続くときも、構文の先頭で報告される

- [x] AT-D: `label`・`description`・`domain` の次が `}` のとき、診断がそのキーワードの範囲に 1 件出る

  > ✅ Automated — `packages/core/src/parser/required-value-next-edge.test.ts` › `a missing value before \`}\` is reported at the construct (#3767)`

### AC-5: 書いた通りに読めていた入力は変わらない

- [x] AT-E: 同じ行の値、次の行に書いて矢印が続かない値と edge の target、同じ行の `-> b "x" -> c`・`link "u" "Docs" -> b`・`domain A { usecase u {} -> v }` は今と同じモデルになり、診断が出ない

  > ✅ Automated — `packages/core/src/parser/required-value-next-edge.test.ts` › `input that reads as written is unchanged (#3767)`

## 手動確認

N/A — 自動テストですべて覆っている
