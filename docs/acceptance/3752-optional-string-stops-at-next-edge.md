---
type: product
---

# AT: 後の行で引用符付きの id から始まる edge が、前の構文の label にならない（#3752）

- **日付**: 2026-11-12
- **関連 Issue**: [#3752](https://github.com/kompiro/karasu/issues/3752)（#3481 のテストを書くときに発見）
- **Related TPLs**: [TPL-3752](../test-perspectives/TPL-3752-optional-trailing-token-stops-at-next-statement.md), [TPL-3072](../test-perspectives/TPL-3072-parser-error-drops-exactly-the-rejected-construct.md)
- **対象ファイル**: `packages/core/src/parser/node-path.ts`, `packages/core/src/parser/edge-parser.ts`, `packages/core/src/parser/property-readers.ts`, `packages/core/src/parser/block-contents.ts`

> lexer は改行を token にしないので、edge の positional label と link の label は、次の行が
> 引用符付きの id で始まる edge だと、その id を label として読んでいた。system 直下では
> 2 本目の edge が消えて error になり、node の block の中では残った矢印が暗黙の source の edge になって、
> 診断なしに違うモデルになった。どちらの reader も、後の行で次の edge を始める token を読まない。

## 受け入れ条件

### AC-1: system 直下では 2 本の edge として読まれる

- [x] AT-A: `a -> "b->c"` の次の行に `"a->b" -> c` を書くと、label の無い 2 本の edge になり、診断が出ない。`-->` でも同じで、2 行を逆の順に書いたモデルと同じになる

  > ✅ Automated — `packages/core/src/parser/optional-string-next-edge.test.ts` › `an optional string stops at an edge on a later line (#3752)` › `at system scope`
  >
  > ✅ Automated — `packages/core/src/index.test.ts` › `compile — edge#<canonical id> written the way the app writes it` › `gives endpoints containing -> their own id and a rule that names one of them, with $order`

### AC-2: node の block の中では、書いた通りの edge として読まれる

- [x] AT-B: service `a` の中で `-> b` か `link "…"` の次の行に `"x y" -> b` を書くと、`"x y"` が label にならず、余分な `a -> b` も作られず、`edge-source-mismatch` の error になる。source がその service（`"a" -> c`）なら診断なしで別の edge になる

  > ✅ Automated — `packages/core/src/parser/optional-string-next-edge.test.ts` › `an optional string stops at an edge on a later line (#3752)` › `inside a node block`

### AC-3: 末尾のドットの後でも、次の行の edge が残る

- [x] AT-C: `a -> S.` の次の行に `"x" -> c` を書くと、素の id のときと同じく error 1 件で、`x -> c` も残る

  > ✅ Automated — `packages/core/src/parser/optional-string-next-edge.test.ts` › `an optional string stops at an edge on a later line (#3752)` › `after a trailing dot`

### AC-4: 次の行に書いた label と、同じ行の書き損じの読み方は変わらない

- [x] AT-D: target の次の行に書いた `"calls"`、`-> b` / `"calls"` / `-> c` の `"calls"` は label として読まれ、同じ行の `a -> b "x" -> c` は今と同じく label `"x"` と error になる

  > ✅ Automated — `packages/core/src/parser/optional-string-next-edge.test.ts` › `an optional string stops at an edge on a later line (#3752)` › `what stays the same`
  >
  > ✅ Automated — `packages/core/src/parser/node-path.test.ts` › `readNodeIdPathTail` › `reads a segment whose following arrow is on a later line`

## 手動確認

N/A — 自動テストですべて覆っている
