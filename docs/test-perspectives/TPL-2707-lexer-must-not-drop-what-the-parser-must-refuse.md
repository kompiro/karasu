---
id: TPL-2707
title: "lexer は parser が拒否すべき入力を黙って捨ててはならない"
status: active
date: 2026-09-15
applicable_to:
  - "トークンを出さずに文字を読み飛ばす分岐を持つ lexer / tokenizer"
  - "値や名前を 1 トークンとして読み、残りを次の要素として読み進める parser"
  - "parser の読める形と formatter の裸で出せる形が一致していることに依存する変換"
known_consumers:
  - krs-lexer
  - annotation-parameters
discovered_from:
  - issue: "#2707"
  - root_cause_file: "packages/core/src/lexer/lexer.ts :: readToken"
  - root_cause_file: "packages/core/src/parser/parser.ts :: parseAnnotations"
related_to:
  - TPL-1101
  - TPL-1503
  - TPL-2509
topic: parser
scope:
  packages: [core]
---

# TPL-2707: lexer は parser が拒否すべき入力を黙って捨ててはならない

## 観点

lexer が文字をトークンにせず読み飛ばすと、parser はその文字が書かれていたことを知る手段を持たない。
残ったトークンだけで文法上もっともらしい形ができれば、parser は受理し、診断は出ない。
**拒否は、拒否すべきものが parser に届いて初めて成り立つ。**

検証すべきことは 2 つある。

1. **lexer が捨てる文字の集合が明示されていて、テストで固定されている。** 捨てる分岐は「どの分岐にも当たらなかったもの」を受ける既定動作なので、新しい文字クラスが黙ってそこへ落ちる。集合を 1 文字ずつの入力で実測し、完全一致で固定する。
2. **値を読むポジションは、値を「最初の 1 トークン」で読まない。** 値が複数トークンにまたがって書かれたとき（`2026-12-31`、`Legacy-Monolith`、`Shop.Legacy`）、先頭だけを読むと値は切り詰められ、残りは次の要素として誤読される。値は 1 トークンで読み切れて次が区切りであることを確かめ、そうでなければ区切りまで消費して拒否する。

## 想定される失敗モード

- **値が別の値に化ける**（#2707）: lexer が数字を捨て、`@deprecated(until: 2026-12-31)` が `-` `-` として届いた。parser は `until: "-"` を記録し、`karasu fmt --write` がそれを著者のファイルに書き戻した。`until: 2026abc` は数字だけが消え、`"abc"` という診断ゼロのもっともらしい値になった。
- **参照が別の実在ノードに付け替わる**（#2707）: `A -> 2B` が `A -> B` として受理された。`B` が実在すると、図は正しく描かれているように見える。最も発見が遅れる形。
- **語彙の綴りが `.krs.style` と食い違う**（#2707、TPL-2509）: `[team-1]` は数字が消えて `team` と `-` に割れ、`.krs.style` の `[team-1]` セレクタが一致しなかった。
- **値の断片が次のキーとして診断される**（#2571 review、#2707）: `from: Legacy-Monolith` の `-` や `Shop.Legacy` の `.` が「未対応のキー」として報告された。著者はキーとして書いていないので、誤った場所に誘導される。

## チェックリスト

lexer / tokenizer を追加・変更するとき、または値や名前を読む parser ポジションを追加するときに確認する:

- [ ] 読み飛ばす分岐に落ちる文字の集合を、1 文字ずつの入力で実測してテストで固定したか（完全一致で。部分集合の検査では新しく捨てられ始めた文字を捕まえられない）
- [ ] その固定が空振りしないことを、分岐を 1 つ外して落ちることで確認したか（コーパスだけを入力にしたテストは、コーパスにその文字が無ければ空振りする）
- [ ] 値を読むポジションで、値が 1 トークンで読み切れて次が区切りであることを確かめているか。複数トークンの並びを先頭だけで読んでいないか
- [ ] 拒否した値を区切りまで消費し、その断片を次の要素（キー・子要素）として読んでいないか
- [ ] 裸で書ける形の判定を、lexer と同じ文字判定から導いているか（formatter が裸で出す値が parser に同じ値として読み戻せるか）

## 既知の対処パターン

- **捨てる集合の完全一致テスト**: `packages/core/src/lexer/lexer-discard.test.ts` は、印字可能な ASCII と非 ASCII の数字・文字を 1 文字ずつトークン化し、どのトークンにも覆われない文字の集合を定数と完全一致で比べる。あわせて、examples と `lint:krs-fences` が parse する docs の `krs` fence が頼っている捨てる文字が `=` と `;` 以外に無いことを確かめる。1 文字ずつの入力は UTF-16 の単位で見るので、BMP 外の文字（サロゲートペアの片割れ）はこの固定の外にあり、今も捨てられる。
- **捨てずに、どこも受理しないトークンにする**: #2707 は数字始まりの語を `TokenType.Number` として出した。どのポジションも黙っては受理しないので、受理される言語は広がらず、見えなかった入力が診断に変わる。全ての未分類文字を一度にトークン化する案は、黙認に頼っている `=` / `;` を壊すので採らなかった（範囲はコーパスで実測して決めた）。
- **値は 1 トークンで読み切る**: `parseAnnotations` の `readAnnotationParamValue` は、文字列リテラルか裸の語が単独で区切りの前にあるときだけ値として読み、それ以外は区切りまで消費して `annotation-param-value-unreadable` を出す。
- **裸の語の判定を lexer から導く**: `isBareWord`（`packages/core/src/lexer/lexer.ts`）は `readToken` と同じ文字判定を使い、formatter の `needsQuotes`（`packages/core/src/formatter/quote-id.ts`）もキーワード集合ともども lexer から導く。手写しの一覧は `boundary` など 5 語を欠き、`from: "boundary"` が裸で出力されてキーワードとして読み戻されていた。

## 関連テスト

- `packages/core/src/lexer/lexer-discard.test.ts`（捨てる文字の集合の固定と、コーパスが頼る文字の固定）
- `packages/core/src/lexer/lexer.test.ts` › `words that start with a digit (#2707)`
- `packages/core/src/parser/annotation-params.test.ts` › `annotation parameter values that are not one token (#2707)`
- `packages/core/src/parser/parser.test.ts` › `digit-led words outside vocabulary positions (#2707)`
- `packages/core/src/formatter/annotation-params-round-trip.test.ts` › `reads back every reference it prints bare (#2707)`

## 派生元 spec

- `docs/spec/tags-annotations.md` § Annotation parameters（値は文字列リテラル 1 つか裸の語 1 つ、1 つの要素でパラメータの値は 1 つ）。本 TPL はその規定が lexer の読み飛ばしや先頭トークンだけの読み取りで破られたときに検出する観点。
