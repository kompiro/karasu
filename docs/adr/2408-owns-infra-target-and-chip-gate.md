---
id: ADR-2408
title: team は infra ブロックを owns できる（カードのチップは論理 kind のみ）
status: accepted
date: 2026-08-11
topic: core-concepts
related_to:
  - ADR-1720
  - ADR-1632
  - ADR-1858
scope:
  packages: [core]
assumptions:
  - "symbol: packages/core/src/types/ast.ts :: OWNS_TARGET_KINDS"
  - "symbol: packages/core/src/types/ast.ts :: OWNABLE_LOGICAL_KINDS"
  - "symbol: packages/core/src/resolver/warnings.ts :: detectInvalidOwns"
  - "symbol: packages/core/src/parser/reference-validation.ts :: collectOwnableIds"
  - "grep: packages/core/src/renderer/layout.ts :: groupBy === \"team\" \\? ownerIndex"
  - "file: docs/spec/syntax.md"
---

# ADR-2408: team は infra ブロックを owns できる（カードのチップは論理 kind のみ）

- **日付**: 2026-08-11
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#2408](https://github.com/kompiro/karasu/issues/2408)（`invalid-owns` が infra を弾き、spec の valid-target set と矛盾する）
  - 実装 PR: [#2423](https://github.com/kompiro/karasu/pull/2423)
  - 関連 ADR: [ADR-1720](1720-client-realize-owns-target.md)（`client` を `realizes` / `owns` の valid-target に追加）、[ADR-1632](1632-infra-physical-realize.md)（deploy unit は共有 infra を `realizes` できる）、[ADR-1858](1858-system-view-group-by-team.md)（Group by: team のメンバー範囲）
  - spec: `docs/spec/syntax.md` / `.ja.md`（§team node）、`docs/spec/diagnostics.md` / `.ja.md`（`owns-target-not-found` / `invalid-owns`）
  - 派生 TPL: [TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md)
  - コード: `packages/core/src/types/ast.ts`（`OWNS_TARGET_KINDS` / `OWNABLE_LOGICAL_KINDS`）

## 背景

`owns` の対象になれる kind について、**決定を下した ADR がこれまで無かった**。
[ADR-1720](1720-client-realize-owns-target.md) は `client` を追加した決定であり、
[ADR-1632](1632-infra-physical-realize.md) は `realizes` の対象に infra を認めた決定で、
どちらも「team が infra を所有できるか」には触れていない（ADR-1632 の本文に `owns` の
語は 1 度も出てこない）。にもかかわらず spec 側は §team node 末尾の
`> Related TPLs:` 注釈で valid-target set を「service / domain / client / infra」と
記述しており、**spec が先に infra を含んでいて、決定記録が無い**状態だった。

実装はその spec にも追いついていなかった。存在検査（`owns-target-not-found`）は
`database OrderDB {}` の id を受理する一方、kind 検査（`invalid-owns`、
`detectInvalidOwns`）は service / domain / client だけを列挙していたため、
`team backend { owns OrderDB }` は「所有できない kind」と警告された。org view は
その所有関係を従来どおり描いており、[ADR-1720](1720-client-realize-owns-target.md) が
`client` について指摘したのと同じ構図 — レンダラが先に正しく、valid-target set が
追いついていない — が infra でも起きていた（#2408）。

同時に、`owns` を提示する側の kind ゲートが 1 つではないことも分かった。カードの
チップは論理 kind に絞る一方、*Group by: team* のフレーム所属は id ベースの
`ownerIndex` から解決される（[ADR-1858](1858-system-view-group-by-team.md) の
メンバー範囲）。この非対称は既に実装の事実だったが、どこにも記録されていなかった。

## 決定

**`owns` の対象 kind を「service / domain / client + infra ブロック（`database` /
`queue` / `storage`、深さは問わない）」と定め、解決を担う 2 つの検査
（`owns-target-not-found` と `invalid-owns`）はその列挙を 1 つの定数
`OWNS_TARGET_KINDS` から読む。** infra の leaf（`table` / `queue-item` / `bucket`）と
`capability` は所有の単位ではなく、`invalid-owns` が弾く。

**提示側は対象 kind と一致させない。** カードの team チップは論理 kind のみ
（`OWNABLE_LOGICAL_KINDS`）で、所有された infra ブロックにチップは出ない。その所有関係は
*Group by: team* のフレームと org view で読む。

## 理由

- **spec と実装の食い違いを spec 側に寄せる。** 対象 kind の記述は spec に既にあり、
  ユーザーから見て `database` を所有する team は自然なモデリングである。実装を
  spec に合わせるのが、記述を狭める方向より表現力を落とさない。
- **「図は描けているのに警告が出る」を解消する。** ADR-1720 と同じ判断で、
  警告を実態（描画される＝有効な参照）に合わせる。
- **列挙を 1 箇所に畳むことが再発防止の本体である。** ADR-1720 は 3 つの集合すべてに
  `client` を足したが、集合は 3 つのまま残った。その結果、次に infra が対象になったとき
  `detectInvalidOwns` だけ取り残された。「全部に足す」では次の kind でまた漏れる
  （[TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md) に
  この学びを追記した）。
- **leaf を対象外に保つのは `realizes` と揃えるため。** deploy unit が `table` を
  realize しないのと同じ理由で、team も `table` を所有しない。所有・実現の単位は
  ブロックであって leaf ではない。存在検査は leaf の id を「在る」と認めるので、
  kind として弾くのは `invalid-owns` の役目になる。
- **チップを広げないのは幾何の制約であって語彙の制約ではない。** 矩形のチップは
  円柱・雲の角に収まらない。これは
  [ADR-1720](1720-client-realize-owns-target.md) 由来の `DEPLOY_AFFORDANCE_KIND_SET`
  が deploy ボタンについて既に置いている制約と同一で、広げるには shape-aware な
  配置が先に必要になる。**対象 kind の決定をその実装待ちにはしない** — 警告を出し
  続ける理由にはならないため。

## 却下した案

- **infra を `owns` の対象外として spec を狭める** — `invalid-owns` の実装に spec を
  合わせる案。team が共有ストアを所有するのは実在するモデリングであり、
  ADR-1720 が却下した「レンダラを検証に合わせて描画を削る」後退と同型。却下。
- **チップも同時に infra へ広げる** — 提示と対象を完全に一致させる案。円柱・雲に
  矩形チップを載せる配置設計（shape-aware placement）が前提になり、語彙の
  非対称解消という本題から範囲が大きく外れる。対象 kind の決定を先に確定させ、
  提示側は別途扱う。却下（見送り）。
- **`collectOwnableIds` を 2 つの検査で共有する** — id 集合そのものを共有する案。
  2 つの集合は意図的に異なる: 存在検査は leaf の id も「在る」と認める必要があり、
  kind 検査は leaf を弾く必要がある。共有すべきは **kind の列挙**だけで、
  id 空間は各検査が自分の目的で構築する。却下。
- **チップが出ないなら *Group by: team* のフレームからも infra を外す** — 提示側の
  2 つのゲートを揃える案。フレームは id ベースであることが
  [ADR-1858](1858-system-view-group-by-team.md) の決定で、kind で絞ると
  「所有しているのに枠に入らない」という別の非対称を作る。フレームは所有関係が
  読める唯一のシステムビュー上の場所でもあるため残す。却下。
