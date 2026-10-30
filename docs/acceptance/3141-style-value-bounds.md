---
type: product
---

# AT: スタイル値の診断が描画を説明する（範囲はスキーマ 1 か所、無効な宣言は cascade で 1 回捨てる）（#3141）

- **日付**: 2026-10-30
- **関連 Issue**: [#3141](https://github.com/kompiro/karasu/issues/3141)
- **Related TPLs**: [TPL-3141](../test-perspectives/TPL-3141-style-diagnostic-describes-drawing.md), [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)
- **対象ファイル**: `packages/core/src/style/property-schema.ts`、`packages/core/src/style/value-validator.ts`、`packages/core/src/style/cascade.ts`、`packages/core/src/parser/style-parser.ts`、`packages/core/src/resolver/style-resolver.ts`

> 範囲を持つスタイル値の許容範囲が、`PROPERTY_SCHEMAS`・validator・resolver の手書きのガードの 3 か所に書かれていて食い違い、著者が見る診断が描画を説明しなかった。範囲はスキーマ 1 か所にだけ置き、著者のシートでスキーマを満たさない宣言は cascade で外す（書かれなかったものとして扱う）。診断は宣言の位置で 1 回だけ出す。

## 受け入れ条件

### AC-1: 範囲外の値は 1 回報告され、宣言が無いときと同じに描かれる

- [x] AT-A: 範囲外の `label-position` / `label-max-chars` は `style-out-of-range`（`min` / `max` 付き）で報告され、宣言が無いときと同じに描かれる。範囲を持つ全プロパティを `PROPERTY_SCHEMAS` から導出して確かめる

  > ✅ Automated — `packages/core/src/style/schema-bounds.test.ts` › `TPL-3141: every bound in PROPERTY_SCHEMAS drops an out-of-range value once` › `%s: %s`
  >
  > ✅ Automated — `packages/core/src/style/value-validator.test.ts` › `validateStyleValues — values the schema reads one way (#3141)` › `reports a number outside a union's numeric range against that range`

- [x] AT-B: `grid-columns` の範囲外・非整数は、ノードの数によらず宣言ごとに 1 件だけ報告される

  > ✅ Automated — `packages/core/src/compile/all-views-project-styles.test.ts` › `reports a declaration once when two nodes share an id, as the per-view compile does`
  >
  > ✅ Automated — `packages/core/src/style/value-validator.test.ts` › `validateStyleValues — values the schema reads one way (#3141)` › `asks for an integer where only an integer will do`

- [x] AT-C: 無効な宣言の後は、弱いルールが同じプロパティに書いた有効な値が効く

  > ✅ Automated — `packages/core/src/style/cascade.test.ts` › `flattenSheetsInCascadeOrder — invalid declarations (#3141)` › `falls back to a weaker rule's valid value, not to the default`

- [x] AT-D: `color: primary` は従来どおり hex の診断になる。整数でない `label-max-chars` の診断は有効なキーワード `none` も示す

  > ✅ Automated — `packages/core/src/style/value-validator.test.ts` › `validateStyleValues — values the schema reads one way (#3141)` › `keeps a keyword's report on the first branch, so color stays readable`
  >
  > ✅ Automated — `packages/core/src/style/value-validator.test.ts` › `validateStyleValues — values the schema reads one way (#3141)` › `names the keyword too when a union's number is not an integer`

### AC-2: 単位と型の誤りも「— ignored」のとおりに描かれない

- [x] AT-E: `stroke-width: 4` は報告されて描かれず、`border-width: 0` は報告されずに枠が消える

  > ✅ Automated — `packages/core/src/integration/style-value-bounds.test.ts` › `style values the schema rejects are reported and not drawn (#3141)` › `reports a unitless non-zero length and draws the default width`
  >
  > ✅ Automated — `packages/core/src/integration/style-value-bounds.test.ts` › `style values the schema rejects are reported and not drawn (#3141)` › `accepts a unitless 0, so \`border-width: 0\` removes the border without a finding`

- [x] AT-F: ユーザーのスタイルが無いモデルの描画は変わらない（builtin の単位なしの長さが効いている）。builtin / icon theme のシートは位置によらず検査の対象外

  > ✅ Automated — `packages/core/src/integration/style-value-bounds.test.ts` › `style values the schema rejects are reported and not drawn (#3141)` › `keeps the builtin theme, which writes its lengths without a unit`
  >
  > ✅ Automated — `packages/core/src/style/cascade.test.ts` › `flattenSheetsInCascadeOrder — invalid declarations (#3141)` › `checks the sheets karasu ships by their rules' sheetId, wherever they sit`

### AC-3: 値を分類できない宣言も、報告せずに捨てない

- [x] AT-G: `opacity: -0.5 0.2` は報告されて描かれず、`label-offset: 0 8px` と `font-family: Noto Sans` は報告されずに効く

  > ✅ Automated — `packages/core/src/integration/style-value-bounds.test.ts` › `style values the schema rejects are reported and not drawn (#3141)` › `reports several parts where one number is expected, and draws the default`
  >
  > ✅ Automated — `packages/core/src/integration/style-value-bounds.test.ts` › `style values the schema rejects are reported and not drawn (#3141)` › `applies a two-length label-offset without a finding`
  >
  > ✅ Automated — `packages/core/src/integration/style-value-bounds.test.ts` › `style values the schema rejects are reported and not drawn (#3141)` › `applies an unquoted multi-word font name without a finding`

- [x] AT-H: `label-offset` は長さ 1 つ・2 つなら効き、3 つ以上なら 1 件の診断で宣言全体が外れる（先頭 2 つだけを使わず、弱いルールの値が効く）。カンマ区切りは offset として受けない

  > ✅ Automated — `packages/core/src/integration/style-value-bounds.test.ts` › `style values the schema rejects are reported and not drawn (#3141)` › `rejects a third label-offset length as a whole, so a weaker rule's value applies`
  >
  > ✅ Automated — `packages/core/src/style/value-validator.test.ts` › `validateStyleValues — sequence-of (label-offset)` › `rejects a comma between the lengths: a list is not a sequence`

- [x] AT-I: 値として持てないトークン・空の値・空のカンマ項目は parser が位置付きで 1 回報告し、宣言を格納しない

  > ✅ Automated — `packages/core/src/parser/style-parser.test.ts` › `refused values (#3141)` › `refuses a token no value can hold, with its position`
  >
  > ✅ Automated — `packages/core/src/parser/style-parser.test.ts` › `refused values (#3141)` › `refuses an empty comma item, in the middle or at the end`

### AC-4: 適用先ごとの警告 2 種は廃止され、宣言ごとの診断に置き換わる

- [x] AT-J: `style-column-invalid-value` / `style-grid-columns-invalid-value` は出ず、resolver は警告を足さない

  > ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `skips the hint without a resolver warning when the value is unknown (the validator reports it, #3141)`
  >
  > ✅ Automated — `packages/core/src/types/diagnostics-catalog.test.ts` › `diagnostics catalog completeness (TPL-1623)` › `names no retired code in docs/spec/diagnostics.md`

## 手動確認

N/A — 自動テストですべて覆っている
