---
id: TPL-3589
title: "登録を強制する型の契約は、それ自体が空にならないことまで固定する。表の型注釈がエントリを広げると、契約はどんな表でも成り立つ"
status: active
date: 2026-11-05
applicable_to:
  - "表（fixture の配列・Record）から型を取り出し、別の union と `Equal` / `satisfies` で突き合わせて網羅を強制する meta-test"
  - "「新しい kind / key / code を足すと型エラーになる」ことを根拠にガードと呼んでいるチェック"
  - "表の要素型を注釈（`: readonly X[]`、`: Record<string, X>`）で宣言している箇所"
discovered_from:
  - issue: "#3589"
  - root_cause_file: "packages/core/src/parser/base-node-fields-coverage.test.ts"
related_to:
  - TPL-74
  - TPL-2804
  - TPL-2643
topic: testing
scope:
  packages:
    - core
---

# TPL-3589: 登録を強制する型の契約は、それ自体が空にならないことまで固定する

## 観点

表に全要素を登録させる型の契約（`Equal<(typeof TABLE)[number]["kind"], KrsNode["kind"]>` など）は、
表から取り出した型が**表に実際に書いたもの**を表しているときだけ働く。表を `: readonly Fixture[]` のように
注釈すると、各エントリの `kind` は注釈の型（全 union）に広がり、取り出した型は表の中身に関係なく全 union になる。
契約は常に成り立ち、登録を忘れた要素があっても型エラーにならない。

この失敗は静かである。契約は書いてあり、`tsc` も通り、テストも緑なので、ガードとして読まれ続ける。
登録を強制する仕組みは、表と同じく「それ自体が効いているか」を確かめないと、表の登録漏れと同じ形ですり抜ける。

## 想定される失敗モード

- 表の要素型を注釈で宣言したため、網羅の契約が空になる。新しい kind を足しても fixture の追加を求められない
  （#3589: `entity` の fixture が無いまま `base-node-fields-coverage.test.ts` が通っていた）
- 契約が空であることに誰も気づかないまま、TPL のチェックリストや設計文書がそのテストを「新しい箇所も捕まえるガード」
  として引用する
- 型を整えるリファクタ（注釈を足す、`as const` を外す）が、契約を黙って無効にする

## チェックリスト

新機能の実装/修正時に、以下を確認する:

- [ ] 網羅を強制する表は、要素型を注釈で宣言せず `satisfies` で縛り、各エントリのリテラルの型（`as const`）を保っているか
- [ ] 契約が空にならないこと自体を固定しているか（取り出した型がリテラルのままであることの型検査、または表から 1 件抜くと落ちることの検査）
- [ ] 契約を足したとき・表の宣言を変えたときに、表から 1 件抜いて実際に型エラーになることを確かめたか [judgment]

## 既知の対処パターン

- **`satisfies` で表を縛る**: `const TABLE = [...] as const satisfies readonly Fixture[]`。注釈と違い、
  `satisfies` は表の形を検査したうえで推論された型（リテラル）を残す。repo では
  `formatter-top-level-coverage.test.ts`・`formatter-property-coverage.test.ts`・
  `reference-top-level-coverage.test.ts` が同じ理由で `satisfies` を使い、「注釈ではなく `satisfies` が
  load-bearing」とコメントしている
- **契約を契約で固定する**: `Equal<(typeof TABLE)[0]["kind"], "system"> = true` のように、表の要素型が
  リテラルのままであることを型で検査する。注釈に戻すとこの行が型エラーになる（#3589）

## 関連テスト

- `packages/core/src/parser/base-node-fields-coverage.test.ts` — `KIND_FIXTURES` を `satisfies` で縛り、
  `_kindStaysLiteral` で契約が空にならないことを固定する（#3589）。注釈に戻す、または fixture を 1 件消すと `tsc` が落ちる
