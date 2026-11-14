---
id: ADR-3767
title: 必須の値を読む reader も、後の行で始まる次の edge を読まない
status: accepted
date: 2026-11-14
topic: parser
related_to:
  - ADR-3752
  - ADR-496
scope:
  packages: [core]
assumptions:
  - "symbol: packages/core/src/parser/property-readers.ts :: readValueAfter"
  - "symbol: packages/core/src/parser/property-readers.ts :: reportMissingValue"
  - "symbol: packages/core/src/parser/property-readers.ts :: parseLink"
  - "symbol: packages/core/src/parser/property-readers.ts :: parseIdOrString"
  - "symbol: packages/core/src/parser/node-path.ts :: opensEdgeOnLaterLine"
  - "symbol: packages/core/src/parser/edge-parser.ts :: parseAuthorIdSuffix"
  - "symbol: packages/core/src/parser/rejected-construct.ts :: rejectEdge"
  - "file: packages/core/src/parser/required-value-next-edge.test.ts"
  - "file: docs/acceptance/3767-required-value-stops-at-next-edge.md"
  - "file: docs/test-perspectives/TPL-3752-optional-trailing-token-stops-at-next-statement.md"
---

# ADR-3767: 必須の値を読む reader も、後の行で始まる次の edge を読まない

- **日付**: 2026-11-14
- **ステータス**: 決定済み・実装完了
- **関連**:
  - Issue: [#3767](https://github.com/kompiro/karasu/issues/3767)（#3752 の修正のレビューで発見）
  - PR: [#3784](https://github.com/kompiro/karasu/pull/3784)（Design Doc）, [#3787](https://github.com/kompiro/karasu/pull/3787)（実装）
  - 後続 Issue: [#3766](https://github.com/kompiro/karasu/issues/3766)（次の行に書いた label の扱い）
  - 関連 ADR: [ADR-3752](./3752-optional-string-stops-at-next-edge.md)（任意で続く要素の reader に同じ判定を入れた）, [ADR-496](./496-implicit-edge-source-shorthand.md)（node の block の中の暗黙の source の edge）
  - 関連 TPL: [TPL-3752](../test-perspectives/TPL-3752-optional-trailing-token-stops-at-next-statement.md), [TPL-3072](../test-perspectives/TPL-3072-parser-error-drops-exactly-the-rejected-construct.md), [TPL-2542](../test-perspectives/TPL-2542-sugar-form-shares-one-ast-and-element-ranges.md)
  - AT: [3767-required-value-stops-at-next-edge](../acceptance/3767-required-value-stops-at-next-edge.md)

## 背景

ADR-3752 は、任意で続く要素（edge の positional label、link の label、path の次の段、`role` / `team` の回復）を読む reader が、後の行で始まる edge の source を読まないようにした。値を必ず読む reader は対象外で、同じ失敗が残っていた。lexer は改行を token にしないので、値が欠けていると次の行の edge の source を値として読み、残った矢印が node の block の中では暗黙の source の edge になる。

main（ddad0e69）で `Parser.parse` に通して測った結果（service `a` の中に書いた場合）:

| 書いた 2 行                  | 読まれたモデル                     | 診断                                       |
| ---------------------------- | ---------------------------------- | ------------------------------------------ |
| `label` / `"x y" -> b`       | `label = "x y"` と `a -> b`        | なし                                       |
| `->` / `"x y" -> b`          | `a -> "x y"` と `a -> b`           | なし                                       |
| `description` / `"x y" -> b` | `description = "x y"` と `a -> b`  | なし                                       |
| `link` / `"x y" -> b`        | URL が `"x y"` の link と `a -> b` | warning `link-url-scheme-not-allowed` だけ |
| `domain` / `"x y" -> b`      | domain `"x y"` と `a -> b`         | なし                                       |

system 直下の `a ->` / `"x y" -> b` は `a -> "x y"` と `unexpected-token-in-block` 2 件になり、2 本目の edge が消えていた。

値が欠けたまま `}` が続くときの回復も、読んでいない token を値にしていた。`->` / `}` は target が `}` の edge を、`link` / `}` は URL が `}` の link を、`organization {` は id が `{` の organization を残していた。診断はどれも `ctx.error` で次の token の位置に出ており、位置を決めたのではなく `ctx.error` の作りから来ていた。

値を必ず読む位置に「後の行で、同じ行に矢印が続く id か文字列」が来る書き方は repo に無かった。core・lsp・cli のテスト 8,061 件（`examples/**/*.krs` を parse するテストを含む）と、`pnpm run lint:krs-fences` が parse する fence 494 件で 0 件だった。

## 決定

値を必ず読む reader は、値の位置の token が `opensEdgeOnLaterLine`（ADR-3752）を満たすとき、値が無いものとして扱う。値の無いことは構文の先頭から直前に読んだ token までの範囲で報告し、読んでいない token を値にしない。target の無い edge と URL の無い link はモデルから除く。同じ行の矢印は、1 行に複数の文を書く形として今どおり受理する。

対象は、`label`・`role`・`slack`・`github`・`description`・`link` の URL・edge の target・node（infra・sub-resource・`resource` を含む）と organization・boundary・facet・team・member の宣言の id・`contains`・`owns`・deploy の `label` と property の値である。判定は `property-readers.ts` の `readValueAfter`（値の token か `undefined` を返す）と `reportMissingValue`（構文の先頭から `ctx.previous()` までで報告する）にまとめ、reader ごとに書き写さない。

## 理由

- 規則が 1 つで済む: 値を読む reader は、任意でも必須でも、後の行で始まる edge を値にしない。ADR-3752 で `role` / `team` の回復までそろえたのと同じ考え方で、`parseLink` や `parseIdOrString` のように黙って違うモデルになる場所とならない場所の両方から呼ばれる reader を、呼ばれる場所で分けずに直せる
- 位置の規則も 1 つで済む。診断は直すべき場所（値を書き足す場所）を指し、次の行の edge で止まったときも `}` で止まったときも同じ位置になる。正しく書けた次の行の edge の source に error の波線が付かない。範囲が構文の先頭から始まるのは TPL-3072 に合う
- 読んでいない token を値にしないことで、TPL-3072（error は拒否した構文をちょうど 1 つ分だけモデルから除く）に合う。判定で止めても読まずに残した token が値になると、次の行の edge の source がモデルに 2 回現れる
- target の無い edge は、tag・`#id`・property block まで読み切ってから除く。property block を外の block に流すと、中の `label` が node の label になり、`}` が node を早く閉じる。positional label は読まない
- 同じ行の矢印（`-> b "x" -> c`、`link "u" "Docs" -> b`、`domain A { usecase u {} -> v }`）は書いた通りに読まれており、テストが受理を確かめている（`resolver/warnings.test.ts` の `domain A { usecase u {} -> v }` と、`parser.test.ts` の拒否した `role` の後の `role "A" -> B`）。改行の書き忘れか 2 本目の edge のつもりかは parser には区別できない
- organization 系の宣言の id が無く、次の行が edge を始めるときは、キーワードで止めて body の無い宣言として残す（kompiro が #3787 のマージで採用）。Design Doc は id を `__missing_id` にして残すとだけ書いていた。それだけでは宣言が開いていない `{` と body を読み、次の行の edge を中に取り込む。service の中の `boundary` は、その body の `}` で service を早く閉じる。id の無い node の宣言と同じ残し方にそろえ、id の後の positional label の reader も次の行の edge の source を読まないようにした
- edge と `resource` の行の後の `#id`（author id）の suffix も、後の行の `#next -> c` を読まない（kompiro が #3787 のマージで採用）。これは値が欠けていない入力の読み方を変えるので、Design Doc の制約「変わるのは、値が欠けた入力の回復だけ」から外れる。ただし任意で続く要素であり、ADR-3752 が直したのと同じ「黙って読み替わる」失敗である。修正前は `-> b` / `#next -> c` が `a -> b` に author id `next` を付け、`-> c` を 2 本目の暗黙の source の edge にして、診断を出さなかった

## 影響

- node の block の中で、値が欠けた行の次の行に edge を書いたモデルは、書いた通りの edge として読まれ、source がその node でなければ `edge-source-mismatch` の error になる。値の無い診断は構文の先頭（`label`・`->`・`a ->`・`domain` など）に 1 件出る
- 値が欠けて `}` が続く入力でも、診断の位置が次の token から構文の先頭に移る。コードと params は変わらない
- `link` の URL が無いときの診断が `token-type-mismatch` から `expected-string-after`（`property: "link"`）に変わる。`expected-string-after` の `property` の型に `"link"` を足した。i18n のメッセージは `property` をそのまま差し込むので、変更は要らなかった
- `parseEdge` は `KrsEdge | undefined` を返し、`ctx.tryParseEdge` は「edge を始めない」と「edge を読んだが target が無い」を区別して返す。edge を受け付けない block の `rejectEdge` は、target の無い edge を読み切ったものとして扱い、2 件目の error を出さない。トップレベルの `a ->` は今どおり `top-level-declaration` も出し、error は 2 件になる（直す場所が 2 つあるため）
- node の block の中の `-> b` / `#next -> c` は、`a -> b` と、source が `#next` の edge（`edge-source-mismatch`）として読まれる
- 暗黙の source を持てない場所では、`#id` の suffix の修正で error が warning だけになる入力がある。system 直下の `a -> b` / `#next -> c` は、修正前は `unexpected-token-in-block` 2 件だったが、修正後は `a -> b` と `#next -> c` の 2 本になり、`#next` が解決できない warning（`unresolved-edge-endpoint`）だけが出る。usecase の中の `resource R` / `#next -> c` も、修正前の `unexpected-token-in-block` 2 件が、`#next` が解決できず usecase から届かないという warning だけになる。どちらも 2 行を別の文として書いた通りに読んだ結果である
- 書いた通りに読めていた入力は、上の `#id` の suffix を除いて変わらない
- spec に変える記述は無い（値を必ず書くことは spec の通り）。`docs/spec/diagnostics.md` の各コードの説明も変わらない
- TPL-3752 を「任意で続く要素」から「値を読む reader（任意でも必須でも）」に広げ、チェックリストに `readValueAfter` / `ctx.expect` の grep と、対象外の場所の理由を足した

## 却下した案

- **黙って違うモデルになる reader だけを直す**（node の block の中で読む値に限る）: `parseLink` や `parseIdOrString` は、黙って違うモデルになる場所とならない場所の両方から呼ばれる。呼ばれる場所で判定を分けると、ADR-3752 が避けた「reader によって読み方が違う」状態を作る。次に値を読む reader を足すとき、どちらに合わせるかも決まらない
- **値はキーワードと同じ行に限る**（`handles` / `delivers` / `table` と同じ規則）: 今受理している「値を次の行に書く」形（`label` / `"x"`）を error にする。ADR-3752 が「label は直前の token と同じ行に限る」案を却下したのと同じ理由で、受理する言語を狭める判断になる
- **次の行の edge で止まったときだけキーワードで報告する**: 同じ診断が、次に何が来たかで違う位置に出る
- **読まずに残した token を今どおり値にする**: 次の行の edge で止めても、`a -> "x y"`・URL が `"x y"` の link・id が `"x y"` の boundary が残り、判定を入れた意味がなくなる
- **前の文と同じ行で始まる暗黙の source の edge を error にする**: テストが受理を確かめている形（`domain A { usecase u {} -> v }`、拒否した `role` の後の `role "A" -> B`）を error にし、受理する言語を狭める。bug の修正ではなく言語の判断になる
- **organization 系の宣言の id が無いとき、今どおり `{` と body を読む**: 次の行の edge が宣言の中に取り込まれ、service の中の `boundary` が service を早く閉じる
- **`#id` の suffix の修正を別 Issue にする**: 同じ失敗の写しが 1 つ残り、診断なしに違うモデルになる入力が残る

## 決めないこと

- node と organization 系の宣言の id が無いときに `__missing_id` で残す回復は変えない。TPL-3072 に照らすと宣言ごと除くのが筋だが、宣言の回復は本件の外で、変えると LSP の outline などにも影響する
- 末尾のドットの後の段が無いとき、`parseEdge` が読んでいない token の値を target に連ねる回復（`-> S.` / `}` が target `S.}` になる）は変えない。ADR-3752 で残すとした箇所で、次の行の edge は `readNodeIdPathTail` がすでに読まない
- `ctx.expect` で値を読む場所（`import` の path、deploy・deploy unit の id、legend の entry、capability の名前、client の `resource` の名前）は対象にしない。どれも edge を書けない場所か、edge を持たない block にあり、残った矢印は error になる。`ctx.expect` の診断 `token-type-mismatch` は次の token を `got` に出すので、同じ判定で止めるには診断を変える必要がある
- 次の行に書いた label の扱いと、`handles` などの「値はキーワードと同じ行」との違いは #3766 で決める。本 ADR の後も、矢印の続かない次の行の値は reader によって読み方が違う。`label` / `"x"` は label として読み、`handles` / `Order` は値の無い error をキーワードの位置に出す（`handles` / `delivers` / `table` は矢印が続くかどうかを見ない。TPL-2542）
