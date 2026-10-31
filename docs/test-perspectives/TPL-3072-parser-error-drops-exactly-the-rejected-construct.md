---
id: TPL-3072
title: "parser の error は拒否した構文をちょうど 1 つ分だけモデルから除く。誤りのある source は、その構文を空白で塗りつぶした source と同じモデルになり、error は 1 件だけ出る"
status: active
date: 2026-10-31
applicable_to:
  - "parser が構文の置き場所や種類を理由に拒否する分岐（配置制限・kind ごとのプロパティ制限）を追加・変更するとき"
  - "拒否した構文の後ろにある宣言を、拒否が無かったときと同じに読む必要がある回復処理"
known_consumers:
  - parser
discovered_from:
  - issue: "#3072"
related_to:
  - TPL-2171
  - TPL-2165
  - TPL-2707
topic: parser
scope:
  packages:
    - core
---

# TPL-3072: parser の error は拒否した構文をちょうど 1 つ分だけモデルから除く。誤りのある source は、その構文を空白で塗りつぶした source と同じモデルになり、error は 1 件だけ出る

## 観点

`.krs language v2.0` は error を「karasu が受理しない構文」と定義し、parser はその構文を
モデルから除く（ADR-2677 決定 9）。除く単位は、規則が拒否した構文そのものでなければならない。

拒否する分岐がキーワードだけを消費すると、残りの id・`{`・本体が外側のブロックに流れ、
無関係な `unexpected-token-in-block` が連鎖する。括弧の対応も崩れるので、後ろの宣言が
別の親に付いたり、外側のブロックが早く閉じたりする。#3072 では service の中の
`database DB { table t {...} }` が error 9 件を出し、後ろの `domain` がトップレベルに
持ち上がり、system が途中で閉じていた。error のある間はどの surface も描かないので
見た目は壊れないが、著者は 1 つの誤りに 9 件の的外れな診断を受け取る。

検証の形は 1 つに畳める: 誤りのある source と、拒否された構文を同じ長さの空白
（改行は残す）で塗りつぶした source をそれぞれ parse し、

1. 前者の診断がその規則の error ちょうど 1 件で、範囲が構文の先頭から始まり、末尾まで覆う
   （プロパティは値の終わりまで。node は他の node の `loc` と同じく最後のトークンの先頭まで）
2. 後者の診断が 0 件
3. 2 つのモデルが（位置情報まで含めて）一致する

塗りつぶしにすると後ろの位置がずれないので、モデル全体を丸ごと比べられる。

## 想定される失敗モード

- 新しい拒否分岐を `this.error(...)` + `this.advance()` で書き、キーワードしか消費しない
  （#3072 の `infra-not-in-context`）
- プロパティを拒否するときに値を読まず、値が 2 件目の error になる
  （#3072 の `property-not-for-node-kind`。`role "x"` の `"x"` が残る）
- 拒否した構文を読み切るが、読んだ結果を捨てずに子として付けてしまう（除く単位が小さすぎる
  の逆で、何も除いていない）
- 回復が構文を読みすぎて、後ろの正しい宣言まで巻き込んで捨てる

## チェックリスト

- [ ] 拒否する分岐は、受理する分岐と同じ reader（`parseNodeDecl` / プロパティごとの値 reader）で構文を読み切ってから診断を出しているか
- [ ] 診断の範囲は、除いた構文の先頭から末尾までを覆っているか（キーワードの 1 トークンだけを指していないか。終わりを最後のトークンの `loc`（先頭）で取ると値が範囲から外れるので、`end` を使っているか）
- [ ] テストは「誤りのある source」と「その構文を空白で塗りつぶした source」が同じモデルになることを比べているか（error の件数が 0 より多い、だけで止めていないか）
- [ ] 後ろに兄弟の宣言とプロパティを置き、それが拒否の前と同じ親に付くことまで確かめているか

## 既知の対処パターン

- **読んでから報告する**: 拒否はまず構文を読み切り、その範囲で報告する。共通の形は
  `packages/core/src/parser/rejected-construct.ts` の `rejectConstruct`（読み終えた構文の
  範囲で error を出す）と `rejectProperty`（プロパティの値をそのプロパティの reader で読んで
  から、キーワードから値の末尾までで error を出す）にまとめてある
- **拒否したプロパティの値への指摘は捨てる**: 書けない場所のプロパティに値が欠けていても、
  直すべきはプロパティの置き場所であって値ではない。`rejectProperty` は値の reader が出した
  診断を `discardDiagnostics` で捨てる（入れ子の `facet` ブロックの拒否と同じ扱い）
- **node の本体の誤りは別の誤りとして残す**: 置き場所を誤った `database` の本体に別の誤りが
  あれば、それは別の error として報告してよい（`entity-not-in-domain` と同じ扱い）。1 件に
  畳むのは、置き場所の誤りが本体を崩して生む連鎖のほう

## 関連テスト

- `packages/core/src/parser/parser.test.ts` — 「a rejected construct is dropped whole (#3072)」:
  `infra-not-in-context`（本体あり・本体なし、service / domain / usecase / client の中）と
  `property-not-for-node-kind`（`role` / `handles` / `delivers` / `operations`、値の欠けた
  `handles`、末尾カンマの `delivers`、`}` 直前の 1 行書き）を、空白で塗りつぶした source との
  比較で縛る。範囲は offset で比べる
