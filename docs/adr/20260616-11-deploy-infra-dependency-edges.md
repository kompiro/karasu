---
id: ADR-20260616-11
title: deploy view に service→infra 依存エッジを描く（導出は共有ヘルパーで単一情報源化）
status: accepted
date: 2026-06-16
topic: renderer
related_to:
  - ADR-20260616-09
scope:
  packages: [core]
assumptions:
  - "file: docs/spec/syntax.md"
  - "symbol: packages/core/src/view/view-extract.ts :: deriveInfraEdges"
  - "grep: packages/core/src/view/deploy-view-extract.ts :: deriveInfraEdges"
---

# ADR-20260616-11: deploy view に service→infra 依存エッジを描く（導出は共有ヘルパーで単一情報源化）

- **日付**: 2026-06-16
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1658](https://github.com/kompiro/karasu/issues/1658)
  - 設計経緯: Design Doc `docs/design/deploy-infra-dependency-edges.md`（PR [#1661](https://github.com/kompiro/karasu/pull/1661)、本 ADR 昇格で削除）
  - 関連 ADR: [ADR-20260616-09](20260616-09-infra-physical-realize.md)（deploy unit が infra を realize / `store` kind）
  - 関連 Issue: [#423](https://github.com/kompiro/karasu/issues/423)（deploy diagram restructure — 根本モデル探索）
  - コード: `packages/core/src/view/deploy-view-extract.ts`（`extractDeployView`）, `packages/core/src/view/view-extract.ts`（`deriveInfraEdges`）

## 背景

[ADR-20260616-09](20260616-09-infra-physical-realize.md)（#1632）で `store` が infra を realize できるようになったが、
deploy view では **「その infra に依存する service」から store への線が描かれなかった**。
`extractDeployView` は ghost edge を生の `system.edges` の realize 先同士からしか作らず、
`service → infra` 依存は `deriveInfraEdges`（resource ref から合成、system view slice 内）にしか存在せず、
deploy view からは参照されていなかった。結果として「何が infra を裏付けるか」は見えるが「誰が依存するか」が物理図から読めなかった。

## 決定

**`extractDeployView` の ghost edge 集合に、合成 `service → infra` 依存エッジを合流させる。導出は
`deriveInfraEdges` を export して system view と deploy view で共有し、単一情報源とする。**

- `view-extract.ts` の `deriveInfraEdges` を export 化し、`extractDeployView` が各 system の children から同関数で
  `service → infra` エッジを導出して ghost edge に加える。
- **両端 realize 必須**: service も infra も deploy unit を持つときだけエッジを描く（既存 service→service ghost edge と一貫）。
  片方しか realize されていなければコンテナが無く、自然に脱落する。重複は `from->to` キーで dedup する。
- レイアウトは既存の Longest Path Layering を再利用 — 依存先（infra）コンテナが下層に来る。
- 視覚は既存 ghost edge スタイルを流用。infra 依存を別スタイルで描くのは out of scope（将来の polish）。
- 前方互換: infra を realize しないファイルの deploy view は不変。

## 理由

- **単一情報源で drift を防ぐ**: 同じ `service → infra` 依存を 2 箇所で別実装すると、片方更新で静かに食い違う
  （TPL-20260519-02）。`deriveInfraEdges` を共有することで両 view の依存集合が構造的に一致する。
- **既存機構の再利用**: 「両端 realize 済み」フィルタと layered layout をそのまま使えるため変更が小さく、
  store コンテナは依存先として自然に下層へ落ちる。
- **`extractDeployView` のシグネチャを変えない**: 依存は `systems` から導出でき、呼び出し側 5 箇所を触らずに済む。

## 却下した案

- **計算済み system view slice の合成エッジを `extractDeployView` に渡す**: 導出は 1 回で済むが、`extractDeployView` の
  signature 変更 + 呼び出し側 5 箇所の配線が必要で、deploy view が system view の中間生成物に結合して独立性が下がる。
- **infra 依存エッジを service→service と別スタイルで描く**: 今回は区別せず ghost edge を流用。必要なら follow-up。
- **#423 の根本モデル見直しを待つ**: 依存の *導出* はどちらのモデルでも必要なので先行実装する。ghost edge という
  *見せ方* のみ #423 の層状モデル採用時に再検討対象（導出ヘルパーは流用可能）。
