---
id: ADR-2165
title: 論理ノードの containment 規則は `canContain` を唯一の定義とし、違反は言語 v1.x で warning とする
status: accepted
date: 2026-07-30
topic: parser
depends_on:
  - ADR-1296
  - ADR-1314
related_to:
  - ADR-681
  - ADR-702
  - ADR-1567
  - ADR-1639
  - ADR-1870
  - ADR-2124
scope:
  packages:
    - core
    - i18n
assumptions:
  - "symbol: packages/core/src/builtins/reference-data.ts :: LOGICAL_CONTAINMENT"
  - "grep: packages/core/src/parser/parser.ts :: node-not-in-context"
  - "grep: packages/core/src/types/ast.ts :: \"node-not-in-context\""
  - "file: packages/core/src/builtins/reference-parser-sync.test.ts"
  - "grep: docs/spec/syntax.md :: Nesting placement"
---

# ADR-2165: 論理ノードの containment 規則は `canContain` を唯一の定義とし、違反は言語 v1.x で warning とする

- **日付**: 2026-07-30
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#2165](https://github.com/kompiro/karasu/issues/2165)（`system` が何を含めるかの語彙判断）
  - 発見元: [#2158](https://github.com/kompiro/karasu/issues/2158) / [PR #2163](https://github.com/kompiro/karasu/pull/2163)（Reference catalog を parser で縛った際、`canContain` だけ縛れず残った）
  - Design Doc: `docs/design/logical-containment-rules.md`（[PR #2171](https://github.com/kompiro/karasu/pull/2171)。本 ADR に集約して削除）
  - 実装 PR: [#2183](https://github.com/kompiro/karasu/pull/2183)
  - follow-up: [#2184](https://github.com/kompiro/karasu/issues/2184)（system 直下 domain に `unassigned-domain` を出すか）
  - 前提 ADR: [ADR-1296](1296-reference-data-single-source.md)（`reference-data.ts` が catalog の正典）、[ADR-1314](1314-krs-spec-v1-freeze.md)（言語 v1.0 freeze）
  - 関連 ADR: [ADR-681](681-top-level-service-rendering.md) / [ADR-702](702-top-level-infra-rendering.md)（未割り当てノードを `(Unassigned)` 擬似 system で描画）、[ADR-1639](1639-user-system-scoped.md)（配置規則の書き方の先例）、[ADR-1567](1567-rule-diagnostic-separation-and-catalog.md)（規則 ↔ 診断の対応）、[ADR-1870](1870-domain-entity-modeling.md)（`entity` の配置規則）、[ADR-2124](2124-version-vocabulary.md)（版語彙 — 「言語 v2.0」の意味）
  - TPL: [TPL-20260730-02](../test-perspectives/TPL-20260730-02-containment-rule-has-single-definition.md)（同 PR で新設）
  - AT: `docs/acceptance/2165-logical-containment-rules.md`
  - コード: `packages/core/src/builtins/reference-data.ts`, `packages/core/src/parser/parser.ts`

## 背景

`REFERENCE_DATA.nodeKinds[].canContain`（spec の **含められるもの** 列の生成元）は
誰も検証しない文書列だった。parser が入れ子を強制していたのは `entity`（domain 限定）
と infra ブロック（system 直下限定）だけで、論理レイヤの parent × child を実測した
ところ、**受理される 47 通のうち 37 通が `canContain` に載っていない**状態だった。
`client` の中の `usecase`、`resource` の中の `service` すら診断ゼロで通った。

対照的に top-level（ファイル直下）の配置は厳密に決まっている（`unexpected-token-root` /
`top-level-declaration`、ADR-1639）。karasu は「ファイル直下に何を置けるか」は決めきって
いたのに、「ブロックの中に何を置けるか」は決めていなかった。

#2165 はその一角として起票された: `system.canContain` が `domain` を挙げていないのに
system 直下の domain はパースも描画も通り、`docs/spec/syntax.md` §S2 は `domain` /
`usecase` / `resource` を system の子として列挙していて、三者が食い違っていた。

この列を機械検証できないことは #2158 でも足枷になっていた。catalog の他の列は parser
実測で双方向に縛れたが、`canContain` だけは parser 側に規則が無いため比較対象が作れず、
`entity` の配置しか fence できなかった。

## 決定

**`canContain` を containment 規則の唯一の定義に格上げし、parser がそこから導出した
`LOGICAL_CONTAINMENT` を読んで違反に `node-not-in-context` warning を発行する。
error 化は言語 v2.0（[§Syntax 2.0 プログラム](../roadmap.md#syntax-20-プログラム)）に登録し、
言語 v1.x では実施しない。**

個別の判断:

- **warning であり error ではない**。言語 v1.0 は freeze 済み（ADR-1314）なので、今日
  パースが通るファイルは通り続ける。ノードは AST に保持され従来どおり描画される。
  これは roadmap が tag / annotation の語彙閉鎖で既に確立した「言語 v1.x は warning
  （additive、freeze 非抵触）→ 言語 v2.0 で error」と同じ型である。
- **規則の写しを作らない**。`LOGICAL_CONTAINMENT` は `canContain` から導出する。
  parser に kind 名を直書きするのは、規則が `canContain` から導出できない場合
  （= ノードを捨てるしかなく error にする場合）に限る。現在その例外は 4 つ:
  `infra-not-in-context` / `entity-not-in-domain` / `boundary-not-in-context` と、
  `entity` の中のノード全般（`unexpected-token-in-block`、TPL-20260711-01 の
  「属性を持たない」不変条件）。
- **`domain` は system 直下にも書ける**。ADR-681 / ADR-702 が「service に未割り当ての
  service / domain / infra」を正当な状態として扱うと決めている以上、system 直下の
  domain を異常扱いする理由がない。§S2 の記述とも一致する。ただし `unassigned-domain`
  warning と `(Unassigned)` 擬似 system が対象にしているのは今のところトップレベル形
  のみで、この非対称は spec に明記したうえで #2184 に分離した。
- **spec に節を置き、専用の診断コードを対応させる**（ADR-1567 / TPL-20260610-02）。
  `docs/spec/syntax.md` / `.ja.md` に §Nesting placement / §入れ子の配置 を新設し、
  診断カタログに 1 行を追加した。

## 理由

- **freeze を守りつつ放置しない**。error 化は破壊的変更で次 major まで実施できないが、
  warning は additive で今すぐ出せる。移行期間に warning を出しておくことで、言語 v2.0
  で error にしたときの破壊面が事前に観測できる。
- **`canContain` に実効性が生まれる**。正典化した結果、#2158 で導入した
  `reference-parser-sync.test.ts` が `canContain` を全 kind × 双方向で fence できる
  ようになった（「載っている = warning なし」「載っていない = warning あり」）。
  規則の追加はデータの編集になり、表・parser・診断が同時にしかズレない。
- **意味論の裏付けがある**。`docs/concepts.ja.md` は階層を
  `service → domain → usecase → resource` と定めており、`client` 直下の `usecase` に
  与えられる意味が無い。受理はするが意味は無い、という状態を放置するのは
  TPL-20260610-01（受理された語彙は効果を持つ）に反する。
- **出荷資産への影響がゼロ**。`examples/**/*.krs` 78 ファイルは違反 0 件で、
  `examples.test.ts` がその状態を fence する。規則を厳しくしたとき自分のサンプルが
  最初の被害者になるのを防ぐ。

## 却下した案

### 案: 今回は文書だけ直す（`system.canContain` に `domain` を足し、§S2 と整合させる）

変更は最小だが #2165 の表面だけ塞がり、`canContain` が文書のみである構造は残る。
残り 36 通の lax な入れ子は未文書のままで、TPL-20260727-01（parser の受理 ⊆ spec の
文書化）を満たさない状態が続く。次に同じ発見が別の角から出てくる。

### 案: lax を正当と認め、`canContain` を「推奨される配置」に格下げする

実装コストはゼロだが、`docs/concepts.ja.md` の階層定義と正面から矛盾する。
`client` 直下の `usecase` に意味論を与えられないまま「サポートされた記法」と宣言する
ことになり、TPL-20260610-01 に反する。

### 案: いま error 化する

ADR-1314 の言語 v1.0 freeze に抵触する。今日パースが通っているファイルが壊れる。
破壊的変更は言語 v2.0 の枠（roadmap §Syntax 2.0）で扱う。

### 案: `canContain` を parser 側にも書き写し、reference-data とテストで突き合わせる

規則の定義が 2 箇所になり、drift の余地を残したまま「同期テストで気づける」状態に
留まる。ADR-1296 が catalog を単一の正典に集約した判断と整合しない。導出（1 箇所）で
足りる以上、複製する理由がない。
