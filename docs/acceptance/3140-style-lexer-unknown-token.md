---
type: product
---

# AT: スタイルシートの lexer が `-` と非 ASCII 文字を黙って捨てない（#3140）

- **日付**: 2026-10-17
- **関連 Issue**: [#3140](https://github.com/kompiro/karasu/issues/3140)
- **Related TPLs**: [TPL-2707](../test-perspectives/TPL-2707-lexer-must-not-drop-what-the-parser-must-refuse.md), [TPL-2509](../test-perspectives/TPL-2509-kebab-name-positions-share-one-lexical-rule.md)
- **対象ファイル**: `packages/core/src/lexer/style-lexer.ts`、`packages/core/src/parser/style-parser.ts`（`parseValue`）、`packages/core/src/lexer/lexer.ts`（共有する文字の判定）

> `.krs.style` の lexer は、数字も矢印も始めない `-` と、すべての非 ASCII 文字を捨てていた。parser はそれを見ないので拒否もできず、`label-offset: - 20px` は `20px` として効き、非 ASCII の id や facet を指す selector は当たらなかった。名前は `.krs` と同じ文字の分類で読み、置き場の無い文字は拒否されるトークンにする。

## 受け入れ条件

### AC-1: 置き場の無い文字は診断になり、宣言は効かない

- [x] AT-A: `label-offset: - 20px` / `--20px` / `0 - 20px` は `style-token-type-mismatch` の error になり、ラベルは既定の位置のまま。`-20px` は従来どおり効く

  > ✅ Automated — `packages/core/src/integration/style-sheet-unknown-characters.test.ts` › `characters the style lexer used to drop (#3140)` › `refuses label-offset: %s with an error instead of applying 20px`
  >
  > ✅ Automated — `packages/core/src/integration/style-sheet-unknown-characters.test.ts` › `characters the style lexer used to drop (#3140)` › `still applies a signed label-offset`

- [x] AT-B: 語を始めない非 ASCII 文字（`[😀]`）は、後ろの語の文字と合わせて 1 つの Unknown トークンになり、selector で error になる

  > ✅ Automated — `packages/core/src/integration/style-sheet-unknown-characters.test.ts` › `characters the style lexer used to drop (#3140)` › `reports a selector character that starts no word`
  >
  > ✅ Automated — `packages/core/src/lexer/style-lexer.test.ts` › `StyleLexer — characters outside ASCII (#3140)` › `reads a character that starts no word as one Unknown token with its word tail`

- [x] AT-C: U+0080〜U+10FFFF のどのコードポイントも捨てられず、空白・語・Unknown トークンのどれかとして読まれる。捨てる印字可能 ASCII の集合から `-` が外れる

  > ✅ Automated — `packages/core/src/lexer/style-lexer.test.ts` › `StyleLexer — characters outside ASCII (#3140)` › `drops no non-ASCII code point`
  >
  > ✅ Automated — `packages/core/src/lexer/style-lexer.test.ts` › `StyleLexer — the printable ASCII characters it drops` › `drops exactly this set when the character stands alone`
  >
  > ✅ Automated — `packages/core/src/lexer/style-lexer.test.ts` › `StyleLexer — a hyphen that starts no number or arrow (#3140)` › `keeps %s as an Unknown token instead of dropping it`

### AC-2: 名前は `.krs` と同じ文字の分類で読む

- [x] AT-D: 非 ASCII の id selector（`#注文`）と facet selector（`[facets=個人情報]`）がノードに当たる。タグ selector `[日本語]` はタグ `日本語` として読まれる

  > ✅ Automated — `packages/core/src/integration/style-sheet-unknown-characters.test.ts` › `characters the style lexer used to drop (#3140)` › `matches a node through the non-ASCII selector %s`
  >
  > ✅ Automated — `packages/core/src/integration/style-sheet-unknown-characters.test.ts` › `characters the style lexer used to drop (#3140)` › `reads a non-ASCII tag selector as that tag, not as \`]\``

- [x] AT-E: BMP 外の文字・結合文字を含む名前が 1 語として読まれ、列は UTF-16 の長さで数える。Unicode の空白と BOM は空白として読む

  > ✅ Automated — `packages/core/src/lexer/style-lexer.test.ts` › `StyleLexer — characters outside ASCII (#3140)` › `reads a tag in any script as one identifier, as the .krs lexer does`
  >
  > ✅ Automated — `packages/core/src/lexer/style-lexer.test.ts` › `StyleLexer — characters outside ASCII (#3140)` › `counts a character outside the BMP as two columns, like the .krs lexer`
  >
  > ✅ Automated — `packages/core/src/lexer/style-lexer.test.ts` › `StyleLexer — characters outside ASCII (#3140)` › `reads Unicode whitespace and the byte order mark as whitespace`

## 手動確認

N/A — 自動テストですべて覆っている
