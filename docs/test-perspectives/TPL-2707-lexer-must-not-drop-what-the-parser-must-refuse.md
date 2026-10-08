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
  - issue: "#2848"
  - issue: "#3093"
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
- **文字列の一部が消えたまま記録される**（#2848）: lexer が UTF-16 の単位で文字を判定していたため、BMP 外の文字はサロゲートペアの片割れ 2 つとしてどちらも識別子の文字判定に落ち、捨てられた。`from: 𠮷野家` は `"野家"` と記録され、分解形（NFD）の `café` は結合文字が捨てられて `cafe` になった。デーヴァナーガリーのように母音記号が結合文字である文字体系では、語そのものが 3 つに割れた。
- **記号の後ろの語が名前として読まれる**（#3093）: 文字でも数字でもない非 ASCII の文字（絵文字、`→`、ゼロ幅スペース、前に文字のない結合文字）は捨てられていた。`service 😀A` は `A` を宣言し、`A → B` は `A B` と読まれ、`Foo\u200BBar` は語が 2 つに割れた。いずれも診断なし。
- **参照が別の実在ノードに付け替わる**（#2707）: `A -> 2B` が `A -> B` として受理された。`B` が実在すると、図は正しく描かれているように見える。最も発見が遅れる形。
- **語彙の綴りが `.krs.style` と食い違う**（#2707、TPL-2509）: `[team-1]` は数字が消えて `team` と `-` に割れ、`.krs.style` の `[team-1]` セレクタが一致しなかった。
- **値の断片が次のキーとして診断される**（#2571 review、#2707）: `from: Legacy-Monolith` の `-` や `Shop.Legacy` の `.` が「未対応のキー」として報告された。著者はキーとして書いていないので、誤った場所に誘導される。

## チェックリスト

lexer / tokenizer を追加・変更するとき、または値や名前を読む parser ポジションを追加するときに確認する:

- [ ] 読み飛ばす分岐に落ちる文字の集合を、1 文字ずつの入力で実測してテストで固定したか（完全一致で。部分集合の検査では新しく捨てられ始めた文字を捕まえられない）
- [ ] 文字判定と実測を code point 単位で行っているか。UTF-16 の単位で見ると、BMP 外の文字は文字判定にも固定にも片割れとしてしか現れない。候補に BMP 外の文字と結合文字を含めたか
- [ ] その固定が空振りしないことを、分岐を 1 つ外して落ちることで確認したか（コーパスだけを入力にしたテストは、コーパスにその文字が無ければ空振りする）
- [ ] 値を読むポジションで、値が 1 トークンで読み切れて次が区切りであることを確かめているか。複数トークンの並びを先頭だけで読んでいないか
- [ ] 拒否した値を区切りまで消費し、その断片を次の要素（キー・子要素）として読んでいないか
- [ ] 裸で書ける形の判定を、lexer と同じ文字判定から導いているか（formatter が裸で出す値が parser に同じ値として読み戻せるか）

## 既知の対処パターン

- **捨てる集合の完全一致テスト**: `packages/core/src/lexer/lexer-discard.test.ts` は、印字可能な ASCII と非 ASCII の数字・文字を 1 文字ずつトークン化し、どのトークンにも覆われない文字の集合を定数と完全一致で比べる。あわせて、examples と `lint:krs-fences` が parse する docs の `krs` fence が頼っている捨てる文字が `=` と `;` 以外に無いことを確かめる。#2848 以降、lexer と固定はどちらも code point 単位で読む。#3093 以降、非 ASCII は標本ではなく U+0080 から U+10FFFF までの全 code point を 1 つずつ検査し、捨てられるものがゼロであることを確かめる（空白はテスト側に書き出した定義で除く）。
- **結合文字は語を続けるが始めない**: `isIdentPart` は `\p{M}` を含み、`isIdentStart` は含まない（#2848）。結合文字は直前の文字を修飾するので、分解形の `café` やデーヴァナーガリーの語は 1 語として読まれる。NFC と NFD は正規化せず、書かれたとおりに記録する（別の綴りとして扱う）。
- **捨てる前に、空白として読むべき文字を決める**: 捨てられることで区切りとして通っていた文字がある。#3093 は文字でも数字でもない非 ASCII を拒否するトークンにする前に、Unicode の `White_Space` と BOM を空白として読むようにした。順序を逆にすると、BOM 付きのファイルや全角スペースを含むファイルが壊れる。
- **捨てずに、どこも受理しないトークンにする**: #2707 は数字始まりの語を `TokenType.Number` として出し、#3093 は文字でも数字でもない非 ASCII を後続の語の文字とまとめて `TokenType.Unknown` として出した。どのポジションも黙っては受理しないので、受理される言語は広がらず、見えなかった入力が診断に変わる。全ての未分類文字を一度にトークン化する案は、黙認に頼っている `=` / `;` を壊すので採らなかった（範囲はコーパスで実測して決めた）。
- **値は 1 トークンで読み切る**: `parseAnnotations` の `readAnnotationParamValue` は、文字列リテラルか裸の語が単独で区切りの前にあるときだけ値として読み、それ以外は区切りまで消費して `annotation-param-value-unreadable` を出す。
- **「記録できなかった」を書き戻す側だけで止める**: 診断の register は描画も含む全ての面に効くので、error にすると `karasu render` や外部サービスまで拒否する。#2707 は warning のままにし、`format()` が `FORMAT_BLOCKING_CODES` の診断を名指しで拒否する。AST が著者の書いたものを保持していないとき、整形して書き戻すと必ず失われる、というのが判定条件である。
- **裸の語の判定を lexer から導く**: `isBareWord`（`packages/core/src/lexer/lexer.ts`）は `readToken` と同じ文字判定を使い、formatter の `needsQuotes`（`packages/core/src/formatter/quote-id.ts`）もキーワード集合ともども lexer から導く。手写しの一覧は `boundary` など 5 語を欠き、`from: "boundary"` が裸で出力されてキーワードとして読み戻されていた。

## 関連テスト

- `packages/core/src/lexer/lexer-discard.test.ts`（捨てる文字の集合の固定と、コーパスが頼る文字の固定）
- `packages/core/src/lexer/lexer.test.ts` › `words that start with a digit (#2707)`
- `packages/core/src/lexer/lexer.test.ts` › `characters outside the BMP and combining marks (#2848)`
- `packages/core/src/lexer/lexer.test.ts` › `non-ASCII characters outside words (#3093)`
- `packages/core/src/parser/parser.test.ts` › `non-ASCII characters outside words (#3093)`
- `packages/core/src/parser/annotation-params.test.ts` › `bare values with characters outside the BMP or combining marks (#2848)`
- `packages/core/src/parser/annotation-params.test.ts` › `annotation parameter values that are not one token (#2707)`
- `packages/core/src/parser/parser.test.ts` › `digit-led words outside vocabulary positions (#2707)`
- `packages/core/src/formatter/annotation-params-round-trip.test.ts` › `reads back every reference it prints bare (#2707)`

## 派生元 spec

- `docs/spec/syntax.md` § Lexical structure（文字列とコメントの外の各文字を空白・語・拒否されるトークン・読み飛ばす ASCII 記号のどれかとして読む）。本 TPL はその表から外れて文字が黙って捨てられたときに検出する観点。
- `docs/spec/tags-annotations.md` § Annotation parameters（値は文字列リテラル 1 つか裸の語 1 つ、1 つの要素でパラメータの値は 1 つ）。本 TPL はその規定が lexer の読み飛ばしや先頭トークンだけの読み取りで破られたときに検出する観点。
