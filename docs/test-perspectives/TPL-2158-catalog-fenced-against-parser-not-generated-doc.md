---
id: TPL-2158
title: "手書き catalog は parser 実測で双方向に縛る — その catalog から生成した doc を根拠にしたガードは循環している"
status: active
date: 2026-07-29
applicable_to:
  - "`REFERENCE_DATA` のように、parser が受理する語彙・プロパティを手書きで再掲する catalog を編集するとき"
  - "`<!-- gen:reference:* -->` など、catalog から生成されるドキュメント表を増やすとき"
  - "「doc に書いてあることが catalog にある」形の同期テストを追加・改訂するとき（その doc の出所を確認するため）"
known_consumers:
  - reference-panel
  - get-reference
discovered_from:
  - issue: "#2158"
  - root_cause_file: "packages/core/src/builtins/reference-data.ts"
related_to:
  - TPL-1296
  - TPL-2133
topic: build
scope:
  packages:
    - core
    - app
---

# TPL-2158: 手書き catalog は parser 実測で双方向に縛る

## 観点

karasu には parser の受理集合を手書きで再掲した catalog がある（`REFERENCE_DATA`
の `nodeKinds` / `deployUnitKinds` / `orgKinds` — in-app Reference パネルと
`docs/spec` の生成表の両方を養う）。この catalog は **2 方向に drift する**:

- **catalog に足りない** — parser が受理するのに載っていない。#2158 では
  `client` の `capability`、`resource` の `operations`、そして `entity` kind
  そのものが欠けていた（パネルにも生成表にも出てこない）。
- **catalog が多すぎる** — parser が拒否するのに載っている。#2158 では
  `service` / `domain` が `team` を広告し続けていた。ADR-14 で廃止され、いま
  書くと `team-property-removed` の **error** になるプロパティである。

後者は [[TPL-1296]] の「catalog は doc より先行してよい（片方向 subset に
留める）」の例外にあたる。プロパティ一覧は「これを書けば通る」という対外的な
約束なので、余分なエントリは足りないエントリと同じだけ有害 — `PROPERTY_SCHEMAS`
に逆向き subset を課したのと同じ理由（#1492 のゴーストプロパティ）。

**そして最も重要な失敗はガードの側にあった。** catalog の完全性は
`reference-spec-sync.test.ts` の「`docs/spec/syntax.md` の Logical structure 表の
全 kind が `nodeKinds` にある」で守られている *つもり* だった。しかしその表は
`<!-- gen:reference:node-kinds-logical -->` で **その catalog から生成されている**。
生成物を正典に見立てた検査は恒真で、`entity` は「両方から欠けている」ため約 1 年
検出されなかった。**生成物を根拠に据えたガードは、書いた本人にも通過するまで
循環に見えない** — テストの入力が独立した情報源かどうかを、テストを書く時点で
確認する。

到達状態: catalog の各エントリを最小 `.krs` で `Parser.parse` に通した実測と
突き合わせる（`packages/core/src/builtins/reference-parser-sync.test.ts`）。
kind 集合は parser の `LOGICAL_KEYWORDS` と直接比較する。

## 想定される失敗モード

- 新しい kind / プロパティを parser に足したが catalog に足し忘れ、Reference
  パネルにも生成表にも出てこない（#2158 の `entity` / `capability` /
  `operations`）。
- ADR で廃止したプロパティが catalog に残り、パネルを見て書いたユーザーが
  parse error を踏む（#2158 の `team`）。
- 生成物（生成表・生成 index）を「正典」として読む同期テストを書き、恒真な
  ガードを積み上げる。カバレッジ数値は上がるが検出力はゼロ。
- 逆に containment（`canContain`）まで parser で縛ろうとして失敗する — karasu の
  parser は入れ子をほぼ強制しない（`client` の中の `usecase` も通る）。実測で
  縛れるのは parser が実際に拒否する規則だけ（`entity` は domain 以外で拒否
  されるので縛れる）。縛れない列は doc 上の記述として残す。

## チェックリスト

`reference-data.ts` の catalog、または catalog を読む同期テストを触るときに確認する:

- [ ] 追加したプロパティを、その kind の最小 `.krs` で実際に parse して受理を確認したか（spec の記述ではなく実測を根拠にする）。
- [ ] 削除・廃止したプロパティを catalog からも消したか（parser が error を返すエントリを広告していないか）。
- [ ] 新しい kind を parser に足したなら、同じ PR で catalog に足したか（`reference-parser-sync.test.ts` の kind 集合比較が落ちる）。
- [ ] 新しいプロパティ keyword を lexer に足したなら、`PROPERTY_SNIPPETS` に書き方を 1 つ足したか（`covers every property keyword the lexer knows` が落ちる）。
- [ ] 追加した同期テストの入力は、検査対象と独立した情報源か。`docs/` を読むテストなら、その節が `gen:` マーカー区間で生成されたものでないか確認したか。

## 既知の対処パターン

- **実測マトリクスパターン**: (kind × property) の全組み合わせについて最小
  `.krs` を組み立てて `Parser.parse` し、「拒否系 diagnostic が出ない = 受理」と
  定義して catalog と双方向に突き合わせる。warning は受理に数える
  （`handles` は最小モデルで `unresolved-handles` を出すが、受理である）。
- **候補表の陳腐化を防ぐ**: マトリクスの入力（プロパティ候補表）自体が古くなる
  ので、`KRS_KEYWORD_NAMES` から「論理ノードのプロパティではない keyword」の
  明示除外集合を引いた残りをカバーしていることも assert する。新 keyword が
  landed したら除外するか候補に足すかの判断を強制できる。
- **生成物ではなく生成元と比べる**: doc を根拠にしたいときは、その doc 区間が
  手書きであることを確認する。生成区間しかないなら、比較相手を実装
  （parser / lexer の export）に切り替える。

## 派生元 spec

- `docs/spec/syntax.md` / `syntax.ja.md` §「Logical structure」（`### Logical structure` の生成表 — `entity` 行の欠落が #2158 で表面化）
