# 任意で続く文字列は、後の行で始まる次の edge を読まない

- **日付**: 2026-11-10
- **ステータス**: 検討中
- **PR**: #TBD
- **関連**:
  - 引き金 Issue: [#3752](https://github.com/kompiro/karasu/issues/3752)（#3481 のテストを書くときに発見）
  - 関連 TPL: [TPL-3072](../test-perspectives/TPL-3072-parser-error-drops-exactly-the-rejected-construct.md)（#3499 で、末尾のドットの後に後の行の edge の source を読まないようにした）, [TPL-2542](../test-perspectives/TPL-2542-sugar-form-shares-one-ast-and-element-ranges.md)（1 行に並ぶ要素の reader は、区切りの後で次の行を消費しない）, [TPL-2133](../test-perspectives/TPL-2133-parser-acceptance-documented-in-spec.md)（parser が受理する形は spec に書く）
  - コード: `packages/core/src/parser/edge-parser.ts`, `packages/core/src/parser/property-readers.ts`, `packages/core/src/parser/node-path.ts`

## 背景・課題

lexer は改行を token にしない。edge の positional label（`A -> B "calls"`）と link の label（`link "https://…" "Docs"`）は、直前の token の後に文字列リテラルが続けば、行に関係なく読まれる。そのため、次の行が引用符付きの id で始まる edge だと、その id が前の構文の label になる。

```krs invalid
system S {
  service a {}
  service "b->c" {}
  service "a->b" {}
  service c {}
  a -> "b->c"
  "a->b" -> c
}
```

main（17c190ee）で `Parser.parse` に通して測った結果:

| 書いた場所 | 次の行 | 結果 | 診断 |
| --- | --- | --- | --- |
| system 直下の `a -> "b->c"` | `"a->b" -> c` | edge は 1 本で、label が `"a->b"`。2 本目が消える | `unexpected-token-in-block` 2 件 |
| service `a` の中の `-> b` | `"x y" -> b` | `a -> b` に label `"x y"`。残った `-> b` が 2 本目の `a -> b` になる | なし |
| service `a` の中の `link "https://e.com"` | `"x y" -> b` | link に label `"x y"`。残った `-> b` が `a -> b` になる | なし |
| system 直下の `a -> S.`（末尾のドット） | `"x" -> c` | edge は 1 本で、label が `"x"`。2 本目が消える | 3 件（同じ行を素の id `x -> c` で書くと 1 件で、2 本目も残る） |

system 直下では error で気づけるが、node の block の中では残りの `-> b` が暗黙の source の edge として読めてしまい、診断なしに違うモデルになる。同じ 2 行を逆の順に書けば正しく読まれる。#3481 のテストは、この順序を避けて引用符付きの source の edge を先に宣言していた。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| lexer | 改行を token にしない。各 token は `loc.line` を持つ |
| edge の開始（`isEdgeStart`） | id か文字列リテラルの次が `->` / `-->` |
| edge の positional label（`parseEdge`） | target の次が文字列リテラルなら label として読む。行も、その後の token も見ない |
| link の label（`parseLink`） | URL の次が文字列リテラルなら label として読む。同じく行を見ない |
| 同じ判定の前例（`readNodeIdPathTail`、#3499） | 末尾のドットの後、後の行にあって矢印が続く id は、path の次の段ではなく次の文の edge の source として残す。判定はこの関数の中にだけある |
| 次の行に書いた label | 受理される（`a -> b` の次の行に `"calls"` だけを書くと label になる）。spec の「Edge declaration」は同じ行の形しか示していない |

次の行に label を書く使い方が repo にあるかを、parser に一時的な記録を入れて測った。core・lsp・cli のテスト 6,544 件、`examples/**/*.krs` 97 ファイル、`pnpm run lint:krs-fences` が parse する docs と skill の全 fence で、0 件だった。formatter（`formatter.ts`）も edge の label を target と同じ行に書く。

任意で続く文字列を読む reader は、上の 2 つ（edge と link の label）だけである。ほかの文字列は、`label "x"` などのプロパティの値として必須で読むか、`boundary` / `team` の error の回復で読み捨てる。

## 制約・前提

- 次の行に書いた label の扱い（受理を続けるか、warning か error にするか）は変えない。spec に無い形をどうするかは別の判断で、本件の bug の修正とは切り離す
- 次の行に label を書き、さらに次の行が暗黙の source の edge（`-> b` / `"calls"` / `-> c`）のとき、`"calls"` は今どおり label として読む
- 同じ行に書いた label と、同じ行の誤り（`a -> b "x" -> c`）の読み方は変えない
- 「次の文の始まり」の判定は 1 か所に置き、#3499 の path の reader と同じものを使う（TPL-1352 の「ヘルパーは 1 つ」と同じ考え方）

## 検討した選択肢

### 案1: 後の行で始まる edge は読まない、という判定を共有のヘルパーにする

`node-path.ts` に `opensEdgeOnLaterLine(cursor, after)` を置く。次の token が `after`（直前に読んだ token）より後の行にあり、id か文字列リテラルで、その次の token が `->` / `-->` で、しかもその矢印が同じ行にあるとき、真を返す。`parseEdge` の positional label、`parseLink` の label、`readNodeIdPathTail` の今の判定の 3 か所がこれを使い、真なら文字列を読まずに残す。

比べる相手を「直前に読んだ token」にするのは、末尾のドットのとき `parseEdge` が持つ target の末尾（`toEnd`）が、読まずに残した次の行の token を指すからである。`toEnd` と比べると、上の表の 4 行目が直らない（レビューで実測）。

矢印が同じ行にあることまで見るのは、`-> b` / `"calls"` / `-> c` の `"calls"` を label のまま読むためである。この形では文字列の次の token も矢印だが、矢印は次の行にあり、暗黙の source の edge の始まりである。

試しに入れて測ると:

- 上の表の 4 つのモデルは、どれも次の行の edge を別の edge として読んだ。system 直下の 1 行目は 2 本の edge で診断なし。node の block の 2 行目と 3 行目は `"x y" -> b` を明示の source の edge として読み、`edge-source-mismatch`（service の中の edge の source は、その service でなければならない）を出した。4 行目は素の id と同じく error 1 件で、2 本目の edge も残った
- `-->` の edge、`a -> b` の次の行が `"x" -> c` のとき、service の中で `"a" -> c`（source がその service）を書いたときも、それぞれ別の edge になった
- 次の行に書いた label、`-> b` / `"calls"` / `-> c`、同じ行の label、同じ行の `a -> b "x" -> c`（label `"x"` と error 2 件）は今と同じに読まれた
- core のテスト 5,594 件はすべて通った

**メリット**

- 「次の文の始まり」の判定が parser の中で 1 つにそろう。#3499 の path の reader と、本件の 2 つの reader が同じ規則で止まる
- 受理する言語は狭まらない。今は error か違うモデルになる入力が、書いた通りのモデルになるか、書いた場所の誤りとして正しい error になる
- node の block の中で黙って違うモデルになる入力が無くなる

**デメリット**

- 次の行に書いた label は「次の token が同じ行の矢印でなければ label」という分かりにくい規則のまま残る（今も同じ形で受理されている）
- `readNodeIdPathTail` の判定に「矢印が同じ行にある」が加わる。末尾のドットの次の行に id だけを書き、さらに次の行に矢印を書いた入力だけで読み方が変わる。どちらの読み方も誤りの回復で、core のテストは変わらず通る

### 案2: 矢印が続く文字列は、行に関係なく読まない

`isEdgeStart` と同じ判定だけを使い、行を見ない。

測ると、同じ行の `a -> b "x" -> c` が、label の無い `a -> b` と `"x" -> c` の 2 本の edge になり、parse の診断は出なかった。今は error になる書き損じが、別の edge として黙って通る。

**デメリット**

- 同じ行の誤りを、別の意味の正しいモデルとして読む
- `-> b` / `"calls"` / `-> c` の `"calls"` も edge の source として読む

### 案3: label は直前の token と同じ行に限る

label を読む条件を「直前の token と同じ行」にする。spec の形にそろう。

測ると、上の 1 行目のモデルは 2 本の edge になった。次の行に書いた label は `unexpected-token-in-block` の error になった。core のテストは 5,594 件すべて通った。

**メリット**

- spec が示す形だけを受理するようになり、parser が受理する形と spec がそろう（TPL-2133）

**デメリット**

- 今受理している形を error にする。repo に使用例は無いが、利用者の `.krs` に無いことは確かめられない
- 受理する言語を狭める判断で、bug の修正とは別に決めるべきこと。狭めるなら、warning で知らせる段階や、何を書けばよいかを示す診断も選択肢になる

### 案4: `parseEdge` の中だけで直す

案1 の判定を `parseEdge` の中に書き、`parseLink` と `readNodeIdPathTail` は触らない。

**デメリット**

- link の label が同じ読み方で次の edge を読み、node の block の中で黙って違うモデルになる入力が残る
- 「次の文の始まり」の判定が 2 か所に分かれ、次に任意の文字列を読む reader を足すときに、どちらに合わせるかが決まらない

## 比較

| 観点 | 案1 | 案2 | 案3 | 案4 |
| --- | --- | --- | --- | --- |
| #3752 の system 直下のモデル | 2 本、診断なし | 2 本、診断なし | 2 本、診断なし | 2 本、診断なし |
| node の block の中の edge の次の行 | 正しい error | 正しい error | 正しい error | 正しい error |
| link の次の行 | 正しい error | 黙って違うモデル | 黙って違うモデル | 黙って違うモデル |
| 末尾のドットの次の行の文字列 | error 1 件、2 本目も残る | error 1 件 | error 1 件 | `toEnd` と比べると直らない |
| 同じ行の `a -> b "x" -> c` | 今と同じ（error） | 別の edge として黙って通る | 今と同じ（error） | 今と同じ（error） |
| `-> b` / `"calls"` / `-> c` | 今と同じ（label） | `"calls"` が edge になる | error になる | 今と同じ（label） |
| 次の行に書いた label | 今と同じ（受理） | 今と同じ（受理） | error になる | 今と同じ（受理） |
| 判定の置き場所 | 1 か所 | 1 か所 | 1 か所 | 2 か所 |

## 現時点の方針

**案1 を採用する。** #3752 は、任意で続く文字列の reader が、後の行で始まる次の edge を読んでしまう bug で、案1 はそれだけを直す。判定は #3499 で path の reader に入れたものを共有のヘルパーに出し、edge と link の label の reader もそれを使う。parser に新しい規則を足すのではなく、1 か所にあった規則を 3 か所で使う。案2 は同じ行の書き損じを黙って別の edge にする。案3 は spec にそろうが、受理している形を error にする判断で、本件とは別に決める。案4 は link の label を残す。

次の行に書いた label が spec に無いまま受理されている状態（TPL-2133）は、本件の前からある。扱い（spec に書く、warning にする、error にする）を決める Issue を別に起こす。

### 実装の指針

1. `packages/core/src/parser/node-path.ts`: `opensEdgeOnLaterLine(cursor: TokenCursor, after: Token): boolean` を足す。`readNodeIdPathTail` の今の判定（`next.loc.line > dot.loc.line` と矢印）をこのヘルパーに置き換える。doc に #3499 と #3752、「矢印が同じ行」の理由（`-> b` / `"calls"` / `-> c`）を書く
2. `packages/core/src/parser/edge-parser.ts`: `parseEdge` が positional label を読む条件に `!opensEdgeOnLaterLine(ctx, ctx.previous())` を足す
3. `packages/core/src/parser/property-readers.ts`: `parseLink` が label を読む条件に `!opensEdgeOnLaterLine(ctx, url)` を足す
4. テスト（parser のテスト）。修正前のコードで、今と同じであるべきもの以外が落ちることを確かめる:
   - system 直下: 次の行で引用符付きの id から始まる edge が別の edge になり、前の edge に label が付かず、診断が出ない。`->` と `-->` の両方。同じ 2 行を逆の順に書いたモデルと同じ edge の集合になる
   - node の block の中: 暗黙の source の edge の次の行の `"x y" -> b` が、label にならず、2 本目の `a -> b` を作らず、`edge-source-mismatch` を 1 件出す。source がその node（`"a" -> c`）なら診断なしで別の edge になる
   - link: node の block の中の `link "…"` の次の行の `"x y" -> b` が、link の label にならない。次の行に書いた link の label（矢印が続かない）は今と同じに読まれる
   - 末尾のドット: `a -> S.` の次の行の `"x" -> c` が、素の id のときと同じく error 1 件で、`x -> c` も残る
   - 今と同じであるべきもの: 次の行に書いた edge の label、`-> b` / `"calls"` / `-> c`（`"calls"` は label、`a -> c` は別の edge）、同じ行の `a -> b "x" -> c`
5. `index.test.ts` の #3481 の `ARROW_PAIR`（引用符付きの source の edge を先に宣言している）に、逆の順のモデルを足す。#3481 で避けていた順でも、2 本がそれぞれのスタイルと向きで描かれることを確かめる
6. TPL: 3-Yes を満たすので、retrospective TPL `TPL-3752` を起こす。観点は「改行を token にしない parser で、任意で続く要素を読む reader は、後の行で次の文を始める token（同じ行に矢印が続く id / 文字列）を読まない。判定は共有のヘルパーを使う」。`readNodeIdPathTail`（#3499）・`parseEdge`・`parseLink` を既知の consumer にする。TPL-2542 のチェックリスト（区切りの後で次の行を消費しない）はリストの区切りに限った形なので、`related_to` で結び、本 TPL はその一般形として書く。TPL-3072 にも `related_to` で結ぶ
7. AT: `docs/acceptance/3752-optional-string-stops-at-next-edge.md`。手動項目は無い
   - 次の行で引用符付きの id から始まる edge が、前の edge の label にならず、2 本の edge として描かれる
   - node の block の中で、edge や link の次の行の edge が、label にならず、書いた場所の誤りとして error になる
   - 次の行に書いた label、同じ行の label、`-> b` / `"calls"` / `-> c` は今と同じに読まれる
8. changeset: `@karasu-tools/core` と `karasu` の patch。node の block の中で、今は黙って違うモデルになっていた入力が `edge-source-mismatch` になることを書く
9. 次の行に書いた label の扱いを決める Issue を、実装 PR と同時に起こす（TPL-2133）。選択肢に、spec に書く・warning で知らせる・error にする、の 3 つを並べる
10. ADR 昇格: 実装 PR のマージ後、`docs/adr/3752-optional-string-stops-at-next-edge.md` として昇格し、本 Design Doc を同じ PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響:
  - system 直下で、引用符付きの id から始まる edge を別の edge の次の行に書いたモデルが、error ではなく 2 本の edge として読まれる
  - node の block の中で、edge や link の次の行に引用符付きの id から始まる edge を書いたモデルは、今は黙って違うモデル（label と余分な edge）になっていた。修正後は、書いた通りの edge として読まれ、source がその node でなければ `edge-source-mismatch` の error になる。error が新しく出るのはこの入力だけで、どれも今は誤ったモデルになっている
  - それ以外の読み方は変わらない
- ドキュメント更新: なし（spec の「Edge declaration」は同じ行の label だけを示しており、変える記述が無い）
- テスト・examples への影響: 次の行に label を書く例は repo に無い（上の測定）
