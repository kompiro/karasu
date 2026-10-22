---
id: TPL-3282
title: "同じテキストを複数の手書きスキャナで読むなら、どのスキャナも引用符の中を同じ規則で飛ばす"
status: active
date: 2026-10-22
applicable_to:
  - "利用者のテキスト入力（SQL・設定ファイルなど）を、正規表現や文字ごとのループで何段階かに分けて読む変換"
  - "あるスキャナの読み終わり位置から、別のスキャナが読み始める構成（括弧の対応・区切り文字での分割・文の走査）"
known_consumers:
  - translate/db
discovered_from:
  - issue: "#3282"
  - root_cause_file: "packages/core/src/translate/db.ts"
related_to:
  - TPL-2707
topic: cli
scope:
  packages:
    - core
---

# TPL-3282: 同じテキストを複数の手書きスキャナで読むなら、どのスキャナも引用符の中を同じ規則で飛ばす

## 観点

手書きのスキャナが同じテキストを何段階かで読むとき、引用符で囲まれたテキスト
（`'…'` / `"…"` / `` `…` ``、二重にした引用符を含む）を飛ばす規則は**全段で同じ**でなければ
ならない。1 段だけが引用符を知らないと、その段は引用符の中の `)` や `,` を構文として数え、
読み終わり位置がずれる。次の段がその位置から読み始めると、引用符の中から読むことになり、
前の段で飛ばしたはずのテキストが文として扱われる。

発見事例（#3282）: `translate --from db` は #3268 で、コメントを消す段と文を探す段に
引用符の扱いを入れた。括弧の対応を数える `extractParenBody` と列をカンマで分ける
`splitTopLevelCommas` には入らなかった。
`CREATE TABLE a (note text DEFAULT ') DROP TABLE a', id int);` では本体が引用符の中の `)` で
切れ、文の走査がその直後（引用符の中）から再開して `DROP TABLE a` を実行し、作ったばかりの
表を消した。

## 想定される失敗モード

- 引用符の中の `)` で本体が途中で切れ、列や制約が欠ける
- 引用符の中の `,` で列が分かれ、文字列の一部が列名として読まれる（そこから推論した関連が増える）
- 次の段が引用符の中から読み始め、文字列の中の文（`DROP TABLE` など）が実行される
- 段ごとに引用符の規則が違い（二重にした引用符を閉じとみなす段とみなさない段）、
  特定の書き方のときだけ壊れる

## チェックリスト

テキストを読むスキャナを追加・変更するとき:

- [ ] 同じ入力を読む他の段を列挙し、どの段も引用符の中を飛ばしているか
- [ ] 引用符を飛ばす処理は 1 つの関数を共有しているか（段ごとに書き直していないか）
- [ ] 区切り文字（`(` `)` `,` `;` など）を引用符の中に置いた入力のテストが、段ごとにあるか
- [ ] ある段の読み終わり位置から次の段が再開する場合、その位置が引用符の中に入りえないことを
      テストで確かめているか

## 既知の対処パターン

- `packages/core/src/translate/db.ts` は `isQuote` / `quotedEnd` を、コメントを消す段
  （`blankComments`）、括弧の対応（`extractParenBody`）、カンマでの分割
  （`splitTopLevelCommas`）で共有する。文を探す正規表現も同じ規則（二重にした引用符は
  閉じてすぐ開き直すのと同じ）で引用符の中を丸ごと消費する（#3282）
- 列の定義から `PRIMARY KEY` / `REFERENCES` を探す段（`parseTable`）は、文字列リテラル
  `'…'` の中身を空にしてから探す。`"…"` と `` `…` `` は識別子（`REFERENCES "users"`）なので
  残す。どの引用符が「中を読まない」ものかは段の役割で決まり、括弧・カンマを数える段は
  3 種すべて、キーワードを探す段は文字列リテラルだけを飛ばす（#3282）

## 関連テスト

- `packages/core/src/translate/db.test.ts` — `a migration history is replayed in order (#3182)` の
  `skips statements inside string literals` / `reads a CREATE TABLE body to its own ')', past
  parentheses in quoted text` / `splits columns only at commas outside quoted text` /
  `reads no key or reference from a column's string literal`
