---
id: ADR-20260720-03
title: 出力する文字列「値」を lexer のデコード規則と 1:1 で escape し、表現不能な値には fallback を置く
status: accepted
date: 2026-07-20
topic: parser
related_to: [ADR-20260410-02, ADR-20260320-02, ADR-20260720-01, ADR-20260417-01, ADR-20260419-01]
assumptions:
  - "file: packages/core/src/formatter/quote-string.ts"
  - "symbol: packages/core/src/formatter/quote-string.ts :: escapeStringValue"
  - "symbol: packages/core/src/formatter/quote-string.ts :: emitDescription"
  - "symbol: packages/core/src/lexer/lexer.ts :: Lexer"
  - "file: packages/core/src/formatter/quote-string.test.ts"
---

# ADR-20260720-03: 出力する文字列「値」を lexer のデコード規則と 1:1 で escape し、表現不能な値には fallback を置く

- **日付**: 2026-07-20
- **ステータス**: 決定済み
- **関連**:
  - Issue: [#2087](https://github.com/kompiro/karasu/issues/2087)（`karasu fmt` が値の `"` / `\` を escape しない）
  - 実装 PR: (このコミットの PR)
  - ADR: [ADR-20260410-02](20260410-02-krs-formatter.md)（formatter — 冪等性の保証）、[ADR-20260320-02](20260320-02-ast-restructure-discriminated-union.md)（`"""` を verbatim Markdown 用に採用 = エスケープ機構を持たない制約の出所）、[ADR-20260720-01](20260720-01-formatter-top-level-exhaustiveness.md)（同種の「列挙漏れ」を機械検出する先例）、[ADR-20260417-01](20260417-01-translate-openapi-resource-grouping.md) / [ADR-20260419-01](20260419-01-translate-db-aggregate-grouping.md)（description ブロックを生成する translate 経路）
  - AT: [2087-fmt-escape-string-values.md](../acceptance/2087-fmt-escape-string-values.md)
  - TPL: [TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md)（round-trip 保証 — 本 ADR で「ID だけでなく値も escape」「表現不能な値には fallback」を追記）

## 背景

`karasu fmt` は文字列**値**を生のテンプレート補間で出力していた。

```ts
lines.push(`${indent}label "${node.label}"`);
```

値に `"` が含まれると出力が壊れる。`service A { label "say \"hi\"" }` は `label "say "hi""` になり、再 parse で **error 2 件**。ID 側は #1058 / #1101 で `quoteId()` に集約済みだったため「エスケープは対処済み」に見えており、値側が同じ穴を空けたまま残っていた。formatter だけで 24 箇所。

**より深刻なのは translate 側だった。** formatter の入力は人間が書いた `.krs` で、`"` を含む label は稀である。一方 translate の入力は外部ファイルの自由テキストで、OpenAPI の `summary` は散文である。`summary` に `"""` が含まれると `karasu translate --from openapi` の出力は **parse error 11 件**になり、生成物が丸ごと使えない。TPL-20260510-02 の `known_consumers` に translator が挙がっているのは、まさにこの非対称のためである。translate 側の emit site は 14 箇所。

本件は #2086（#2076 の修正）のレビュー中に発見された。#2076 で追加した 2 つの renderer が既存の生補間パターンをそのまま踏襲していたことが端緒である。

## 決定

### 1. escape 集合は lexer のデコード規則と 1:1 にする

`escapeStringValue()` は `\` → `\\`、`"` → `\"`、改行 → `\n` の 3 種のみを escape する。karasu の lexer（`readString`）が解釈するのはこの 3 種だけで、**それ以外の `\<char>` は素の `<char>` を返す**ためである。

したがって「安全側に倒して多めに escape する」は誤りになる。`\r` を `\\r` として出力すると、読み戻したときに文字 `r` になり**値が壊れる**。escape 集合は多くても少なくてもいけない。CR を含む escape 対象外の文字は生のまま出力する（`readString` は `"` 以外の任意バイトをそのまま取り込むので round-trip する）。

置換順序も規約の一部である。`\` を最初に処理しないと、後続の規則が導入した `\` を二重に escape して値が壊れる。

### 2. 改行は生のままにせず escape する

生の改行でも再 parse は通る（`readString` は行をまたぐ）。それでも `\n` に escape する。formatter の出力は行指向であり、コメントの再配置は行番号をキーにしているため、値の途中で改行するとブロックが「1 行 1 プロパティ」でなくなり、冪等性（ADR-20260410-02 決定 4）も崩れるためである。

### 3. `"""` を含む値は単一行形式に fallback する

triple-quote は raw で、最初の `"""` で終端する（ADR-20260320-02）。よって `"""` を含む値は triple-quote 形式では**表現不能**である。この場合は `\n` escape 付きの単一行形式に落とす。長い Markdown では読みにくくなるが、`"""` を literal に含む値でしか発動しない。

判定と出力は `emitDescription()` に集約し、formatter と translate の両方から呼ぶ。同じ規則を 2 箇所に書けば、いずれ片方だけがドリフトする。

### 4. 網羅性は「生補間が 0 件」というソースレベルの不変条件で守る

emit site を列挙するテストは [ADR-20260720-01](20260720-01-formatter-top-level-exhaustiveness.md) と同じ理由でドリフトする（テストの列挙と実装の列挙が同じ思い込みから生まれる）。そこで **formatter のソースに `` `"${` `` パターンが 1 件も存在しないこと**をアサートする。修正後は値がすべて `quoteString()` / `quoteId()` 経由になるため、この不変条件は「次に追加される emit site が escape を忘れた瞬間」に破れる。

負のテストで空振りしないことを確認済み（escape を無効化すると 28 件、生補間を 1 箇所戻すと構造ガードが落ちる）。

### 5. spec に escape 規則を明記する

`docs/spec/syntax.md` には escape に関する記述が一切なかった。lexer が `\"` / `\\` / `\n` を解釈することも、`"""` が raw であることも未文書であり、実装だけが知っている状態だった。§ String values and escapes を追加し、TPL-20260510-02 と相互リンクする。

## 却下した案

### 値にも `quoteId()` を使う

ID と値で escape 規則自体は同じなので、一見すると流用できる。却下。`quoteId()` は「bare で出せるなら引用符を外す」正規化を含んでおり（`needsQuotes()`）、値に適用すると `label "hello"` が `label hello` になって構文が壊れる。関心が異なるので別関数にした。

### `"""` にエスケープ機構を追加する

`\"""` のような escape を triple-quote 内に導入すれば fallback が要らなくなる。却下。ADR-20260320-02 が `"""` を選んだ理由は **verbatim な Markdown を書けること**であり、エスケープ処理を入れるとその前提が崩れる（Markdown 中の `\` が意味を持ってしまう）。構文変更でもあり、spec 改訂と移行が必要になる。表現不能な値は稀なので、fallback の方が費用対効果が高い。

### translate 側は別 Issue に切る

Issue のタイトルは `karasu fmt` だけを指しており、formatter に閉じれば diff は小さい。却下（ユーザー確認のうえ）。根本原因と修正が同一で、実害は translate 側が大きい。加えて #2076 は「一度直った修正が別ブランチで失われて再発した」事例であり、同じ根本原因を 2 つの Issue に分けると同じ経路で片方が落ちる。

### 生補間を lint ルール（oxlint）で禁止する

ソースレベルのガードを test ではなく lint に置く案。却下ではなく見送り。カスタムルールを書くコストに対して、対象が現状 1 ファイルであり、test で十分に表現できる。emit site が他パッケージへ広がったら再検討する。

## 影響

- `karasu fmt` / `karasu translate` の出力は、escape が必要な値を含む場合のみ変化する。既存の安全な値に対する出力は 1 バイトも変わらない（translate の既存テスト 144 件が無改変で通ることで確認）
- `"""` を含む description は triple-quote から単一行形式に変わる。該当する既存ファイルは、これまで出力が壊れていたケースなので実質的に新規挙動
- `.changeset` は `@karasu-tools/core` / `karasu` の patch（利用者に影響するバグ修正）
