---
id: ADR-20260411-05
title: サービスドリルダウンビューでの Ghost Domain エッジ表示
status: accepted
date: 2026-04-11
topic: edges
depends_on:
  - ADR-20260410-01
scope:
  packages:
    - core
  domains:
    - rendering
    - edges
---

# ADR-20260411-05: サービスドリルダウンビューでの Ghost Domain エッジ表示

- **日付**: 2026-04-11
- **ステータス**: 決定済み
- **関連**: Issue #460, [ADR-20260410-01](20260410-01-domain-to-domain-edges-implicit-tag.md)

## 背景

ADR-20260410-01 (#445) によりドメイン間の依存をクロスサービスで宣言できるようになり、システムビューでは暗黙サービスエッジ（アンバー破線）として描画されるようになった。しかし、サービスドリルダウンビューではクロスサービスのドメインエッジが一切表示されず、ユーザーは「なぜこのサービスが別サービスに依存しているのか」を理解できなかった。

## 決定

外部ドメインを `ViewSlice.ghostDomains: KrsNode[]` および `ghostDomainEdges: KrsEdge[]` として保持し、メインコンテナの**下部**に `GHOST_OPACITY` (0.3) で半透明描画する。`LayoutNode` に `subLabel?: string` フィールドを追加し、ghost ドメインに親サービス名を小さいフォント・透過で表示する。outgoing（自サービスのドメイン → 外部ドメイン）と incoming（外部ドメイン → 自サービスのドメイン）の両方向を対象とする。

## 理由

- レイアウト空間の分離が明確になる（**left**: ghost users, **left/right**: ghost systems, **bottom**: ghost domains）
- ドメイン単体として描画する方が意味的に正確（サービスコンテナで包む A 案は「ドメインは1つだけなのにサービスコンテナが出る」過剰なラッピングになる）
- `subLabel` により親サービス名を表示でき、クロスサービスの文脈が伝わる
- 既存の ghost パターン（`ghostUsers`, `ghostSystems`）と一貫した設計
- ドメイン ID はシステム内で一意（ADR-20260411-02 / #445 で error に格上げ済み）なので、ドメイン ID だけで外部サービスのドメインを特定できる

## 却下した案

### 案A: GhostSystem ラッパーを再利用する

`layoutGhostSystem()` を流用できるメリットはあるが、ドメインノードをサービスコンテナで囲む構造が意味的に不自然。左右に配置されるため既存の ghost systems とレイアウトが競合する。

### 案C: 外部ドメインをメインコンテナ内にインライン表示

`childNodes` に含めて ghost フラグだけで区別する案。「実際の子ノード」と「外部参照」の境界が曖昧になり、ドリルダウンナビゲーション時にパス整合性が崩れる。
