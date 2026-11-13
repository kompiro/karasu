# 必須の値を読む reader も、後の行で始まる次の edge を読まない

- **日付**: 2026-11-13
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3767](https://github.com/kompiro/karasu/issues/3767)（#3752 の修正のレビューで発見）
  - 関連 ADR: [ADR-3752](../adr/3752-optional-string-stops-at-next-edge.md)（任意で続く要素の reader に同じ判定を入れた）, [ADR-496](../adr/496-implicit-edge-source-shorthand.md)（node の block の中の暗黙の source の edge）
  - 関連 TPL: [TPL-3752](../test-perspectives/TPL-3752-optional-trailing-token-stops-at-next-statement.md), [TPL-3072](../test-perspectives/TPL-3072-parser-error-drops-exactly-the-rejected-construct.md), [TPL-2542](../test-perspectives/TPL-2542-sugar-form-shares-one-ast-and-element-ranges.md)
  - 後続: [#3766](https://github.com/kompiro/karasu/issues/3766)（次の行に書いた label の扱い）
  - コード: `packages/core/src/parser/node-path.ts`, `packages/core/src/parser/property-readers.ts`, `packages/core/src/parser/edge-parser.ts`, `packages/core/src/parser/block-contents.ts`, `packages/core/src/parser/node-parser.ts`, `packages/core/src/parser/infra-parser.ts`, `packages/core/src/parser/org-parser.ts`, `packages/core/src/parser/deploy-parser.ts`

## 背景・課題

#3752 は、任意で続く要素（edge の positional label、link の label、path の次の段、`role` / `team` の回復）を読む reader が、後の行で始まる edge の source を読まないようにした。値を必ず読む reader は対象外で、同じ失敗が残っている。値が欠けていると、次の行の edge の source を値として読み、残った矢印が node の block の中では暗黙の source の edge になる。

main（ddad0e69）で `Parser.parse` に通して測った結果（service `a` の中に書いた場合）:

| 書いた 2 行 | 読まれたモデル | 診断 |
| --- | --- | --- |
| `label` / `"x y" -> b` | `label = "x y"` と `a -> b` | なし |
| `->` / `"x y" -> b` | `a -> "x y"` と `a -> b` | なし |
| `description` / `"x y" -> b` | `description = "x y"` と `a -> b` | なし |
| `link` / `"x y" -> b` | URL が `"x y"` の link と `a -> b` | warning `link-url-scheme-not-allowed` だけ（error なし） |
| `domain` / `"x y" -> b` | domain `"x y"` と `a -> b` | なし |

system 直下の `a ->` / `"x y" -> b` は `a -> "x y"` と `unexpected-token-in-block` 2 件になり、2 本目の edge が消える。

値が欠けたまま `}` が続く今の回復も、読んでいない token を値にしているものがある:

- `label` / `}` は `}` の位置に `expected-string-after` を出し、label を付けない
- `->` / `}` は `}` の位置に `expected-id-or-string` を出したうえで、target が `}` の edge `a -> }` を残す
- `link` / `}` は `token-type-mismatch` を出したうえで、URL が `}` の link を残す
- `organization {` は `expected-id-or-string` を出したうえで、id が `{` の organization を残す（boundary・facet・team・member も同じ。`boundary` は node の block の中にも書ける）

Issue はもう 1 つ、同じ行の矢印を挙げている。node の block の中の `-> b "x" -> c` は、label `"x"` の `a -> b` と、暗黙の source の `a -> c` の 2 本になる。`link "u" "Docs" -> b` も link と `a -> b` になる。system 直下の `a -> b "x" -> c` は暗黙の source を持てないので error になる。

## 現状（インベントリ）

値を 1 つ必ず読む reader（キーワードか矢印の直後で、id か文字列を値として読むもの）:

| reader | 場所 | 値が無いときの診断 | 値が無いときのモデル |
| --- | --- | --- | --- |
| `label`（node・capability・infra・sub-resource・organization・boundary・facet・team・member・edge の property block） | `block-contents.ts` ×2, `infra-parser.ts` ×2, `org-parser.ts` ×5, `edge-parser.ts` | `expected-string-after` | 値を付けない |
| `role`, `slack`, `github` | `block-contents.ts`, `org-parser.ts` ×2 | `expected-string-after` | 値を付けない |
| `description` | `parseDescriptionValue`（`property-readers.ts`） | `expected-string-after` | 空文字列 |
| `link` の URL | `parseLink`（`property-readers.ts`、`ctx.expect`。呼び出し 9 か所） | `token-type-mismatch` | 次の token を URL にした link |
| edge の target | `parseEdge` が呼ぶ `parseIdOrString` | `expected-id-or-string` | 次の token を target にした edge |
| organization・boundary・facet・team・member の id | `org-parser.ts` ×5 が呼ぶ `parseIdOrString` | `expected-id-or-string` | 次の token を id にした宣言 |
| node の宣言の id（infra・sub-resource・`resource` を含む） | `node-parser.ts` ×2, `infra-parser.ts` ×2 | `expected-node-id` | id が `__missing_id` の node |
| `contains`, `owns` | `org-parser.ts` ×2 | `expected-id-after` | 値を付けない |
| deploy の `label` と property の値 | `deploy-parser.ts` ×3 | `expected-property-value` | 値を付けない |

診断はどれも `ctx.error`（次の token を指す）で出している。位置を決めたのではなく、`ctx.error` の作りから来ている。

`handles` / `delivers`（カンマ区切りのリスト）と `table`（`readTableRef`）は、すでに値の無いことをキーワードの位置で報告し、後の行の id を値として読まない（TPL-2542）。こちらは矢印が続くかどうかを見ず、「値はキーワードと同じ行」という強い規則を使う。

ほかに `ctx.expect` で値を読む場所がある: `import` の path（`parser.ts` ×2）、deploy・deploy unit の id（`deploy-parser.ts` ×2）、legend の entry（`legend-parser.ts` の色・label・`ref` の target）、capability の名前（`block-contents.ts`）、client の `resource` の名前（`block-contents.ts`。値の有無は分岐に入る前の `peekAt(2)` で決まる）。

このうち黙って違うモデルになるのは、残った矢印が暗黙の source の edge として読める block（`service`・`domain`・`entity`、ADR-496）の中で値を読む reader である。ほかの場所では残った矢印が error になる。

値を必ず読む位置に「後の行で、同じ行に矢印が続く id か文字列」が来る書き方が repo にあるかを、上の表の reader に一時的な記録を入れて測った。core・lsp・cli のテスト 8,061 件（`examples/**/*.krs` を parse するテストを含む）と、`pnpm run lint:krs-fences` が parse する fence 494 件で、0 件だった。Issue の再現入力では記録が出ることを確かめた。

node の block の中で、前の文と同じ行から暗黙の source の edge を始める書き方も同じ方法で測った。テストに 4 件あり、どれも意図して受理している形だった:

- `resolver/warnings.test.ts` の `domain A { usecase u {} -> v }` と、`-> B` の同じ形の 2 件
- service `A` の中の `role "A" -> B`（`parser.test.ts`。`role` を値ごと拒否し、`A -> B` を残すことを確かめるテスト）

## 制約・前提

- 書いた通りに読めていた入力の読み方は変えない。変わるのは、値が欠けた入力の回復だけにする
- 判定は `opensEdgeOnLaterLine`（ADR-3752）を使い、reader ごとに書き写さない
- 新しい診断のコードを足さない
- 次の行に書いた label の扱いは #3766 で決める。本件では触らない

## 検討した選択肢

### 論点 1: どの reader を直すか

#### 案 1-A: 上の表の reader をすべて直す

表の reader はすべて、値の位置の token が `opensEdgeOnLaterLine(ctx, <直前に読んだ token>)` を満たすとき、値が無いものとして扱う。

判定は共有の関数に寄せる。`readValueAfter(ctx, after, ...types)`（値の token か `undefined` を返す）を足し、`parseIdOrString`・`parseDescriptionValue`・`parseLink` と、`if (peek が X) advance else error` の形の各所がこれを使う。

`ctx.expect` で値を読む場所（`import`・deploy の id・legend・capability の名前・client の `resource`）は対象にしない。どれも edge を書けない場所（トップレベル、deploy、legend）か、edge を持たない block（client）にあり、残った矢印は error になる。`ctx.expect` の診断 `token-type-mismatch` は次の token を `got` に出すので、同じ判定で止めると「StringLiteral を期待したが StringLiteral だった」という文面になる。直すには診断を変える必要があり、黙って違うモデルになる入力を直す本件とは別の判断になる。`link` の URL だけは node の block の中から呼ばれるので対象にし、診断を `expected-string-after`（`property: "link"`）に変える（コードは既存。`property` の値を 1 つ足す）。

**メリット**

- 規則が 1 つで済む: 値を必ず読む reader は、後の行で始まる edge を値にしない。ADR-3752 で kompiro が `role` / `team` の回復までそろえたのと同じ考え方
- 共有の reader（`parseLink` は node の block と organization の block の両方から呼ばれる）を、呼ばれる場所で分けずに直せる

**デメリット**

- 変更箇所が多い（約 30 か所）。ただし多くは同じ置き換え
- 残った矢印がもともと error になる場所（organization・deploy）では、回復の仕方だけが変わる
- `ctx.expect` の場所が対象外として残る

#### 案 1-B: 黙って違うモデルになる reader だけを直す

node の block の中で読む値（`label`・`description`・`link` の URL・edge の target・子の node の宣言の id）だけを直す。

**デメリット**

- `parseLink` や `parseIdOrString` は、黙って違うモデルになる場所とならない場所の両方から呼ばれる。呼ばれる場所で判定を分けると、ADR-3752 が避けた「reader によって読み方が違う」状態を作る
- 次に値を読む reader を足すとき、どちらに合わせるかが決まらない

#### 案 1-C: 値はキーワードと同じ行に限る

`handles` / `delivers` / `table` と同じ規則を、表の reader すべてに使う。矢印が続くかどうかを見ない。

**メリット**

- 規則が単純で、`handles` などとそろう

**デメリット**

- 今受理している「値を次の行に書く」形（`label` / `"x"`）を error にする。ADR-3752 が「label は直前の token と同じ行に限る」案を却下したのと同じ理由で、受理する言語を狭める判断になる。label の扱いは #3766 で決める

1-A を採ると、`handles` / `Order`（矢印なし）は error で、`label` / `"x"`（矢印なし）は label のまま、という違いが残る。この違いは #3766 で次の行の label を決めるときに合わせて見直す。

### 論点 2: 値の無いことを、どこで報告するか

#### 案 2-A: 構文の先頭から直前に読んだ token までで報告する

値が無いときの診断はすべて、値を読もうとした構文の先頭から、直前に読んだ token までの範囲に出す。`label` なら `label`、暗黙の source の edge なら `->`、明示の source の edge なら `a ->`、宣言なら `domain`。次の行の edge で止まったときも、`}` で止まったときも同じ位置になる。TPL-3072 の「範囲は構文の先頭から始まる」に合う。

**メリット**

- 位置の規則が 1 つで済む。直すべき場所（値を書き足す場所）を指す
- 次の行の edge で止まったときに、正しく書けた edge の source に error の波線が付かない

**デメリット**

- 値の後に `}` などが続く今の入力でも、診断の位置が変わる（コードと params は同じ）

#### 案 2-B: 次の行の edge で止まったときだけ、キーワードで報告する

`}` などで止まったときは今の位置（次の token）のまま。

**デメリット**

- 同じ診断が、次に何が来たかで違う位置に出る

### 論点 3: 値の無い構文をモデルにどう残すか

#### 案 3-A: 読んでいない token を値にしない

値が無いときに、読まずに残した token の値を使わない。構文ごとの扱い:

- edge: target が無ければ、edge を読み切ってからモデルから除く。target の後の tag・`#id`・property block は今どおり読み、positional label は読まない。property block を外の block に流すと、中の `label` が node の label になり、`}` が node を早く閉じる（TPL-3072）。`parseEdge` は `KrsEdge | undefined` を返し、呼び出し側 6 か所を直す。edge を受け付けない block の `rejectEdge` は、target の無い edge を「edge でない」と取り違えずに、読み切ったものとして扱う
- link: URL が無ければ、link をモデルから除く。`parseLink` は `LinkEntry | undefined` を返し、呼び出し側 9 か所を直す
- organization・boundary・facet・team・member: id が無ければ、node の宣言と同じく id を `__missing_id` にして残す。宣言を除くかどうかは、node の宣言とまとめて決める（下の「決めないこと」）
- プロパティの値（`label` など）: 今どおり値を付けない

**メリット**

- TPL-3072（error は拒否した構文をちょうど 1 つ分だけモデルから除く）に合う
- 判定で止めても、読んでいない token が値になって、次の行の edge の source とモデルに 2 回現れることが無い

**デメリット**

- `parseEdge` と `parseLink` の戻り値が変わり、呼び出し側を直す

#### 案 3-B: 今どおり、読まずに残した token を値にする

**デメリット**

- 次の行の edge で止めても、`a -> "x y"`・URL が `"x y"` の link・id が `"x y"` の boundary が残る。判定を入れた意味がなくなる

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
| `link` / `"x y" -> b` | URL が `"x y"` の link、`a -> b`、warning 1 件 | link なし、`"x y" -> b`、`expected-string-after`（`link` の位置）と `edge-source-mismatch` |
| `domain` / `"x y" -> b` | domain `"x y"`、`a -> b`、診断なし | domain `__missing_id`、`"x y" -> b`、`expected-node-id`（`domain` の位置）と `edge-source-mismatch` |
| `label` / `}` | `expected-string-after`（`}` の位置） | `expected-string-after`（`label` の位置） |
| `->` / `}` | `a -> }`、`expected-id-or-string`（`}` の位置） | edge なし、`expected-id-or-string`（`->` の位置） |
| `-> { label "x" }` / `label "A"` | target が `{` の edge に label `"x"`、node の label `"A"` | edge なし、`expected-id-or-string` 1 件、node の label `"A"` |
| `-> b "x" -> c` | label `"x"` の `a -> b` と `a -> c` | 今と同じ |
| `label` / `"x y"`（矢印なし） | `label = "x y"` | 今と同じ |

## 現時点の方針

**1-A・2-A・3-A・4-A を採用する。** 値を必ず読む reader は、値の位置に後の行で始まる edge があれば、値が無いものとして扱う。判定は ADR-3752 の `opensEdgeOnLaterLine` を共有の関数の中で使い、reader ごとに書き写さない。値の無いことは構文の先頭から直前に読んだ token までで報告し、読んでいない token を値にしない。target の無い edge と URL の無い link はモデルから除く。同じ行の矢印は、1 行に複数の文を書く形として今どおり受理する。

kompiro に決めてほしい点:

- 論点 1: 残った矢印がもともと error になる場所（organization・deploy）まで直すか。`ctx.expect` の場所を対象外にしてよいか
- 論点 2: 値の後に `}` などが続く今の入力でも、診断の位置を動かしてよいか
- 論点 4: 同じ行の矢印を受理し続けるか

### 実装の指針

1. `property-readers.ts`: `readValueAfter(ctx, after, ...types): Token | undefined` を足す。次の token が `types` のどれかで、`opensEdgeOnLaterLine(ctx, after)` が偽なら読んで返す。値の無い診断を範囲で出す `reportMissingValue(ctx, start, code, params)`（`start` から `ctx.previous()` まで）も足す
2. `parseIdOrString` と `parseDescriptionValue` は `readValueAfter` を使い、`parseIdOrString` は `Token | undefined` を返す。org の 5 か所は `undefined` のとき id を `__missing_id` にする
3. `parseLink` は `readValueAfter` で URL を読み、無ければ `expected-string-after`（`property: "link"`）を出して `undefined` を返す。`expected-string-after` の `property` の型と i18n の表示を直す。呼び出し側 9 か所は `undefined` を足さない
4. 上の表の残りの各所（`label`・`role`・`slack`・`github`・node の宣言の id・`contains`・`owns`・deploy の値）を `readValueAfter` と `reportMissingValue` に置き換える
5. `edge-parser.ts`: `parseEdge` は target が無いとき、positional label を読まずに tag・`#id`・property block を読み、`expected-id-or-string` を出して `undefined` を返す。呼び出し側（`block-contents.ts` ×2、`infra-parser.ts` ×2、`parser.ts` ×2）を直す。`ctx.tryParseEdge` は「edge を始めない」と「edge を読んだが target が無い」を区別して返し、`rejectEdge` は後者を読み切ったものとして扱う（診断は `expected-id-or-string` の 1 件）。トップレベルの `a ->` は今どおり `top-level-declaration` も出し、error は 2 件になる（直す場所が 2 つあるため）
<!-- absent-path-next-line: the test file the implementation PR creates (#3767) -->
6. テスト（`packages/core/src/parser/required-value-next-edge.test.ts`）。修正前のコードで落ちることを確かめる:
   - 表の reader ごとに、値の位置に次の行の `"x y" -> b` を置くと、値として読まれず、余分な暗黙の source の edge ができず、値の無い診断が構文の先頭から 1 件出る
   - edge の target: `->` / `"x y" -> b` と `->` / `x -> b`（素の id）。system 直下の `a ->` / `"x y" -> b` で 2 本目の edge が残る。`->` / `}` で edge が残らない。`-> { label "x" }` と `-> [t]` の後に兄弟のプロパティを置き、それが同じ node に付く
   - link: `link` / `}` と `link` / `"x y" -> b` で link が残らない
   - 変わらないもの: 値が同じ行にある形、値を次の行に書いて矢印が続かない形、`-> b "x" -> c`、`link "u" "Docs" -> b`、`domain A { usecase u {} -> v }`
7. TPL-3752 を広げる: 題名と観点を「任意で続く要素」から「値を読む reader（任意でも必須でも）」にし、`known_consumers` とチェックリストに必須の値の reader を足す。チェックリストの grep に `ctx.expect(TokenType.(StringLiteral|Identifier))` を足し、対象外の場所はその理由（edge を書けない場所）と一緒に挙げる。#3767 を `discovered_from` に足す
8. AT: `docs/acceptance/3767-required-value-stops-at-next-edge.md`。TC は上の 6 の 4 群
9. changeset: `@karasu-tools/core` と `karasu` に patch
10. ADR 昇格: 実装の PR のマージ後、ADR-3767 として昇格し、本 Design Doc は同じ PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 修正前に黙って違うモデルになっていた入力が、書いた場所の error になる。値が欠けた入力の診断の位置が構文の先頭に移り、target の無い edge と URL の無い link がモデルに残らなくなる。`link` の URL が無いときの診断が `token-type-mismatch` から `expected-string-after` に変わる。書いた通りに読めていた入力は変わらない
- ドキュメント更新: spec に変える記述は無い（値を必ず書くことは spec の通り）。`docs/spec/diagnostics.md` の各コードの説明も変わらない
- テスト・examples への影響: 値が欠けた入力の診断の位置やモデルを確かめるテストがあれば直す

## 未解決の問い / 決めないこと

- node と organization 系の宣言の id が無いときに `__missing_id` で残す回復は変えない。TPL-3072 に照らすと宣言ごと除くのが筋だが、宣言の回復は本件の外で、変えると LSP の outline などにも影響する
- 末尾のドットの後の段が無いとき、`parseEdge` が読んでいない token の値を target に連ねる回復（`-> S.` / `}` が target `S.}` になる）は変えない。ADR-3752 で「この場所の今の回復を残す」とした箇所で、次の行の edge は `readNodeIdPathTail` がすでに読まない
- `ctx.expect` で値を読む場所（`import`・deploy の id・legend・capability の名前・client の `resource`）は対象にしない（論点 1）
- 次の行に書いた label の扱いと、`handles` などの「値はキーワードと同じ行」との違いは #3766 で決める
