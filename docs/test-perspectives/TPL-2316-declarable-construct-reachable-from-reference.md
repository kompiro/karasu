---
id: TPL-2316
title: "宣言できる構文は Reference から到達できる — 半分だけ載っている状態を作らない"
status: active
date: 2026-08-04
applicable_to:
  - "`KrsFile` に新しい top-level 構文（配列フィールド）を足すとき"
  - "構文の一部だけを既存カタログに載せるとき（要素側プロパティだけ / 宣言ブロックだけ）"
  - "experimental な記法を出荷するとき（掲載可否をその場で判断しそうになったとき）"
known_consumers:
  - reference-panel
  - get-reference
  - docs-spec
discovered_from:
  - issue: "#2316"
  - root_cause_file: "packages/core/src/builtins/reference-data.ts"
related_to:
  - TPL-1503
  - TPL-1296
  - TPL-2158
  - TPL-1716
topic: app-ui
scope:
  packages:
    - core
    - app
---

# TPL-2316: 宣言できる構文は Reference から到達できる

## 観点

[[TPL-1503]] は「受理される語彙は効果を持たなければならない」を扱う。本観点はその
**発見可能性側の隣人**である: 効果を持っていても、語彙を探すために存在するサーフェス
（in-app Reference パネル）から到達できなければ、ユーザーにとってその構文は存在しない。

#2316 で実際に起きていたのはこれで、しかも最悪の形をしていた:

- `boundary` は 4 スライス出荷済み・spec に節あり・`REFERENCE_DATA` に 0 行。
- `facet` も同様。**ただし要素側の `facets` プロパティだけは 14 の全 node kind に
  列挙されていた** — Reference の中で `facets` を見つけた人は、それが何を指すのか・
  どう宣言するのかを Reference の中で学べない。

**半分だけ載っている状態は、まったく載っていない状態より悪い。** 何も無ければ
「別のドキュメントを探す」に進めるが、片割れだけがあると「ここに書いてあるものが全部だ」と
読まれ、探索が止まる。

もう 1 つの失敗は記録の側にある。欠落に**理由が付いていなかった**ため、
「experimental は昇格まで隠す方針」と「単に足し忘れ」が証拠上区別できなかった。
この 2 つは修正の向きが逆になる。**掲載しないと決めたなら、その決定を書く**
（karasu では [ADR-2316](../adr/2316-experimental-notation-in-reference.md) が
「載せる + experimental と明示する」に倒した）。

到達状態: `KrsFile` の全 array フィールドが `getReference()` から到達できることを
機械チェックが保証する（`packages/core/src/builtins/reference-top-level-coverage.test.ts`）。
新しい top-level 構文を足すと、到達経路を宣言するまで**型エラーで落ちる**。

## 想定される失敗モード

- 新構文をパーサ・レンダラ・spec まで通したが `REFERENCE_DATA` に足し忘れ、パネルからだけ
  見えない（#2316 の `boundary` / `facet` / `import`）。
- 構文の**片方の半分**だけをカタログに載せる。要素側プロパティ（`facets`）だけ、
  宣言ブロックだけ、参照する側だけ。個々の PR では自然に見えるが、合わさると迷子を作る。
- experimental を「まだ安定でないから」と沈黙のうちに除外し、その判断をどこにも書かない。
  結果として、**発見可能性を下げたせいで利用が伸びず、promotion gate が「証拠が無い」を
  理由に据え置きを続ける**閉ループになる（ADR-1820 の証拠源は実利用）。
- 逆に、掲載したが experimental の表示を落とす。掲載が後方互換の約束と読まれる。
- 新カテゴリを起こすべきところで既存配列に行を足し、列の意味を 2 通りにする
  （`boundary` の `contains` は**参照**、node kind の `canContain` は**入れ子** — 同じ
  「Contains」列に混ぜると読めない）。

## チェックリスト

`KrsFile` に top-level 構文を足すとき、または `reference-data.ts` を触るときに確認する:

- [ ] その構文は `getReference()` のどこから到達できるか、経路を 1 つ名指しできるか（カタログの行か、Syntax タブのスニペットか）。
- [ ] 構文が「宣言側」と「要素側」に分かれるなら、**両方**が同じサーフェスから辿れるか。片方だけ載せていないか。
- [ ] 既存カタログに足すか新カテゴリを起こすかを、**列の意味が既存行と一致するか**で決めたか（実装の少なさで決めていないか）。
- [ ] experimental なら、サーフェス上でそれが読めるか（バッジ・注記）。カタログのデータとして `experimental` を持っているか（consumer ごとの判断に委ねていないか）。
- [ ] 掲載しないと決めたなら、その決定を ADR に書いたか。書いていないなら、それは決定ではなく漏れである。
- [ ] spec 側に生成テーブルを足そうとしていないか。手書き節が既にあるなら [[TPL-2158]] の循環になる — spec を独立 source に残し、カタログを spec に対して前向きに fence する。

## 既知の対処パターン

- **`satisfies Record<ArrayKeys<KrsFile>, Surface>` パターン**: 到達経路の表を
  `KrsFile` の array キー集合に対して `satisfies` で縛る。新しい top-level 構文を足すと
  **コンパイルが落ちる**ので、掲載するか・しない理由を書くかの判断が強制される。
  `formatter-top-level-coverage.test.ts` が formatter に対して先に採っていた形の転用。
- **経路の宣言と検証を分ける**: 表は「どこから到達できるはず」を宣言するだけにし、
  テストが実際に `getReference()` を引いて確かめる。宣言だけだと嘘が書ける。
- **非対称の直接検査**: 「`facets` を広告する kind が 1 つでもあるなら `facet` 構文が
  カタログにある」のように、**半分だけ載っている状態そのもの**を assert する。
  片側ずつのカバレッジ検査では、この形は両方 green になる。

## 派生元 spec

- `docs/spec/syntax.md` / `syntax.ja.md` §「Grouping the system view (`boundary`) — experimental」
- `docs/spec/syntax.md` / `syntax.ja.md` §「Cross-cutting membership (`facet`) — experimental」
