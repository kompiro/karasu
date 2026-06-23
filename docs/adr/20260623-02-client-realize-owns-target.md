---
id: ADR-20260623-02
title: client は realizes / owns の対象になれる（valid-target に client kind を追加）
status: accepted
date: 2026-06-23
topic: core-concepts
related_to:
  - ADR-20260616-09
scope:
  packages: [core]
assumptions:
  - "file: docs/spec/syntax.md"
  - "grep: packages/core/src/resolver/warnings.ts :: detectUnresolvedRealizes"
  - "grep: packages/core/src/resolver/warnings.ts :: detectInvalidOwns"
  - "grep: packages/core/src/parser/parser.ts :: buildNodePathIndex"
---

# ADR-20260623-02: client は realizes / owns の対象になれる（valid-target に client kind を追加）

- **日付**: 2026-06-23
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1720](https://github.com/kompiro/karasu/issues/1720)（client を realize / owns すると false-positive warning が出る）
  - 受け皿 Issue: [#1314](https://github.com/kompiro/karasu/issues/1314)（v1.0 spec freeze）
  - 関連 ADR: [ADR-20260616-09](20260616-09-infra-physical-realize.md)（deploy unit は共有 infra ノードを realize できる）
  - spec: `docs/spec/syntax.md` / `docs/spec/syntax.ja.md`（§Writing physical diagrams → realizes、§team node → owns）
  - コード: `packages/core/src/resolver/warnings.ts`（`detectUnresolvedRealizes` / `detectInvalidOwns`）, `packages/core/src/parser/parser.ts`（`buildNodePathIndex` の `INDEXED_KINDS`）

## 背景

`client` は [client capability modeling](20260429-07-client-capability-modeling.md) 系の決定で論理層の
first-class node になり、SPA・モバイルアプリ等の「ユーザーが触れるデプロイ対象」を表す。物理層では
`assets`（CDN 配信 SPA）や `war` などの deploy unit がこれを `realizes` し、組織層では team が `owns` するのが
自然なモデリングである。

しかし `realizes` / `owns` の解決対象集合（valid-target set）は `service` / `domain`（および
[ADR-20260616-09](20260616-09-infra-physical-realize.md) 以降は infra）だけを列挙しており、`client` を含めていなかった。
結果として:

- `assets WebBundle { realizes Web }` が `unresolved-realizes` warning を出す
- `team frontend { owns Web }` が `invalid-owns`（resolver）と `owns-target-not-found`（parser）warning を出す

一方で **deploy view / org view のレンダラは valid-target に関係なく id でグルーピング・描画していた**ため、
図そのものは正しく描けていた（client コンテナも owned ボタンも出る）。問題は warning だけの false-positive であり、
ユーザーは「図は出るのに警告が出る」状態に直面していた（#1720）。

## 決定

**`client` を `realizes` および `owns` の valid-target に追加する。** client は service / domain と同格の論理ノードとして
扱い、3 箇所の解決集合すべてに同じ kind を加える:

- `detectUnresolvedRealizes`（resolver）— valid-id set に `client` kind と top-level `file.clients` を追加
- `detectInvalidOwns`（resolver）— 同上
- `buildNodePathIndex` の `INDEXED_KINDS`（parser）— `"client"` を追加し、top-level client も id 索引に載せる

前方互換: これまで warning だった `realizes <clientId>` / `owns <clientId>` が valid になるだけで、既存ファイルは壊れない。

## 理由

- **client は「デプロイ対象となる論理ノード」**。`assets` が SPA を realize するのは `oci` が service を realize するのと
  同じ抽象度であり、realize 対象から client だけを外す合理的な理由がない。owns も同様で、フロントエンドを所有する
  team を表現できないのは組織モデルとして不完全。
- **図は既に描けている**＝意味論はレンダラ側で先行して正しく実装されていた。valid-target set がレンダラに追従して
  いなかっただけであり、warning を実態（描画される＝有効な参照）に合わせる修正である。
- **v1.0 freeze 前に語彙の非対称を解消する**。realize / owns できる論理ノード kind は service / domain / client /
  （infra）で揃え、「どの kind が valid-target か」を spec に明記する。

## 影響

- spec: `docs/spec/syntax.md` / `.ja.md` の realizes・owns 記述に client を明記。
- 派生 TPL: [TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md)
  — cross-reference 検証の valid-target set は spec が許す全 kind を列挙し、複数の独立した集合は同期させる。

## 却下した代替案

- **client を realize / owns 対象にしない（現状維持）** — 図は描けるのに warning が出る不整合が残り、ユーザーは
  warning を消すために正当なモデリング（`realizes Web` / `owns Web`）を削るしかない。実際 hato のドッグフーディングで
  この回避が発生した。却下。
- **レンダラ側を valid-target に合わせて client を描かないようにする** — モデルの表現力を下げる後退であり、
  論理⇄物理⇄組織の対応を狭める。却下。
