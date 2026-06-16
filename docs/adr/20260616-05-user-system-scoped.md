---
id: ADR-20260616-05
title: user は system-scoped とする（identity ではなく relationship）
status: accepted
date: 2026-06-16
topic: core-concepts
related_to:
  - ADR-20260511-04
  - ADR-20260511-02
scope:
  packages: [core]
assumptions:
  - "file: docs/spec/syntax.md"
  - "symbol: packages/core/src/types/ast.ts :: UserNode"
  - "grep: docs/spec/syntax.md :: Top-level placement"
---

# ADR-20260616-05: user は system-scoped とする（identity ではなく relationship）

- **日付**: 2026-06-16
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1639](https://github.com/kompiro/karasu/issues/1639)（user scoping の設計ディスカッション）, [#1624](https://github.com/kompiro/karasu/issues/1624)（top-level-declaration）
  - 受け皿 Issue: [#1314](https://github.com/kompiro/karasu/issues/1314)（v1.0 spec freeze）
  - 実装 PR: [#1637](https://github.com/kompiro/karasu/pull/1637)（`top-level-declaration` 診断 + 根拠注記）
  - 関連 ADR: [ADR-20260511-04](20260511-04-user-role-keyword-clarification.md)（`role` は actor archetype、authz primitive ではない）, [ADR-20260511-02](20260511-02-no-runtime-authz-modeling.md)（runtime authz をモデル化しない）
  - spec: `docs/spec/syntax.md`（§system block → Top-level placement）

## 背景

#1624 は「トップレベルの `user` / edge は invalid」を、汎用エラーに落ちる暗黙の
制限から **明示的に文書化された規則**（spec 節 + 診断カタログ + `top-level-declaration`
診断）へ格上げした。これは v1.0 spec freeze（#1314）の凍結面に入るため、凍結する前に
**`user` の scope が本当に system 単位で正しいのか**を決める必要があった（#1639）。

論点:

- karasu はすでに **複数の `system` ブロック**と cross-system edge（`Sys.Svc`）を
  サポートする。1 人の人間アクター（例: `Customer`）が複数 system に関わるのは自然。
- 今はそれを表すために各 system 内で `user Customer` を再宣言するしかなく、別ノード
  扱いで共有 identity が無い。
- `domain` とインフラブロック（`database` / `queue` / `storage`）は top-level に
  置ける（共有・未割り当て）のに `user` は置けない、という非対称があった。

## 決定

**`user` は system-scoped を維持する。同一人物が複数 system に関わる場合は system
ごとに別の `user` ノードで表し、共有 id の規約で結びつける。system をまたぐ共有
actor / persona は post-v1.0 の拡張余地として意図的に残す。**

個別の判断:

- **`user` は relationship であって identity ではない**。`user` は特定 system との
  アクターの関係をモデル化し、その `role` は spec 上「what this user does *within the
  system*」と定義される（ADR-20260511-04）。共有インフラは多数 system から参照される
  1 つの“モノ”（単一 identity）だが、`user` の関係（role）は system ごとに異なる。
  したがって infra との非対称は **正当**であり、バグではない。
- **同一人物は共有 id の規約で表す**。同名 `user` を 2 つの system に置いても parser・
  compile とも診断ゼロであることを確認済み（誤発火する `node-id-multiple-locations`
  等は無い）。モデル上は別ノード、人間にとっては同じ id、という規約運用で十分。
- **`top-level-declaration` の `user` 禁止は正しい規則**として確定（#1624 / #1637）。
  根拠（identity vs relationship）を spec の §Top-level placement に明記した。
- **cross-system persona は post-v1.0**。直近の実需が無く、v1.0 の `user` 語彙を
  縛りすぎないことで、将来 `persona`（per-system の `user` projection を持つ）を
  superset として導入する余地を残す。

## 理由

- **role が per-system**: `role` は system 文脈に紐づくため、1 人を 1 ノードに
  まとめると per-system の role を表現できない。system ごとのノードが素直。
- **規約で足りる**: 「同じ id = 同一人物」は診断ゼロで成立し、追加の機構なしに
  運用できる（検証済み）。
- **非対称の正当化**: 共有インフラ（identity 中心）と `user`（relationship 中心）は
  本質的に別カテゴリ。top-level 可否の差はこの違いから自然に導かれる。
- **freeze 面を最小に**: 既存セマンティクスを変えず、根拠を文書化するだけで凍結
  できる。将来の persona を閉ざさない。

## 却下した案

- **共有 top-level `user`**（infra と同様に top-level 化）: `role` が per-system
  なのに 1 ノードしか持てず破綻する。role を edge 側へ動かす大改修が要り、freeze
  直前には重すぎる。
- **top-level `persona` + per-system `user` projection**: 共有 identity と per-system
  role を両立でき最も表現力が高いが、新規 top-level 概念で複雑。直近の実需が無く
  post-v1.0 とする。
