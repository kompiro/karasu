---
id: ADR-3752
title: 任意で続く要素を読む reader は、後の行で始まる次の edge を読まない
status: accepted
date: 2026-11-13
topic: parser
related_to:
  - ADR-2547
  - ADR-2209
scope:
  packages: [core]
assumptions:
  - "symbol: packages/core/src/parser/node-path.ts :: opensEdgeOnLaterLine"
  - "symbol: packages/core/src/parser/edge-parser.ts :: parseEdge"
  - "symbol: packages/core/src/parser/property-readers.ts :: parseLink"
  - "symbol: packages/core/src/parser/property-readers.ts :: rejectMisplacedProperty"
  - "symbol: packages/core/src/parser/node-path.ts :: readNodeIdPathTail"
  - "symbol: packages/core/src/parser/block-contents.ts :: parseBlockContentsWithProperties"
  - "file: docs/acceptance/3752-optional-string-stops-at-next-edge.md"
  - "file: docs/test-perspectives/TPL-3752-optional-trailing-token-stops-at-next-statement.md"
---

# ADR-3752: 任意で続く要素を読む reader は、後の行で始まる次の edge を読まない

- **日付**: 2026-11-13
- **ステータス**: 決定済み・実装完了
- **関連**:
  - Issue: [#3752](https://github.com/kompiro/karasu/issues/3752)（#3481 のテストを書くときに発見）
  - PR: [#3753](https://github.com/kompiro/karasu/pull/3753)（Design Doc）, [#3768](https://github.com/kompiro/karasu/pull/3768)（実装）
  - 後続 Issue: [#3766](https://github.com/kompiro/karasu/issues/3766)（target の次の行に書いた label の扱い）, [#3767](https://github.com/kompiro/karasu/issues/3767)（必須の値を読む reader の同じ問題）
  - 関連 ADR: [ADR-2547](./2547-shared-node-path-machinery.md)（`readNodeIdPathTail` を共有した前例）, [ADR-2209](./2209-edge-property-block.md)（edge の positional label と property block）
  - 関連 TPL: [TPL-3752](../test-perspectives/TPL-3752-optional-trailing-token-stops-at-next-statement.md), [TPL-3072](../test-perspectives/TPL-3072-parser-error-drops-exactly-the-rejected-construct.md), [TPL-2542](../test-perspectives/TPL-2542-sugar-form-shares-one-ast-and-element-ranges.md), [TPL-2133](../test-perspectives/TPL-2133-parser-acceptance-documented-in-spec.md)
  - AT: [3752-optional-string-stops-at-next-edge](../acceptance/3752-optional-string-stops-at-next-edge.md)

## 背景

lexer は改行を token にしない。edge の positional label（`A -> B "calls"`）と link の label（`link "https://…" "Docs"`）は、直前の token の後に文字列リテラルが続けば、行に関係なく読まれていた。次の行が引用符付きの id で始まる edge だと、その id が前の構文の label になる。

main（17c190ee）で `Parser.parse` に通して測った結果:

| 書いた場所 | 次の行 | 結果 | 診断 |
| --- | --- | --- | --- |
| system 直下の `a -> "b->c"` | `"a->b" -> c` | edge は 1 本で、label が `"a->b"`。2 本目が消える | `unexpected-token-in-block` 2 件 |
| service `a` の中の `-> b` | `"x y" -> b` | `a -> b` に label `"x y"`。残った `-> b` が 2 本目の `a -> b` になる | なし |
| service `a` の中の `link "https://e.com"` | `"x y" -> b` | link に label `"x y"`。残った `-> b` が `a -> b` になる | なし |
| system 直下の `a -> S.`（末尾のドット） | `"x" -> c` | edge は 1 本で、label が `"x"`。2 本目が消える | 3 件（素の id `x -> c` なら 1 件で、2 本目も残る） |

node の block の中では、残った矢印が暗黙の source の edge として読め、診断なしに違うモデルになっていた。同じ 2 行を逆の順に書けば正しく読まれる。#3481 のテストは、この順序を避けて引用符付きの source の edge を先に宣言していた。

同じ判定は #3499 で `readNodeIdPathTail`（末尾のドットの後の段）に入っていた。実装のレビューで、ほかに 2 か所が見つかった。`role` を拒否する回復は、比べる相手と比べ方だけが違う写しを持っていた。削除済みの `team` プロパティの回復は判定を持たず、次の行の source を値として読み、残った矢印が暗黙の source の edge になっていた。

次の行に label を書く使い方は repo に無かった。core・lsp・cli のテスト 6,544 件、`examples/**/*.krs` 97 ファイル、`pnpm run lint:krs-fences` が parse する全 fence で 0 件だった。formatter も label を target と同じ行に書く。

## 決定

任意で続く要素（edge の positional label、link の label、path の次の段、`role` と削除済みの `team` の回復で読む値）を読む reader は、共有の判定 `opensEdgeOnLaterLine(cursor, after)`（`node-path.ts`）が真なら、その token を読まずに残す。判定は、次の token が `after`（直前に読んだ token）の終わる行より後の行で始まり、id か文字列リテラルで、その token が終わる行に `->` / `-->` が続くとき真になる。

## 理由

- 「次の文の始まり」の判定が parser の中で 1 つにそろう。#3499 で path の reader に入れた規則を共有の関数に出し、5 つの reader がそれを使う。reader ごとに書き写すと、規則を変えたときに写しが取り残される（`role` の写しは、下の「矢印は id と同じ行」を持たないまま残るところだった）
- 書いた通りに読めていた入力の読み方は変えない。修正前に error か違うモデルになっていた入力が、書いた通りのモデルになるか、書いた場所の誤りとして正しい error になる。ただし、診断なしで通っていた入力が 1 種類だけ error になる。node の block の中で次の行の edge を label として黙って読んでいた入力で、書いた通りに読むと source がその node でない edge になり、`edge-source-mismatch` を出す。どれも修正前は違うモデルになっていた
- 比べる相手は直前に読んだ token にする。`parseEdge` は `ctx.previous()` と比べる。末尾のドットのとき、target の末尾（`toEnd`）は読まずに残した次の行の token を指すので、`toEnd` と比べると上の表の 4 行目が直らない
- 矢印は id と同じ行に限る。`-> b` / `"calls"` / `-> c` の `"calls"` にも矢印が続くが、その矢印は次の行の暗黙の source の edge の始まりなので、`"calls"` は label のまま読む
- 行は token の終わりで比べる（kompiro が #3768 で決定）。文字列リテラルは改行を含められるので、始まりで比べると、`a -> "b⏎c" "x" -> c` の `"x"` を後の行と見て別の edge を黙って作り、次の行の `"x⏎y" -> b` を label として読む。終わりで比べれば、著者が目で見る「同じ行 / 次の行」と一致する
- `role` と `team` の回復も同じ判定にそろえる（kompiro が #3768 で決定）。Design Doc は edge と link の label だけを挙げていたが、どちらもすでに error を出す入力の回復なので、そろえて変わるのは回復の仕方だけである。`team` の後の edge が消える問題も直る

## 影響

- system 直下で、引用符付きの id から始まる edge を別の edge の次の行に書いたモデルが、error ではなく 2 本の edge として読まれる。`->` と `-->` のどちらでも、2 行を逆の順に書いたモデルと同じになる
- node の block の中で、edge・link・削除済みの `team` の次の行に引用符付きの id から始まる edge を書いたモデルは、書いた通りの edge として読まれ、source がその node でなければ `edge-source-mismatch` の error になる
- 末尾のドットの次の行の `"x" -> c` は、素の id と同じく error 1 件になり、2 本目の edge も残る
- 末尾のドットの後で、次の行の id か文字列にさらに次の行の矢印が続く形（`-> S.` / `x` / `-> c` の 3 行）は、その id を path の段として読む。#3499 の判定は矢印の行を見ていなかったので、修正前はその id を edge の source として残していた。Design Doc はこの形を「どちらの読み方も誤りの回復」と書いたが、正しくない。測った結果（素の id `x` と引用符付きの `"x"` で同じ）:

  | 書いた場所 | 修正前 | 修正後 |
  | --- | --- | --- |
  | service `a` の中の `-> S.` / `x` / `-> c` | `a -> S.x` と `x -> c`、`expected-id-or-string` と `edge-source-mismatch` | `a -> S.x` と `a -> c`、診断なし |
  | system 直下の `a -> S.` / `x` / `-> c` | `x -> c` が残り error 1 件（`"x"` のときは label `"x"` と error 3 件） | `a -> S.x` だけ、`unexpected-token-in-block` 2 件 |

  `-> S.` / `x`（2 行、矢印なし）は修正前から `S.x` と読まれており、3 行の形も同じ読み方になる。system 直下では、続く `-> c` が暗黙の source を持てないので error のまま残る
- service `a` の中で `role` / `"A"` / `-> B` を 3 行に書くと、`"A"` を拒否した `role` の値として読み、`-> B` を暗黙の source の edge `a -> B` として読む。error は `property-not-for-node-kind` の 1 件になる。修正前は `"A"` を読まずに残し、`"A" -> B` と `edge-source-mismatch` を加えて error 2 件だった
- 変わらないもの: target の次の行に書いた label、`-> b` / `"calls"` / `-> c`、同じ行の `a -> b "x" -> c`（label `"x"` と error 2 件）
- 次の行に書いた label は spec に無いまま受理されている（TPL-2133）。規則は「次の行の文字列は、その行で矢印が続かなければ label」で、正しいが説明しにくい。扱いは #3766 で決める。spec の「Edge declaration」は同じ行の label しか示しておらず、本件で変える記述は無い。必須の値を読む reader（値の無い `label`、target の無い `->`）は同じ失敗を持ち、#3767 で扱う

## 却下した案

- **矢印が続く文字列は、行に関係なく読まない**: 同じ行の書き損じ `a -> b "x" -> c` が、label の無い `a -> b` と `"x" -> c` の 2 本の edge として、診断なしで通る。`-> b` / `"calls"` / `-> c` の `"calls"` も edge の source として読む
- **label は直前の token と同じ行に限る**: spec の形にそろうが、修正前から受理している「次の行に書いた label」を error にする。受理する言語を狭める判断で、bug の修正とは別に決める（#3766）
- **`parseEdge` の中だけで直す**: link の label が同じ読み方で次の edge を読み、node の block の中で黙って違うモデルになる入力が残る。判定も 2 か所に分かれる
- **行を token の始まりで比べる**（Design Doc の文面に近い）: 複数行の文字列で上の 2 つの入力を読み違える
- **`role` と `team` の回復は別 Issue にする**: 判定の写しが残り、`team` の後の edge が消える問題も残る
