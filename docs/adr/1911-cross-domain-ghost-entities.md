---
id: ADR-1911
title: エンティティビューの cross-domain 関連は限定子付き参照 + ghost で表示する
status: accepted
date: 2026-07-14
topic: edges
depends_on:
  - ADR-460
related_to:
  - ADR-328
  - ADR-285
---

# ADR-1911: エンティティビューの cross-domain 関連は限定子付き参照 + ghost で表示する

- **日付**: 2026-07-14
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1911](https://github.com/kompiro/karasu/issues/1911)（PR 2b-2、parent [#1870](https://github.com/kompiro/karasu/issues/1870)）
  - PR [#1936](https://github.com/kompiro/karasu/pull/1936)
  - [ADR-460](460-ghost-domain-edges.md) — ghost domain エッジ（両方向・bottom 配置・subLabel・layout-node フラグによる muting）。本 ADR はその機構を entity に拡張する
  - [ADR-328](328-ghost-system-rendering.md) — ghost 描画の基本
  - 関連 TPL: [TPL-20260714-01](../test-perspectives/TPL-20260714-01-cross-domain-entity-reference-qualified.md)
  - コード: `packages/core/src/view/view-extract.ts`（`extractEntityView` / `buildDomainEntityIndex`）、`packages/core/src/renderer/layout.ts`（`placeGhostRow` / `pushGhostEdges`）

## 背景

ドメイン単位のエンティティビュー（[#1870](https://github.com/kompiro/karasu/issues/1870)）は当初 **intra-domain 関連のみ**を描画し、参照先が他ドメインの entity である関連をドロップしていた。実システムでは `Order → Customer` のようにドメイン境界をまたぐ関連が普通にあり、それが見えないとオンボーディング（担当ドメインの依存関係の把握）に不十分だった。

## 決定

エンティティビューで cross-domain 関連の**参照先 foreign entity を muted ghost として表示**する。

1. **表示方向は両方向** — outgoing（自ドメインの entity → foreign）と incoming（foreign → 自ドメインの entity）の両方を集約する。ghost domain（ADR-460）と一貫。
2. **cross-domain 参照は限定子付き `DomainId.EntityId`** — `Order -> Customers.Customer` のように書く。bare id は intra-domain 専用。
3. **解決は所有 system にスコープ** — `DomainId` は system 内で error 級に一意なので、所有 system 内でのみ曖昧性なく解決する。cross-**system** 参照は v1 では対象外（ドロップ）。domain→entity index は system ノードで memoize し、静的バンドルが domain ごとに再構築しないようにする。
4. **muting は layout-node フラグ方式** — foreign entity を `ViewSlice.ghostEntities` に載せ、layout が `ghost: true` の layout node として配置する（キーは限定子付き `DomainId.EntityId`）。`svg-renderer` は既に `layoutNode.ghost` を `ghost-nodes` グループ（opacity 0.3）で muting するため renderer 変更は不要。live app ビューと静的バンドルの両方が自動で ghost 表示になる。

## 理由

- **限定子付きが entity ID の非一意性を構造的に解消する**。entity ID は warning 級一意性しかない（`entity-anchor-collision`）ため bare id では foreign entity を一意特定できない。dot-notation は境界越え参照の既存慣習（`table OrderDB.orders`、cross-system `SystemId.ServiceId`）と一貫し、parser 変更も不要。
- **所有 system スコープ**が「限定子で曖昧性が消える」という前提（domain ID の error 級一意性は system 内のみ）を実装と一致させる。model-wide first-match だと system 跨ぎの domain ID 衝突で誤解決し得た。
- **layout-node フラグ方式**は 2a レビューで tag/style 方式が却下された教訓（ghost が実 entity と ID を共有し、style lookup が実スタイルを返して muting が効かない）を踏まえた正しい深さの実装。ghostUsers / ghostDomains と同じ機構を共有する。
- **両方向**は依存・被依存の双方を見せ、ドメインの役割理解を深める。

## 却下した案

- **outgoing のみ（片方向）** — 実装は最小だが「誰が自ドメインを参照しているか」が見えない。ghost domain との一貫性も崩れるため却下。
- **first-match で bare id を解決** — 同名 entity が複数ドメインにあると誤った相手を ghost 化する。曖昧性を握り込む形で不正確。
- **曖昧なら drop** — 相手が明確なケースでも出なくなり、warning 済みモデルで更に情報が減る。
- **tag/style 方式の ghost**（2a で既出）— ghost が実 entity と ID を共有するため style lookup が実スタイルを返し muting が効かない。layout-node フラグ方式に統一。

## 影響

- 追加のみ。既存の intra-domain 表示・bare 参照の挙動（cross-domain へ勝手に解決しない）は不変で後方互換。
- spec: `docs/spec/syntax.md` § entity relations に限定子解決規則を明記（TPL-20260714-01 と相互リンク）。
- v2 以降（本 ADR では決めない）: 多重度タグ、ジャンクション経由の間接関連の ghost、cross-system 参照、nested domain 限定子（`Parent.Child.Entity`）。
