---
id: TPL-2165
title: "containment 規則は定義を 1 つだけ持ち、それを強制するのは parser である（表と実装を二重に書かない）"
status: active
date: 2026-07-30
applicable_to:
  - "ノード kind を追加し、どの親の下に置けるかを決めるとき"
  - "`canContain` / `LOGICAL_CONTAINMENT` を編集するとき"
  - "「どこに書けるか」を spec の表で説明するとき（その表が実装から読まれているか確認するため）"
  - "配置規則の診断（`*-not-in-context` 系）を追加・変更するとき"
known_consumers:
  - parser
  - reference-panel
discovered_from:
  - issue: "#2165"
  - root_cause_file: "packages/core/src/builtins/reference-data.ts"
related_to:
  - TPL-1882
  - TPL-2158
  - TPL-2133
  - TPL-1503
topic: parser
scope:
  packages:
    - core
---

# TPL-2165: containment 規則は定義を 1 つだけ持つ

## 観点

「どの kind がどの子を持てるか」は spec の表（**May contain** 列）と実装の両方に
書ける。両方に書くと必ず drift する — #2165 の時点で、受理される 47 通の入れ子の
うち **37 通が表に無い**状態だった。表は誰も検証しない散文で、parser は
`entity` と infra ブロック以外の入れ子を素通ししていた。

到達状態: 規則の定義は `REFERENCE_DATA.nodeKinds[].canContain` **1 箇所だけ**で、
parser は `LOGICAL_CONTAINMENT`（同じデータの派生）を読んで
`node-not-in-context` を出す。spec の表はそのデータから生成される。したがって
表・parser・診断が同時にしかズレない。

検証:

```
pnpm --filter @karasu-tools/core test -- reference-parser-sync
pnpm gen:reference --check
```

**規則を第 2 の場所に書き写さない。** 配置規則を追加したくなったら
`canContain` を編集する。parser 側に kind 名を直書きした条件分岐を足すのは、
その規則が `canContain` から導出**できない**場合（= 捨てるしかなく error に
する場合）に限る。現在その例外は 4 つ — `infra-not-in-context` /
`entity-not-in-domain` / `boundary-not-in-context` と、`entity` の中のノード全般
（`unexpected-token-in-block`、[TPL-1882](TPL-1882-entity-carries-no-attributes.md) の「属性を持たない」不変条件）。
例外を足したら spec の一覧表も同じ PR で更新する（この 4 つは spec 側で表として
列挙されており、数を書いた文は増減のたびに嘘になる）。

## 想定される失敗モード

- 新しい kind を足し、`canContain` の記載も parser の条件も書かず、どこにでも
  置けるノードが生まれる（#2165 の 37 通がこの蓄積）。
- spec の表だけ直して実装を直さず、「書いてあるのに効かない」規則になる
  （[TPL-1503](TPL-1503-accepted-vocabulary-must-have-effect.md)（受理された語彙は効果を持つ）の裏返し）。
- parser 側にだけ配置条件を足し、表に反映しないため Reference パネルと spec が
  古いままになる（[TPL-2133](TPL-2133-parser-acceptance-documented-in-spec.md)）。
- `canContain` の意味を「推奨」と「強制」で使い分け始め、どちらなのか読み手に
  判別できなくなる。列は 1 つの意味しか持たない — 載っていれば意味があり、
  載っていなければ `node-not-in-context` が出る。
- 配置規則を error にしたくなり、freeze 済みの v1.x で error 化してしまう
  （既存ファイルが壊れる。error 化は言語 v2.0 の枠 — roadmap §Syntax 2.0）。

## チェックリスト

`canContain` / 配置診断 / spec の配置節を触るときに確認する:

- [ ] 規則を書いた場所は `canContain` 1 箇所か。parser に kind 名を直書きして
      いないか（上記の例外 4 つ以外）。例外を足したなら spec の一覧表も同じ PR で
      更新したか。
- [ ] 新 kind を足したなら、その kind の `canContain` と、その kind を子に取れる
      親の `canContain` の**両方**を更新したか。
- [ ] 変更後に `reference-parser-sync.test.ts` が通るか（表 ↔ parser の双方向）。
- [ ] `pnpm gen:reference --check` が通るか（表 ↔ データ）。
- [ ] `examples/**/*.krs` が warning ゼロのままか（出荷サンプルが自分の規則に
      違反していないか）。
- [ ] 新しい配置規則を error にする必要があると判断したなら、それが freeze
      （[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)）に抵触しないか。抵触するなら
      v1.x は warning に留め、error 化を roadmap §Syntax 2.0 に登録したか。

## 既知の対処パターン

- **データ 1 箇所 + 派生 Map**: `canContain` から
  `LOGICAL_CONTAINMENT: ReadonlyMap<string, ReadonlySet<string>>` を module
  トップで導出し、parser はそれだけを見る。規則の追加＝データの編集になる。
- **双方向 fence**: 「`canContain` にある = warning なし」「無い = warning あり」を
  全 (parent, child) 組み合わせで assert する（`reference-parser-sync.test.ts`）。
  片方向だけだと、載せ忘れか載せ過ぎのどちらかを見逃す。
- **出荷資産の regression fence**: `examples/**/*.krs` 全件を parse して
  warning ゼロを assert する。規則を厳しくしたとき、自分のサンプルが最初の
  被害者になるのを防ぐ。

## 派生元 spec

- `docs/spec/syntax.md` / `syntax.ja.md` §「Nesting placement」/「入れ子の配置」（#2165 で新設）
