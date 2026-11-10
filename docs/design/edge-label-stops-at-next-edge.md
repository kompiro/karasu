# edge の positional label は、後の行で始まる次の edge を読まない

- **日付**: 2026-11-10
- **ステータス**: 検討中
- **PR**: #TBD
- **関連**:
  - 引き金 Issue: [#3752](https://github.com/kompiro/karasu/issues/3752)（#3481 のテストを書くときに発見）
  - 関連 TPL: [TPL-3072](../test-perspectives/TPL-3072-parser-error-drops-exactly-the-rejected-construct.md)（#3499 で同じ判定を path の reader に入れた）, [TPL-2542](../test-perspectives/TPL-2542-sugar-form-shares-one-ast-and-element-ranges.md)（1 行に並ぶ要素の reader は次の行を消費しない）, [TPL-2133](../test-perspectives/TPL-2133-parser-acceptance-documented-in-spec.md)（parser が受理する形は spec に書く）
  - コード: `packages/core/src/parser/edge-parser.ts`, `packages/core/src/parser/node-path.ts`

## 背景・課題

edge の positional label（`A -> B "calls"`）は、target の後に文字列リテラルが続けば、行に関係なく読まれる。そのため、次の行が引用符付きの id で始まる edge だと、その id が前の edge の label になる。

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

main（17c190ee）で `Parser.parse` に通した結果:

- edge は `a -> "b->c"` の 1 本だけで、label が `"a->b"` になる。2 本目の edge は無い
- 残った `-> c` に `unexpected-token-in-block` の error が 2 件出る

同じ 2 行を逆の順に書けば 2 本の edge として読まれる。source が引用符付きの id の edge（`"x y" -> a`、`"a.b" -> c`）は、どれも直前の edge を壊す。#3481 のテストは、この順序を避けて引用符付きの source の edge を先に宣言していた。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| lexer | 改行を token にしない。各 token は `loc.line` を持つ |
| edge の開始（`isEdgeStart`） | id か文字列リテラルの次が `->` / `-->` |
| positional label（`parseEdge`） | target の次が文字列リテラルなら label として読む。行も、その後の token も見ない |
| 同じ判定の前例（`readNodeIdPathTail`、#3499） | 末尾のドットの後、後の行にあって矢印が続く id は、path の次の段ではなく次の文の edge の source として残す |
| 次の行に書いた label | 受理される（`a -> b` の次の行に `"calls"` だけを書くと label になる）。spec の「Edge declaration」は同じ行の形しか示していない |

次の行に label を書く使い方が repo にあるかを、parser に一時的な記録を入れて測った。core・lsp・cli のテスト 6,544 件、`examples/**/*.krs` 97 ファイル、`pnpm run lint:krs-fences` が parse する docs と skill の全 fence で、0 件だった。formatter（`formatter.ts`）も label を target と同じ行に書く。

positional label のほかに、任意の文字列を後ろから読む reader は parser に無い。`label "x"` などのプロパティは keyword の後の値として必須で読み、`boundary` / `team` の文字列は error の回復で読み捨てる。

## 制約・前提

- 次の行に書いた label の扱い（受理を続けるか、error にするか）は変えない。spec に無い形をどうするかは別の判断で、本件の bug の修正とは切り離す
- 同じ行に書いた label と、同じ行の誤り（`a -> b "x" -> c`）の読み方は変えない
- #3499 の判定（後の行で矢印が続く id は次の文の始まり）と同じ規則にそろえる

## 検討した選択肢

### 案1: 後の行で矢印が続く文字列は label にしない

`parseEdge` が label を読む条件に、「その文字列が target より後の行にあり、次の token が `->` / `-->` なら読まない」を足す。`isEdgeStart` と同じ形の文字列を、後の行では次の edge の始まりとして残す。

試しに入れて測ると、上のモデルは 2 本の edge になり、診断は出なかった。`-->` の edge、暗黙の source の edge（`-> b` の次の行の `"x y" -> b`）でも同じだった。次の行に書いた label、同じ行の label、同じ行の `a -> b "x" -> c`（label `"x"` と error 2 件）は今と同じに読まれた。core のテスト 5,594 件はすべて通った。

**メリット**

- #3499 の `readNodeIdPathTail` と同じ規則で、parser の中で「次の文の始まり」の判定が 1 つにそろう
- 受理する言語は狭まらない。今 2 本の edge として読めないモデルが読めるようになるだけ
- 変更は条件 1 つ

**デメリット**

- 次の行に書いた label は、矢印が続かないときだけ label になる、という分かりにくい規則が残る（今も同じ形で受理されている）

### 案2: 矢印が続く文字列は、行に関係なく label にしない

`isEdgeStart` と同じ判定だけを使い、行を見ない。

測ると、同じ行の `a -> b "x" -> c` が、label の無い `a -> b` と `"x" -> c` の 2 本の edge になり、parse の診断は出なかった。今は error になる書き損じが、別の edge として黙って通る。

**デメリット**

- 同じ行の誤りを、別の意味の正しいモデルとして読む

### 案3: label は target と同じ行に限る

label を読む条件を「target と同じ行」にする。spec の形にそろう。

測ると、上のモデルは 2 本の edge になった。次の行に書いた label は `unexpected-token-in-block` の error になった。core のテストは 5,594 件すべて通った。

**メリット**

- spec が示す形だけを受理するようになり、parser が受理する形と spec がそろう（TPL-2133）

**デメリット**

- 今受理している形を error にする。repo に使用例は無いが、利用者の `.krs` に無いことは確かめられない
- 受理する言語を狭める判断で、bug の修正とは別に決めるべきこと。error にするなら、何を書けばよいかを示す診断も要る

## 比較

| 観点 | 案1 | 案2 | 案3 |
| --- | --- | --- | --- |
| #3752 のモデル | 2 本の edge、診断なし | 2 本の edge、診断なし | 2 本の edge、診断なし |
| 同じ行の `a -> b "x" -> c` | 今と同じ（error） | 別の edge として黙って通る | 今と同じ（error） |
| 次の行に書いた label | 今と同じ（受理） | 今と同じ（受理） | error になる |
| 受理する言語 | 広がるだけ | 誤りを受理する | 狭まる |
| 前例との一致 | #3499 と同じ規則 | 行を見ない点で #3499 と違う | 別の規則 |

## 現時点の方針

**案1 を採用する。** #3752 は、次の行で始まる edge を前の edge が読んでしまう bug で、案1 はそれだけを直す。判定は #3499 で path の reader に入れたものと同じ（後の行にあって矢印が続く id / 文字列は、次の文の始まり）なので、parser に新しい規則を足さない。案2 は同じ行の書き損じを黙って別の edge にする。案3 は spec にそろうが、受理している形を error にする判断で、本件とは別に決める。

次の行に書いた label が spec に無いまま受理されている状態（TPL-2133）は、本件の前からある。扱いを決める Issue を別に起こす。

### 実装の指針

1. `packages/core/src/parser/edge-parser.ts`: `parseEdge` が positional label を読む条件に、「文字列が target より後の行にあり、次の token が `->` / `-->` なら読まない」を足す。target の末尾の位置（`toEnd`）の行と比べる。コメントに #3752 と、`readNodeIdPathTail`（#3499）と同じ判定であることを書く
2. テスト（parser の edge のテスト）:
   - 次の行で引用符付きの id から始まる edge が、別の edge として読まれ、前の edge に label が付かず、診断が出ない。`->` と `-->` の両方、明示の source と暗黙の source の両方
   - 同じ 2 行を逆の順に書いたモデルと、同じ edge の集合になる
   - 次の行に書いた label（矢印が続かない）は今と同じに label になる
   - 同じ行の `a -> b "x" -> c` は今と同じ（label `"x"`、error）
   - 修正前のコードで、最初の 2 つが落ちることを確かめる
3. `index.test.ts` の #3481 の `ARROW_PAIR`（引用符付きの source の edge を先に宣言している）に、逆の順のモデルを足す。#3481 で避けていた順でも、2 本がそれぞれのスタイルと向きで描かれることを確かめる
4. TPL: 3-Yes を満たすので、retrospective TPL `TPL-3752` を起こす。観点は「改行を token にしない parser で、任意で続く要素を読む reader は、後の行で次の文を始める token（矢印が続く id / 文字列）を読まない」。#3499 の path の reader と本件の label の reader を既知の consumer にし、TPL-3072 と TPL-2542 に `related_to` で結ぶ
5. AT: `docs/acceptance/3752-edge-label-stops-at-next-edge.md`。手動項目は無い
   - 次の行で引用符付きの id から始まる edge が、前の edge の label にならず、2 本の edge として描かれる
   - 次の行に書いた label と、同じ行の label は今と同じに読まれる
6. changeset: `@karasu-tools/core` と `karasu` の patch
7. 次の行に書いた label を spec に書くか error にするかを決める Issue を、実装 PR と同時に起こす（TPL-2133）
8. ADR 昇格: 実装 PR のマージ後、`docs/adr/3752-edge-label-stops-at-next-edge.md` として昇格し、本 Design Doc を同じ PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 引用符付きの id から始まる edge を、別の edge の次の行に書いたモデルが、error ではなく 2 本の edge として読まれるようになる。それ以外の読み方は変わらない
- ドキュメント更新: なし（spec の「Edge declaration」は同じ行の label だけを示しており、変える記述が無い）
- テスト・examples への影響: 次の行に label を書く例は repo に無い（上の測定）
