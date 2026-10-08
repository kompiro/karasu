---
id: ADR-2707
title: 引用符なしのアノテーションパラメータ値を壊さずに拒否する
status: accepted
date: 2026-10-08
topic: parser
related_to: [ADR-2571, ADR-1568, ADR-1995, ADR-2087, ADR-2076]
scope:
  packages:
    - core
    - i18n
assumptions:
  - "grep: packages/core/src/types/tokens.ts :: Number = \"Number\""
  - "symbol: packages/core/src/lexer/lexer.ts :: readNumber"
  - "symbol: packages/core/src/lexer/lexer.ts :: isBareWord"
  - "symbol: packages/core/src/parser/kebab-name.ts :: isWordToken"
  - "symbol: packages/core/src/parser/parser.ts :: readAnnotationParamValue"
  - "symbol: packages/core/src/formatter/formatter.ts :: FORMAT_BLOCKING_CODES"
  - "grep: packages/core/src/formatter/formatter.ts :: \"annotation-param-value-unreadable\""
  - "grep: packages/core/src/formatter/formatter.ts :: \"annotation-param-conflict\""
  - "file: packages/core/src/lexer/lexer-discard.test.ts"
  - "file: docs/acceptance/2707-annotation-param-value.md"
  - "file: docs/test-perspectives/TPL-2707-lexer-must-not-drop-what-the-parser-must-refuse.md"
---

# ADR-2707: 引用符なしのアノテーションパラメータ値を壊さずに拒否する

- **日付**: 2026-10-08
- **ステータス**: 決定済み
- **関連**:
  - Issue #2707（起点）、設計 PR #2795（本 ADR に集約し削除: `docs/design/annotation-param-value-lexing.md`）、実装 PR #2845
  - 後継 Issue: #3104（per-occurrence な `annotationParams`）
  - 同じ観点の後続: #2848（lexer を code point 単位で読む）、#3093（文字でも数字でもない非 ASCII を拒否するトークンにし、Unicode の空白を空白として読む）。どちらも `docs/spec/syntax.md` § Lexical structure と TPL-2707 に記録した
  - [ADR-2571](2571-fmt-annotation-parameters.md)（本件を「却下（範囲外）」として分離し、専用診断の追加と register の選択を #2707 に送った）、[ADR-1568](1568-migration-intent-fields.md)（パラメータ構文）、[ADR-1995](1995-draft-confidence-annotation.md)（`confidence` の verbatim 保持）、[ADR-2087](2087-escape-emitted-string-values.md) / [ADR-2076](2076-formatter-top-level-exhaustiveness.md)（同じ round-trip 系列）
  - TPL: [TPL-2707](../test-perspectives/TPL-2707-lexer-must-not-drop-what-the-parser-must-refuse.md)（本件で起こした TPL）、[TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)、[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)、[TPL-2509](../test-perspectives/TPL-2509-kebab-name-positions-share-one-lexical-rule.md)、[TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md)、[TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md)
  - AT: `docs/acceptance/2707-annotation-param-value.md`
  - コード: `packages/core/src/lexer/lexer.ts`、`packages/core/src/parser/parser.ts` の `parseAnnotations` / `readAnnotationParamValue`、`packages/core/src/parser/kebab-name.ts`、`packages/core/src/formatter/formatter.ts` の `FORMAT_BLOCKING_CODES`、`packages/core/src/formatter/quote-id.ts`

## 背景

`.krs` の lexer は `readToken` の `default` 節で、どの分岐にも当たらない文字を 1 文字進めて捨てていた。
数字はこの節に落ちたため、`@deprecated(until: 2026-12-31)` の `2026` `12` `31` はトークンにならずに消え、
`-` だけが 2 つ残った。parser はそれが日付だったと知る手がかりを持たない。

Issue が挙げた症状は 3 つで、根は同じだった。

1. **値が壊れる**: 引用符なしの hyphen 付き値が `-` として記録され、`karasu fmt` が `until: "-"` を著者のファイルに書き戻した。
2. **読めない値に診断が無い**: ADR-2571 が `""` の捏造をやめた結果、読めない値は「記録しないが何も言わない」状態だった（TPL-1503 が禁じる形）。
3. **同名アノテーションの 2 回目が 1 回目を上書きする**: `annotationParams` は名前とキーごとに 1 スロットしか持たず、`fmt` が著者の 1 つ目の値を 2 つ目で書き潰した。

設計時の実測（main @ 99de3440）では、被害は Issue が挙げた 2 例より広かった。

| 入力 | 修正前の AST | 修正前の診断 |
| --- | --- | --- |
| `@deprecated(until: 2026-12-31)` | `until: "-"` | `-` を未対応のキーとして警告（誤り） |
| `@deprecated(until: 2026abc)` | `until: "abc"` | なし |
| `@migration_target(from: Legacy-Monolith)` | `from: "Legacy"` | `-` を未対応のキーとして警告（誤り） |
| `@migration_target(from: Shop.Legacy)` | `from: "Shop"` | `.` を未対応のキーとして警告（誤り） |
| `service A [2026]` | タグが消える | なし |
| `service A [team-1]` | `tags: ["team", "-"]` | 断片名について `tag-not-builtin` × 2 |
| `service 2Foo` | `id: "Foo"` | なし |
| `A -> 2B`（`service B` が存在する） | edge `A -> B` | なし |

最も重いのは `A -> 2B` で、存在しない終端が別の実在ノード `B` に黙って付け替わり、図は正しく見える。
`[team-1]` は `.krs.style` 側では 1 つの名前として読まれるので、同じ綴りのタグとセレクタが一致しなかった（TPL-2509）。

背骨は 1 つで、**lexer が裸で書けると判定する語の集合と、`quote-id.ts` の `needsQuotes()` が裸で出してよいと判定する集合が食い違っていた**（TPL-1101 が root cause として記録している食い違い）。

## 決定

lexer は数字始まりの語を捨てずにどのポジションも黙って受理しないトークンとして出し、パラメータの値は 1 トークンで読み切れるものだけを記録し、読めない値と矛盾する値は描画を止めない warning として報告したうえで `fmt` だけが書き込みを拒否する。

1. **lexer**: 数字で始まる語（`2026`、`2026abc`）を 1 つの `TokenType.Number` として出す。語の後半の文字も同じトークンに含め、診断が著者の書いた語全体を覆うようにする。`=` と `;` の読み飛ばしはコーパスが頼っているので変えない。
2. **kebab 名**: `kebab-name.ts` の `isWordToken` が `Number` を先頭以外の断片として受ける。`[team-1]` / `@phase-2` / `capability p2p-2` はそれぞれ 1 つの名前になり、`.krs.style` の綴りと一致する。lexer だけを変えると `[team-1]` は `team` `-` `1` の 3 断片に悪化するので、2 つは対で入れる。
3. **パラメータ値**: 値は文字列リテラル 1 つか裸の語 1 つで、その次が `,` / `)` / EOF のときだけ読む（`readAnnotationParamValue`）。それ以外は次の区切りまで消費し、何も記録せず、`annotation-param-value-unreadable` を出す。誤ったキー名の `annotation-param-unsupported` は出さない。
4. **繰り返し**: 同じアノテーションを 1 つの要素に 2 回書いたら `duplicate-annotation`、1 つのパラメータに 2 つ目の異なる値が来たら `annotation-param-conflict`。最初の値を残す。1 つのアノテーションの中でキーを繰り返した場合（`@deprecated(until: "a", until: "b")`）も、AST のスロットが同じなので conflict として扱う。
5. **register**: 3 コードとも warning とする。`format()` は `FORMAT_BLOCKING_CODES`（`annotation-param-value-unreadable` と `annotation-param-conflict`）を名指しで拒否し、ファイルを書き換えずに終了する。判定基準は「整形するとき著者が書いたものが失われるか」で、これは `fmt` 自身の契約である。
6. **裸の語の判定を 1 つにする**: parser の値読みと formatter の `needsQuotes()` は、どちらも lexer の `isBareWord` とキーワード集合から導く。`quote-id.ts` の手写しのキーワード一覧は `boundary` など 5 語を欠いており、`from: "boundary"` が裸で出力されてキーワードとして読み戻されていた。
7. **捨てる文字の固定**: `lexer-discard.test.ts` が、捨てる文字の集合を 1 文字ずつの入力で実測して完全一致で固定し、コーパス（examples と `lint:krs-fences` が parse する doc fence）が頼る捨てる文字が `=` と `;` だけであることを確かめる。観点は TPL-2707 として起こした。

## 理由

- **根本原因を直す**: parser 側だけで「次が `)` でなければ拒否」とすると headline は消えるが、`until: 2026abc` が `"abc"` を捏造する経路、`A -> 2B` が既存の `B` に付け替わる経路、`[2026]` と `service 2Foo` の黙殺が残る。lexer で直せば全部が同時に閉じる。
- **黙って受理するポジションが無い**: `Number` は多くのポジションで parse エラーになり記録されない。AST に残るのはタグ（`tag-not-builtin` 付き）とエッジ終端（`expected-id-or-string` の error 付き）の 2 箇所だけで、どちらも診断が付く。
- **コーパスへの影響がゼロ**: examples 85 本と doc fence 361 本で、数字は 1 度も捨てられていなかった。数字のトークン化と縫合の 1 行を当てた状態で core 4409 テストが無改変で通った。
- **warning + `fmt` だけの拒否（決定 5）**: error は `fmt` に閉じない。`karasu render` は SVG を書く前に exit 1 になり、nest のギャラリーはモデルを拒否する。ライフサイクル系アノテーションは描画を止めないという spec の約束に反する。一方 warning のままでは `fmt --write` が著者の値を消すか上書きする。拒否を `fmt` の側に置けば、描画は続き、ファイルは守られる。
- **値ポジションに縫合を広げない**: TPL-2509 の縫合規則は open vocabulary の名前ポジションの規約で、値ポジションの「裸で書ける形」は `needsQuotes()` がすでに定義している。

## 却下した案

- **parser 側だけで 1 トークンを要求する（lexer は触らない）**: 影響範囲は `parseAnnotations` に閉じるが、上の「根本原因を直す」で挙げた経路が残る。次に値を読むポジションが増えたとき同じバグが再演する。
- **hyphen 付きの裸の値を縫合して受理する（`until: 2026-12-31` を正式な綴りにする）**: ADR-2571 決定 3（値種ごとに正準形は 1 つ）により、受理しても `fmt` が即座に `until: "2026-12-31"` に書き換えるので、著者に差分が出る以外の効果がない。`from` はノード参照であり、`Legacy-Monolith` を裸で受けるとノード id の綴り規則と食い違う。
- **読めない値と conflict を error にする**: 設計 PR #2795 のレビューでいったん採用した register。データ損失を告知ではなく停止で防ぐという論理は正しいが、error は `fmt` 以外の面（`karasu render`、nest）も止める。実装 PR #2845 で、停止を `fmt` に限定する決定 5 に置き換えた。
- **`duplicate-annotation` の warning を出すだけ**: 警告は `fmt` を止めないので、`fmt --write` が今日どおり 1 つ目の値を 2 つ目で上書きする。データ損失を告知するだけで止めない。
- **`annotationParams` を per-occurrence 表現に変える**: 忠実で、TPL-1101 の #2650 パターン（AST が境界を捨てていると formatter では復元できず、対処は AST 側に入る）に照らせば最終的な対処はこれである。ただし同名アノテーションを別々のパラメータで書く実需要が観測されておらず、スキーマ移行のコスト（型 2 箇所、parser、formatter、`getMigrationIntent` / `getDraftState` / `compile.ts`、網羅性テスト）は確定している。ADR-2571 も別 ADR を要する範囲として分離していた。後継 Issue #3104 に送り、それまでは決定 4 と 5 でデータ損失を止める。
- **全ての未分類文字をトークン化する**: 5 テストが落ちた。いずれも `realizes = "X"; runtime = "node:20";` を使う古い fixture で、`=` と `;` の読み飛ばしに頼っていた。数字だけを扱い、`=` と `;` の扱いは決めない。

## 影響

- **既存ファイル**: 引用符なしの `until: 2026-12-31` を書いたファイルは、描画は続くが `fmt --write` が書き込みを拒否する（引用符で囲めば通る）。すでに `until: "-"` が焼き込まれたファイルは引用符つきの文字列なので、`"-"` という値として残る。診断が出ない形なので自動マイグレーションはしない。
- **壊れた入力の診断**: `service 2Foo` と `A -> 2B` は沈黙から error に、`[2026]` は消滅から警告付きのタグに変わる。examples とドキュメントに該当は無い（実測）。
- **error だった入力が通る**: `@phase-2` と `capability p2p-2` は parse エラーから 1 つの名前になる。どちらも以前は `fmt` できなかった入力なので、既存ファイルの `fmt` 出力は変わらない。
- **`TokenType.Number` という名前**: `2026abc` も `Number` になるので厳密には数値ではないが、lexer の慣用に合わせて残した。#3093 で、文字でも数字でもない非 ASCII を同じ形で受ける `TokenType.Unknown` を足した。
