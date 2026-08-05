---
id: ADR-2316
title: experimental notation は Reference に載せ、experimental と明示する
status: accepted
date: 2026-08-04
topic: app-ui
refines: [ADR-1820]
related_to: [ADR-1296, ADR-1314, ADR-1974, ADR-2036]
scope:
  packages: [core, app]
assumptions:
  - "symbol: packages/core/src/builtins/reference.ts :: GroupingConstructInfo"
  - "grep: packages/core/src/builtins/reference-data.ts :: groupingConstructs"
  - "file: packages/core/src/builtins/reference-top-level-coverage.test.ts"
---

# ADR-2316: experimental notation は Reference に載せ、experimental と明示する

- **日付**: 2026-08-04
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2316](https://github.com/kompiro/karasu/issues/2316)
  - [ADR-1820](1820-notation-promotion-gate.md) — notation promotion gate（本 ADR が refine する対象。gate は「どのサーフェスに載るか」を規定していなかった）
  - [ADR-1296](1296-reference-data-single-source.md) — `reference-data.ts` を Reference と `docs/spec` の単一情報源とする決定
  - [ADR-1974](1974-boundary-declaration-syntax.md) / [ADR-2036](2036-scoped-boundary-declaration.md) — `boundary`、[#2173](https://github.com/kompiro/karasu/issues/2173) — `facet`
  - [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) — 受理語彙の 3 状態規律。本 ADR はその discoverability 側の隣人
  - **新規** [TPL-2316](../test-perspectives/TPL-2316-declarable-construct-reachable-from-reference.md)

## 背景

`boundary` と `facet` は宣言可能な top-level 構文で、`docs/spec/syntax.md` に手書きの節を持ち、
実装も出荷済み（`boundary` は #1974 以降 4 スライス、`facet` は #2173 / #2174）である。
にもかかわらず、どちらも `REFERENCE_DATA` に 1 行も存在せず、`getReference()` を読む
Reference パネルからは**到達できなかった**。

さらに非対称が 1 つあった。`facet` の**要素側**の半分である `facets` プロパティは、
#2173 で 14 の全 node kind に列挙されている。つまり Reference の中で `facets` を見つけた人は、
それが何を指しているのか・どう宣言するのかを Reference の中で学ぶ手段が無い。
語彙を見つけるために存在するサーフェスが、語彙の半分だけを見せていた。

問題は欠落そのものではなく、**欠落が意図か否かを記録から判定できなかった**ことである:

- ADR-1820（promotion gate）は experimental notation の扱いを定めているが、
  **どのサーフェスに載るか / 載らないかには一言も触れていない**。
- `reference-data.ts` には除外ロジックも `experimental` フラグもコメントも無い。

「experimental は昇格まで Reference に出さない」という方針は成立しうるが、どこにも書かれておらず、
「単に足し忘れた」と証拠上まったく区別がつかない。この 2 つは修正の向きが逆になる。

## 決定

**experimental notation は Reference に載せる。そのうえで experimental であることを
サーフェス上で明示する** — 掲載が安定性の約束と読まれないようにする。掲載/非掲載は
promotion gate の判断対象ではない（gate が決めるのは互換の約束であって、発見可能性ではない）。

配置は `KarasuReference` の**新しいカテゴリ** `groupingConstructs` とする。`boundary` と
`facet` は要素でも org kind でもなく、**要素の上に張られるグルーピング / 所属の構文**なので、
既存配列への行追加ではなくカテゴリを起こす。

## 理由

- **隠すと gate が必要とする証拠を自分で潰す。** ADR-1820 の昇格トリガーは実利用の証拠
  （利用データ・混乱 Issue）であり、証拠源は karasu-nest の共有 corpus である。発見可能性を
  下げれば利用は減り、gate は「証拠が無い」を理由に据え置きを続ける — 隠したことが原因の
  据え置きを、実測の結果と取り違える閉ループになる。**据え置きが既定である以上、
  発見可能性は最大化しておくほうが gate の設計と整合する。**
- **experimental は「無い」ではなく「約束していない」。** 掲載しないことは前者を意味してしまう。
  spec には章があり、パーサは受理し、レンダラは描く。Reference だけが沈黙している状態は、
  ツールの中で Reference だけが嘘をついている。フラグ付きで載せるのが事実に最も近い。
- **`facets` を載せて `facet` を載せない状態が一番悪い。** どちらの方針を採っても、この非対称は
  正当化できない。掲載する側に倒せば非対称は消え、隠す側に倒すなら `facets` を 14 kind から
  剥がす必要があり、そちらは既定描画に関わらないプロパティを**実際に使えなくする**方向の退行になる。
- **新カテゴリにするのは register の分離をデータ構造に写すため。** `nodeKinds` は論理要素の
  カタログで、`canContain` / `properties` という要素の語彙を持つ。`boundary` / `facet` に必要な
  列は「所属をどう書くか」であり、要素の列とは重ならない。行として混ぜると
  「Contains」列の意味が 2 通りになる（`boundary` の `contains` は**参照**、node kind の
  `canContain` は**入れ子**）。
- **`docs/spec/syntax.md` には生成テーブルを置かない。** `boundary` / `facet` は既に長い手書きの節を
  持っており、そこへ `REFERENCE_DATA` 由来のテーブルを生成すると spec ↔ データの照合が循環する
  （[TPL-2158](../test-perspectives/TPL-2158-catalog-fenced-against-parser-not-generated-doc.md) が
  名指しする失敗モード。`node-kinds-*` テーブルで実際に起きた）。spec を独立の source に保ち、
  カタログを spec に対して前向きに fence する側を採る。

## 却下した案

- **experimental は昇格まで Reference から隠す**（ADR-1820 に明文化する）。上の閉ループを作るのが
  決定的。加えて、隠す運用は「実装 → spec → Reference」の間に人手のゲートを 1 つ増やし、
  昇格 PR のたびに Reference への掲載を忘れる新しい drift 面を作る。
- **`nodeKinds` に行を足す。** 実装は最小だが、`boundary` / `facet` が「要素の一種」だと読まれる。
  ADR-1974 / #2173 が register を分けた理由（グルーピングは要素ではない）を UI で潰す。
- **`REFERENCE_DATA` に `experimental` フラグだけ足して掲載可否を consumer に委ねる。**
  「載せる/載せない」がサーフェスごとにばらける。Reference は載せるが docs-site は載せない、
  といった分岐が誰の決定でもなく発生する。掲載は決定として 1 箇所で固定する。

## 波及

- `KarasuReference.groupingConstructs`（`GroupingConstructInfo[]`）を追加。`@karasu-tools/core` の
  TS API 追加なので minor（ADR-1314 — TS API は v0.x）。`.krs` 言語には一切触れないため
  **言語版の遷移は無い**。
- `SyntaxSection` に `experimental?: boolean` と `groupingTable` バリアントを追加。パネルは
  experimental 節にバッジを出す。
- 併せて `import` / `@import` の Syntax 節を追加した。到達可能性を機械チェック（TPL-2316）に
  したところ、`boundary` / `facet` と同じ欠落がもう 1 件あることが判明したため
  （例外リストに理由なく積むより、埋めるほうが安い）。
