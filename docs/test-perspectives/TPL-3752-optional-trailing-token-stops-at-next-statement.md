---
id: TPL-3752
title: "改行を token にしない parser で、任意で続く要素を読む reader は、後の行で次の文を始める token を読まない。判定は共有のヘルパーを使う"
status: active
date: 2026-11-12
applicable_to:
  - "直前の構文の後に任意で続く token（label・段・修飾子）を、token の種類だけを見て読む reader を追加・変更するとき"
  - "次の文の先頭にもなれる token（id・文字列リテラル）を、任意の要素として受け取る構文を足すとき"
known_consumers:
  - edge-positional-label
  - link-label
  - node-id-path-tail
  - misplaced-role-value
  - removed-team-property-value
discovered_from:
  - issue: "#3752"
  - root_cause_file: "packages/core/src/parser/edge-parser.ts:parseEdge"
related_to:
  - TPL-2542
  - TPL-3072
  - TPL-2133
topic: parser
scope:
  packages:
    - core
---

# TPL-3752: 改行を token にしない parser で、任意で続く要素を読む reader は、後の行で次の文を始める token を読まない。判定は共有のヘルパーを使う

## 観点

karasu の lexer は改行を token にしない。そのため、直前の構文の後に任意で続く要素を
「次の token の種類」だけで読む reader は、次の行の文の先頭の token も同じ種類なら読んでしまう。
edge の source は id か文字列リテラルで始まり、同じ行に `->` / `-->` が続く。任意の文字列や
id を読む reader はどれも、この形を次の文の始まりとして残さなければならない。

判定は 1 つに畳める: **次の token が直前に読んだ token より後の行にあり、id か文字列リテラルで、
その次の token が同じ行の `->` / `-->` なら、それは次の文の edge の source である**。
`packages/core/src/parser/node-path.ts` の `opensEdgeOnLaterLine` がこの判定で、任意の要素を
読む reader はすべてこれを使う。reader ごとに判定を書くと、行の比べ方や矢印の位置の見方が
食い違い、同じ入力の読み方が reader によって変わる。

TPL-2542 の「区切りの後で次の行を消費しない」は、カンマ区切りのリストに限った形である。
本 TPL はその一般形で、区切りの無い任意の要素にも当てはまる。

## 想定される失敗モード

- edge の positional label の reader が、次の行の `"a->b" -> c` の `"a->b"` を label として
  読む。system 直下では残った `-> c` が error 2 件になり、2 本目の edge が消える（#3752）
- node の block の中で同じことが起きると、残った `-> b` が暗黙の source の edge として読め、
  label と余分な edge が付いた別のモデルになる。診断は出ない（#3752）
- link の label の reader が、同じく次の行の edge の source を label として読む（#3752）
- 末尾のドットの後で、path の reader が次の行の edge の source を段として取り込む（#3499）
- 比べる相手を「直前に読んだ token」ではなく構文の末尾（`toEnd` など）にすると、回復で読まずに
  残した次の行の token が末尾になり、判定が効かない（#3752 の Design Doc のレビューで実測）
- 矢印が同じ行にあることを見ないと、`-> b` / `"calls"` / `-> c` の `"calls"`（次の行に書いた
  label）を edge の source として読み、`-> c` の暗黙の source が変わる
- 行を token の始まりで比べると、複数行にまたがる文字列リテラルで誤る。`a -> "b⏎c" "x" -> c` の
  `"x"` は target の始まりより後の行にあるが、target が閉じる行と同じ行にある。`a -> b` の次の
  行の `"x⏎y" -> b` は、矢印が id の始まりの行に無い。どちらも token の終わり（`end`）で比べる
- 判定を reader の中に書き写す。`role` を拒否する回復は矢印の行を見ない写しを持っていた。
  削除済みの `team` プロパティの回復は判定を持たず、次の行の source を値として読んでいた（#3752 のレビュー）
- 行を見ずに「矢印が続けば次の文」とすると、同じ行の書き損じ `a -> b "x" -> c` が error に
  ならず、`"x" -> c` という別の edge として黙って通る

## チェックリスト

- [ ] 任意で続く id・文字列リテラルを読む reader は、`opensEdgeOnLaterLine` が真のときに読まずに残しているか（`grep -nE 'peek\(\)\.type === TokenType\.(StringLiteral|Identifier)|isIdOrString\(ctx\.peek\(\)\)|match\(TokenType\.StringLiteral\)' packages/core/src/parser/*.ts` で任意の要素を読む箇所を挙げる） [judgment]
- [ ] `opensEdgeOnLaterLine` に渡す token は、直前に読んだ token（`ctx.previous()` など）か。判定を reader の中に書き写していないか
- [ ] テストは、次の行に引用符付きの source の edge を置いたとき、system 直下では 2 本の edge になり、node の block の中では書いた通りの edge（source がその node でなければ `edge-source-mismatch`）になることを確かめているか
- [ ] 同じ行の書き損じ（`a -> b "x" -> c`）と、次の行に書いた要素の後に暗黙の source の edge が続く形（`-> b` / `"calls"` / `-> c`）の読み方が変わらないことも確かめているか

## 既知の対処パターン

- **共有のヘルパーで止める**: `node-path.ts` の `opensEdgeOnLaterLine(cursor, after)`。
  `readNodeIdPathTail`（末尾のドットの後の段）、`parseEdge`（positional label）、
  `parseLink`（link の label）、`rejectMisplacedProperty` の `role`、削除済みの `team` プロパティの
  回復（`block-contents.ts`）がこれを使う。行は token の終わり（lexer が付ける `end`）で比べる。`parseEdge` は `ctx.previous()` と比べる。
  末尾のドットのとき `toEnd` は読まずに残した次の行の token を指すため
- **同じ順でも逆の順でも同じモデルになることを比べる**: 2 本の edge を入れ替えて書いた
  source が、同じ edge の集合になることを確かめると、片方の順だけで通るテストを避けられる

## 関連テスト

- `packages/core/src/parser/optional-string-next-edge.test.ts` — system 直下（`->` / `-->`、
  宣言の順を入れ替えたモデルとの比較、複数行の文字列）、node の block の中（暗黙の source の edge・
  link・削除済みの `team` の後）、
  末尾のドットの後、変わらないもの（次の行に書いた label、`-> b` / `"calls"` / `-> c`、同じ行の
  書き損じ）
- `packages/core/src/parser/node-path.test.ts` — `readNodeIdPathTail` の「leaves an edge source on
  the next line unconsumed」と「reads a segment whose following arrow is on a later line」
- `packages/core/src/index.test.ts` — `ARROW_PAIR` の 2 つの宣言順で、`->` を含む端点の edge が
  それぞれの canonical id とスタイルで描かれる
