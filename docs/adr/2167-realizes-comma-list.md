---
id: ADR-2167
title: reference list はカンマ列挙を受け、membership は 1 行 1 件に留める — `realizes` の受理形と `owns` / `contains` の境界
status: accepted
date: 2026-08-17
topic: parser
related_to: [ADR-1974, ADR-1720, ADR-1632, ADR-1046]
scope:
  packages: [core]
  concerns: []
assumptions:
  - "symbol: packages/core/src/parser/parser.ts :: parseRealizesList"
  - "symbol: packages/core/src/types/ast.ts :: RealizesTarget"
  - "grep: packages/core/src/formatter/formatter.ts :: realizes \\$\\{quoteId\\(r\\.id\\)\\}"
---

# ADR-2167: reference list はカンマ列挙を受け、membership は 1 行 1 件に留める — `realizes` の受理形と `owns` / `contains` の境界

- **日付**: 2026-08-17
- **ステータス**: 決定済み
- **関連**:
  - Issue: [#2167](https://github.com/kompiro/karasu/issues/2167)（本決定の起点）、[#409](https://github.com/kompiro/karasu/issues/409)（`realizes` の複数行受理）
  - ADR: [ADR-1974](1974-boundary-declaration-syntax.md)（`boundary` の `contains` でカンマ列挙を却下した決定 — 本 ADR はこれを覆さず、適用範囲を確定させる）、[ADR-1720](1720-client-realize-owns-target.md)、[ADR-1632](1632-infra-physical-realize.md)、[ADR-1046](1046-resource-crud-operations.md)（`operations` のカンマ列挙 + 複数行併用）
  - spec: [`docs/spec/syntax.md` §Writing physical diagrams](../spec/syntax.md)

## 背景

`realizes` は #409 以来、行を繰り返すことで 1 つのデプロイ単位が複数の論理ノードを実現することを
表せた。#2167 はこれに加えてカンマ列挙（`realizes OrderService, InventoryService`）を受理するよう
求めた。

一方 [ADR-1974](1974-boundary-declaration-syntax.md) は `boundary` の `contains` について、
まさにこのカンマ列挙を**却下**している。理由は 2 つ挙げられていた —「`owns` の idiom とずれる」
「parser 分岐が増える」。`realizes` と `owns` は「物理が論理を実現する」「チームがノードを所有する」
という対になる参照であり、TPL-1720 は両者の valid-target set を同期させるべき対象として並べている。
そのため #2167 をそのまま実装すると、`realizes` はカンマ可・`owns` / `contains` はカンマ不可という
非対称が、根拠の記録を伴わずに残る。

実装時点での karasu の受理形は次のように分かれていた。

| プロパティ | 受理形 |
| --- | --- |
| `delivers` / `operations` / `handles` / `capability` | カンマ列挙 |
| `realizes` | 行の繰り返しのみ |
| `owns` / `contains` | 行の繰り返しのみ |

つまり ADR-1974 が言う「`owns` の idiom」は karasu 全体の idiom ではなく、`owns` 系の idiom だった。
`realizes` はどちらの群にも属さない中間状態にあり、#2167 はそれをどちらに寄せるかの決定を要求している。

## 決定

**1 つの関係における対等な参照先を並べるプロパティ（reference list）はカンマ列挙を受理し、
所属・所有を宣言するプロパティ（membership）は 1 行 1 件に留める。** `realizes` は前者なので
カンマ列挙を sugar として受理し、`owns` / `contains` は ADR-1974 のまま据え置く。

判定基準は 1 つ、**その行が「1 つの関係の複数の相手」を並べているか、「1 件ずつの所属の宣言」を
並べているか**。前者は列挙の要素が互いに対等で、順序も個数も関係の意味を変えない。後者は 1 件ごとが
独立した宣言で、行が増えることそのものが読み手への情報になる。

## 理由

- **ADR-1974 の却下理由は `contains` に対しては今も有効**である。`contains` はメンバーシップの宣言で、
  1 行 1 メンバーの縦並びが「この boundary に何が入っているか」を目で数えられる形にする。
  `realizes` は 1 つのデプロイ単位から出る 1 種類の関係の相手を並べるので、同じ論拠が当たらない
- **`realizes` を reference list 側に置くと karasu 内の多数派に揃う。** `delivers` / `operations` /
  `handles` / `capability` はいずれもカンマ列挙を受けており（[ADR-1046](1046-resource-crud-operations.md)
  は `operations` について「既存パターンの踏襲で学習コストが低い」を採用理由に挙げている）、
  `realizes` だけが例外である状態のほうが説明の要る非対称だった
- **sugar なので後段の意味論に変更が要らない。** 両形は同じ `properties.realizes` に落ち、style 解決・
  deploy レイアウト・`realizes` ターゲット解決・diff / レンダリングは区別しない。ADR-1974 が懸念した
  「parser 分岐が増える」コストは、リスト解析 1 メソッド（`parseRealizesList`）に閉じた
- **正準形を行の繰り返しに固定することで、既存ドキュメントに churn が出ない。** `karasu fmt` は
  1 行 1 対象を出し続けるので、カンマ列挙は入力側の省力化に閉じる。既存の `.krs` / examples /
  docs fence は fmt をかけても書き換わらない

## 却下した案

- **`owns` / `contains` にも同時にカンマ列挙を入れて全プロパティを揃える** — #2167 が明示的に
  スコープ外としており、ADR-1974 を supersede する必要がある。上記のとおり ADR-1974 の論拠は
  `contains` に対しては現在も成立しているため、揃えること自体を目的にする理由がない
- **`fmt` の出力をカンマ列挙に変える**（`delivers` / `operations` の fmt 前例に揃える） — 既存の
  複数-`realizes` ドキュメントが次の format で全て書き換わる。受理形を増やす変更が、
  書き換えを伴わない既存ファイルにまで及ぶ理由がない
- **`realizes` をカンマ列挙のみに寄せ、行の繰り返しを deprecate する** — #409 以来の形で
  examples / docs / 利用者のファイルに広く存在する。sugar の追加が既存形の撤去を含む理由がない
- **AST を `string[]` のまま据え置き、range は並行配列で持つ** — 1 行に複数対象が並ぶと
  `unresolved-realizes` がどの対象を指すか言えなくなるため要素単位の range が要る。並行配列は
  TPL-1720 が名指しする「同じ事実の二重管理」に当たるので、`RealizesTarget { id, loc }` に畳んだ。
  公開 AST 型の破壊的変更になるが core は 0.x であり、直接読む呼び出し側は core 内に 5 箇所だった
