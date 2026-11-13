# 必須の値を読む reader も、後の行で始まる次の edge を読まない

- **日付**: 2026-11-13
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3767](https://github.com/kompiro/karasu/issues/3767)（#3752 の修正のレビューで発見）
  - 関連 ADR: [ADR-3752](../adr/3752-optional-string-stops-at-next-edge.md)（任意で続く要素の reader に同じ判定を入れた）, [ADR-496](../adr/496-implicit-edge-source-shorthand.md)（node の block の中の暗黙の source の edge）
  - 関連 TPL: [TPL-3752](../test-perspectives/TPL-3752-optional-trailing-token-stops-at-next-statement.md), [TPL-3072](../test-perspectives/TPL-3072-parser-error-drops-exactly-the-rejected-construct.md)
  - コード: `packages/core/src/parser/node-path.ts`, `packages/core/src/parser/property-readers.ts`, `packages/core/src/parser/edge-parser.ts`, `packages/core/src/parser/block-contents.ts`, `packages/core/src/parser/node-parser.ts`, `packages/core/src/parser/infra-parser.ts`, `packages/core/src/parser/org-parser.ts`, `packages/core/src/parser/deploy-parser.ts`

## 背景・課題

#3752 は、任意で続く要素（edge の positional label、link の label、path の次の段、`role` / `team` の回復）を読む reader が、後の行で始まる edge の source を読まないようにした。値を必ず読む reader は対象外で、同じ失敗が残っている。値が欠けていると、次の行の edge の source を値として読み、残った矢印が node の block の中では暗黙の source の edge になる。

main（ddad0e69）で `Parser.parse` に通して測った結果（service `a` の中に書いた場合）:

| 書いた 2 行 | 読まれたモデル | 診断 |
| --- | --- | --- |
| `label` / `"x y" -> b` | `label = "x y"` と `a -> b` | なし |
| `->` / `"x y" -> b` | `a -> "x y"` と `a -> b` | なし |
| `description` / `"x y" -> b` | `description = "x y"` と `a -> b` | なし |
| `link` / `"x y" -> b` | URL が `"x y"` の link と `a -> b` | なし |
| `domain` / `"x y" -> b` | domain `"x y"` と `a -> b` | なし |

system 直下の `a ->` / `"x y" -> b` は `a -> "x y"` と `unexpected-token-in-block` 2 件になり、2 本目の edge が消える。値が欠けたまま `}` が続く場合は、`label` は `}` の位置に `expected-string-after` を出す。`->` は `}` の位置に `expected-id-or-string` を出したうえで、target が `}` の edge `a -> }` をモデルに残している。

Issue はもう 1 つ、同じ行の矢印を挙げている。node の block の中の `-> b "x" -> c` は、label `"x"` の `a -> b` と、暗黙の source の `a -> c` の 2 本になる。`link "u" "Docs" -> b` も link と `a -> b` になる。system 直下の `a -> b "x" -> c` は暗黙の source を持てないので error になる。

## 現状（インベントリ）

値を 1 つ必ず読む reader（キーワードか矢印の直後で、id か文字列を値として読むもの）:

| reader | 場所 | 値が無いときの診断 | 診断の位置 |
| --- | --- | --- | --- |
| `label`（node・capability・infra・sub-resource・organization・boundary・facet・team・member・edge の property block） | `block-contents.ts` ×2, `infra-parser.ts` ×2, `org-parser.ts` ×5, `edge-parser.ts` | `expected-string-after` | 次の token |
| `role`, `slack`, `github` | `block-contents.ts`, `org-parser.ts` ×2 | `expected-string-after` | 次の token |
| `description` | `parseDescriptionValue`（`property-readers.ts`） | `expected-string-after` | 次の token |
| `link` の URL | `parseLink`（`property-readers.ts`、`ctx.expect`） | `token-type-mismatch` | 次の token |
| edge の target、organization・boundary・facet・team・member の id | `parseIdOrString`（`property-readers.ts`） | `expected-id-or-string` | 次の token |
| node の宣言の id（infra・sub-resource・`resource` を含む） | `node-parser.ts` ×2, `infra-parser.ts` ×2 | `expected-node-id` | 次の token |
| `contains`, `owns` | `org-parser.ts` ×2 | `expected-id-after` | 次の token |
| deploy の `label` と property の値 | `deploy-parser.ts` ×3 | `expected-property-value` | 次の token |
| deploy・deploy unit の id、legend の entry の label、client の `resource` の名前、`import` の path | `deploy-parser.ts` ×2, `legend-parser.ts` ×2, `block-contents.ts`, `parser.ts` ×2（`ctx.expect`） | `token-type-mismatch` | 次の token |

`handles` / `delivers`（カンマ区切りのリスト）は、すでに値の無いことをキーワードの位置で `expected-id-after` として報告し、次の行の edge を読まない（TPL-2542）。

このうち黙って違うモデルになるのは、残った矢印が暗黙の source の edge として読める block（service・domain など、ADR-496）の中で値を読む reader である。ほかの場所では、残った矢印が error になる。

値を必ず読む位置に「後の行で、同じ行に矢印が続く id か文字列」が来る書き方が repo にあるかを、上の reader に一時的な記録を入れて測った。core・lsp・cli のテスト 8,061 件（`examples/**/*.krs` を parse するテストを含む）と、`pnpm run lint:krs-fences` が parse する fence 494 件で、0 件だった。Issue の再現入力では記録が出ることを確かめた。

node の block の中で、前の文と同じ行から暗黙の source の edge を始める書き方も同じ方法で測った。テストに 4 件あり、どれも意図して受理している形だった:

- `domain A { usecase u {} -> v }`（`resolver/warnings.test.ts` の 3 件）
- service `A` の中の `role "A" -> B`（`parser.test.ts`。`role` を値ごと拒否し、`A -> B` を残すことを確かめるテスト）

## 制約・前提

- 書いた通りに読めていた入力の読み方は変えない。変わるのは、値が欠けた入力の回復だけにする
- 判定は `opensEdgeOnLaterLine`（ADR-3752）を使い、reader ごとに書き写さない
- 値が無いときに各 reader が出す診断のコードは変えない（新しいコードを足さない）
- 次の行に書いた label の扱いは #3766 で決める。本件では触らない

## 検討した選択肢

### 論点 1: どの reader を直すか

#### 案 1-A: 値を 1 つ必ず読む reader をすべて直す

上の表の reader はすべて、値の位置の token が `opensEdgeOnLaterLine(ctx, <キーワードか矢印>)` を満たすとき、値が無いものとして扱う。値が無いときの今の回復（診断を出して読まずに進む）にそのまま入る。

判定は共有の reader に寄せる。`parseIdOrString`・`parseDescriptionValue`・`parseLink` の中に入れ、`if (peek が X) advance else error` の形の各所は新しい共有の関数 `readValueAfter(ctx, after, ...types)`（値の token か `undefined` を返す）に置き換える。`ctx.expect` の各所も同じ関数を通す。

**メリット**

- 規則が 1 つで済む: 値を必ず読む reader は、後の行で始まる edge を値にしない。ADR-3752 で kompiro が `role` / `team` の回復までそろえたのと同じ考え方
- 共有の reader（`parseLink` などは node の block と organization の block の両方から呼ばれる）を、呼ばれる場所で分けずに直せる

**デメリット**

- 変更箇所が多い（約 25 か所）。ただし多くは同じ置き換え
- 残った矢印がもともと error になる場所（organization・deploy・legend・`import`）では、回復の仕方だけが変わる

#### 案 1-B: 黙って違うモデルになる reader だけを直す

node の block の中で読む値（`label`・`description`・`link` の URL・edge の target・子の node の宣言の id）だけを直す。

**デメリット**

- `parseLink` や `parseIdOrString` は、黙って違うモデルになる場所とならない場所の両方から呼ばれる。呼ばれる場所で判定を分けると、ADR-3752 が避けた「reader によって読み方が違う」状態を作る
- 次に値を読む reader を足すとき、どちらに合わせるかが決まらない

### 論点 2: 値の無いことを、どこで報告するか

#### 案 2-A: 直前に読んだ token（キーワードか矢印）で報告する

値が無いときの診断はすべて、直前に読んだ token の範囲に出す。次の行の edge で止まったときも、`}` で止まったときも同じ位置になる。

**メリット**

- 位置の規則が 1 つで済む。直すべき場所（値を書き足す場所）を指す
- 次の行の edge で止まったときに、正しく書けた edge の source に error の波線が付かない

**デメリット**

- 値の後に `}` などが続く今の入力でも、診断の位置が変わる（コードと params は同じ）

#### 案 2-B: 次の行の edge で止まったときだけ、キーワードで報告する

`}` などで止まったときは今の位置（次の token）のまま。

**デメリット**

- 同じ診断が、次に何が来たかで違う位置に出る
- 次の token で報告する今の位置は、`ctx.error` が次の token を指すことから来たもので、決めた位置ではない

### 論点 3: target の無い edge をモデルに残すか

#### 案 3-A: target の無い edge はモデルから除く

`parseEdge` は target が無いとき、`expected-id-or-string` を出して edge を返さない。今の `a -> }` も無くなる。

**メリット**

- TPL-3072（error は拒否した構文をちょうど 1 つ分だけモデルから除く）に合う
- 次の行の edge を target として読まないと、`parseIdOrString` は読まずに残した token を返すので、edge を残すと `a -> "x y"` が target を読んでいないのにできてしまう

**デメリット**

- `parseEdge` の戻り値が `KrsEdge | undefined` になり、呼び出し側（6 か所）を直す。edge を受け付けない block の `rejectEdge` は、target の無い edge を「edge でない」と取り違えないようにする

#### 案 3-B: 今どおり、読まずに残した token を target にした edge を残す

**デメリット**

- 次の行の edge の source が、読んでいないのに target になる。モデルに同じ名前が 2 回現れる

node の宣言の id が無いときは、今どおり `__missing_id` の node を残す。宣言の回復を変えるのは本件の外とする（後の「決めないこと」）。

### 論点 4: 同じ行の矢印から暗黙の source の edge を始めてよいか

#### 案 4-A: 今どおり受理する

node の block の中の `-> b "x" -> c` は label `"x"` の `a -> b` と `a -> c`、`link "u" "Docs" -> b` は link と `a -> b` のまま。

**メリット**

- karasu の文は行で終わらない。1 行に複数の文を書く形（`domain A { usecase u {} -> v }`）はテストが受理を確かめており、`role "A" -> B` は拒否した `role` の後の edge を残す回復として確かめられている
- 同じ行に書いた文は書いた通りに読まれている。#3767 の本題（別の行に書いたものが黙って読み替わる）とは違い、読み方は見た目と一致する

**デメリット**

- 改行を書き忘れた `-> b` `"x" -> c` は、label と別の edge として黙って通る。ただし改行を書き忘れたのか、label と 2 本目の edge のつもりなのかは、parser には区別できない

#### 案 4-B: 前の文と同じ行で始まる暗黙の source の edge を error にする

**デメリット**

- 上の 4 件のテストの形を error にする。1 行の block の中で `usecase u {} -> v` と書く使い方を受理しなくなり、受理する言語を狭める。bug の修正ではなく言語の判断になる
- 「前の文」が何で終わったかを見るため、`{` の直後（`service a { -> b }`）との区別が要る

## 比較

| 書いた入力（service `a` の中） | 今 | 1-A・2-A・3-A・4-A |
| --- | --- | --- |
| `label` / `"x y" -> b` | `label = "x y"`、`a -> b`、診断なし | label なし、`"x y" -> b`、`expected-string-after`（`label` の位置）と `edge-source-mismatch` |
| `->` / `"x y" -> b` | `a -> "x y"`、`a -> b`、診断なし | `"x y" -> b` だけ、`expected-id-or-string`（`->` の位置）と `edge-source-mismatch` |
| `->` / `"a" -> b` | `a -> "a"`、`a -> b`、診断なし | `a -> b` だけ、`expected-id-or-string` 1 件 |
| `domain` / `"x y" -> b` | domain `"x y"`、`a -> b`、診断なし | domain `__missing_id`、`"x y" -> b`、`expected-node-id`（`domain` の位置）と `edge-source-mismatch` |
| `label` / `}` | `expected-string-after`（`}` の位置） | `expected-string-after`（`label` の位置） |
| `->` / `}` | `a -> }`、`expected-id-or-string`（`}` の位置） | edge なし、`expected-id-or-string`（`->` の位置） |
| `-> b "x" -> c` | label `"x"` の `a -> b` と `a -> c` | 今と同じ |
| `label` / `"x y"`（矢印なし） | `label = "x y"` | 今と同じ |

## 現時点の方針

**1-A・2-A・3-A・4-A を採用する。** 値を必ず読む reader は、値の位置に後の行で始まる edge があれば、値が無いものとして扱う。判定は ADR-3752 の `opensEdgeOnLaterLine` を共有の reader の中で使い、reader ごとに書き写さない。値の無いことは直前に読んだ token の位置で報告し、target の無い edge はモデルから除く。同じ行の矢印は、1 行に複数の文を書く形として今どおり受理する。

kompiro に決めてほしい点:

- 論点 1: 残った矢印がもともと error になる場所（organization・deploy・legend・`import`）まで直すか。直さないなら、共有の reader の中ではなく、node の block の中の呼び出し側で判定することになる
- 論点 2: 値の後に `}` などが続く今の入力でも、診断の位置をキーワードに動かしてよいか
- 論点 4: 同じ行の矢印を受理し続けるか

### 実装の指針

1. `property-readers.ts`: `readValueAfter(ctx, after, ...types): Token | undefined` を足す。次の token が `types` のどれかで、`opensEdgeOnLaterLine(ctx, after)` が偽なら読んで返す。値が無いときの診断は呼び出し側が出すので、位置を `after` にする小さな関数（`reportMissingValue(ctx, after, code, params)`）も足す。`parseIdOrString`・`parseDescriptionValue`・`parseLink` はこれを使い、`after` には `ctx.previous()` を渡す
2. 上の表の各所を `readValueAfter` に置き換え、診断を `after` の位置に出す
3. `edge-parser.ts`: `parseEdge` は target が無いとき `undefined` を返す。呼び出し側（`block-contents.ts` ×2、`infra-parser.ts` ×2、`parser.ts` ×2）を直す。`ctx.tryParseEdge` は「edge を始めない」と「edge を読んだが target が無い」を区別して返し、`rejectEdge` は後者を読み切ったものとして扱う（診断は `expected-id-or-string` の 1 件）
4. テスト（`packages/core/src/parser/required-value-next-edge.test.ts`）。修正前のコードで落ちることを確かめる:
   - 上の表の reader ごとに、値の位置に次の行の `"x y" -> b` を置くと、値として読まれず、余分な暗黙の source の edge ができず、値の無い診断がキーワードの位置に 1 件出る
   - edge の target: `->` / `"x y" -> b` と `->` / `x -> b`（素の id）。system 直下の `a ->` / `"x y" -> b` で 2 本目の edge が残る。`->` / `}` で edge が残らない
   - 変わらないもの: 値が同じ行にある形、値を次の行に書いて矢印が続かない形、`-> b "x" -> c`、`link "u" "Docs" -> b`、`domain A { usecase u {} -> v }`
5. TPL-3752 を広げる: 題名と観点を「任意で続く要素」から「値を読む reader（任意でも必須でも）」にし、`known_consumers` とチェックリストに必須の値の reader を足す。#3767 を `discovered_from` に足す
6. AT: `docs/acceptance/3767-required-value-stops-at-next-edge.md`。TC は上の 4 の 3 群
7. changeset: `@karasu-tools/core` と `karasu` に patch
8. ADR 昇格: 実装の PR のマージ後、ADR-3767 として昇格し、本 Design Doc は同じ PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 修正前に黙って違うモデルになっていた入力が、書いた場所の error になる。値が欠けた入力の診断の位置がキーワードに移る。書いた通りに読めていた入力は変わらない
- ドキュメント更新: spec に変える記述は無い（値を必ず書くことは spec の通り）。`docs/spec/diagnostics.md` の各コードの説明も変わらない
- テスト・examples への影響: 値が欠けた入力の診断の位置を確かめるテストがあれば、位置を直す

## 未解決の問い / 決めないこと

- node の宣言の id が無いときに `__missing_id` の node を残す回復は変えない。TPL-3072 に照らすと node ごと除くのが筋だが、宣言の回復は本件の外で、変えると LSP の outline などにも影響する
- 次の行に書いた label の扱いは #3766 で決める
