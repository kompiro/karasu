# Ghost Domain Edges in Service Drill-Down View

- **日付**: 2026-04-11
- **ステータス**: 提案
- **関連**: Issue #460, [ADR-0033](../adr/0033-domain-to-domain-edges-implicit-tag.md) — Domain 間エッジと `[implicit]` 自動タグ

## 背景・課題

#445（domain-to-domain edges）により、ドメイン間の依存をクロスサービスで宣言できるようになった。
システムビューではこの依存が暗黙サービスエッジ（アンバー破線）として描画される。

しかし、サービスドリルダウンビューではクロスサービスのドメインエッジが**一切表示されない**。
ユーザーはサービス内を見ているとき「なぜこのサービスが別サービスに依存しているのか」を理解できない。

## 制約・前提

- 既存の ghost パターン（`ghostUsers`, `ghostSystems`, `callerGhostSystems`）と一貫した設計にする
- Ghost ノードは `GHOST_OPACITY`（0.3）で描画する既存インフラを再利用する
- ドメイン ID はシステム内で一意（#445 で error に格上げ済み）→ ドメイン ID だけで外部サービスのドメインを特定できる
- outgoing（自サービスのドメイン → 外部ドメイン）と incoming（外部ドメイン → 自サービスのドメイン）の両方向を対象とする

## 検討した選択肢

### A. GhostSystem ラッパーを再利用する

外部ドメインを `GhostSystem` インターフェース（`systemNode` + `visibleServices`）でラップし、
`ghostSystems` / `callerGhostSystems` と同じレイアウトパイプラインで配置する。

**メリット**
- 既存の `layoutGhostSystem()` をそのまま使える
- サービス名がコンテナラベルとして自然に表示される

**デメリット**
- ドメインノードをサービスコンテナで囲む構造が意味的に不自然（ドメインは1つだけなのにサービスコンテナが出る）
- `GhostSystem` は「外部システム内のサービス群」を表す型であり、「外部サービス内のドメイン」とは抽象度が異なる
- 左右に配置されるため、既存の ghost systems とレイアウトが競合する

---

### B. フラットな KrsNode[] として管理し、コンテナ下部に配置する

外部ドメインを `ghostDomains: KrsNode[]` として `ViewSlice` に追加し、
メインコンテナの**下部**に ghost ノードとして配置する。
親サービス名は `LayoutNode` に `subLabel` フィールドを追加して表示する。

**メリット**
- Ghost users（左）、Ghost systems（左右）と位置が競合しない
- ViewSlice のフィールドがシンプル（`KrsNode[]` + `KrsEdge[]`）
- ドメインノード単体としてレンダリングでき、意味的に正確

**デメリット**
- `LayoutNode` に `subLabel` フィールドを追加する必要がある
- 配置ロジックを新規に書く必要がある（`layoutGhostSystem` は流用不可）

---

### C. 外部ドメインをメインコンテナ内にインライン表示する

外部ドメインを通常の `childNodes` に含め、ghost フラグだけで区別する。

**メリット**
- レイアウトの追加が不要（既存のレイヤーベースレイアウトに自然に組み込まれる）

**デメリット**
- サービスの「実際の子ノード」と「外部参照」の区別が曖昧になる
- コンテナの境界内に外部ノードがあるのは視覚的に混乱を招く
- ドリルダウンナビゲーション時に外部ドメインがクリッカブルになると、パスの整合性が崩れる

## 比較

| 観点 | A. GhostSystem ラッパー | B. フラット KrsNode[] | C. インライン |
|------|------------------------|----------------------|---------------|
| 既存パターンとの一貫性 | ○（構造は同じ） | ○（ghost フラグは同じ） | △（境界が曖昧） |
| 意味的な正確さ | △（過剰なラッピング） | ○ | ✗ |
| レイアウト競合 | ✗（左右が埋まる） | ○（下部に配置） | ○ |
| 実装コスト | 低（流用） | 中（新規配置） | 低 |
| 親サービス名の表示 | ○（コンテナラベル） | ○（subLabel） | △ |

## 現時点の方針

**案 B（フラットな KrsNode[] + コンテナ下部配置）を採用する。**

理由:
- レイアウト空間の分離が明確（left: users, left/right: systems, bottom: domains）
- ドメイン単体として表示する方が意味的に正確
- `subLabel` により親サービス名を表示でき、クロスサービスの文脈が伝わる

## 実装方針

### 1. ViewSlice の拡張（`view-extract.ts`）

```typescript
export interface ViewSlice {
  // ... 既存フィールド ...
  
  /** Service view only: domains in other services connected via cross-service domain edges. */
  ghostDomains: KrsNode[];
  /** Service view only: cross-service domain edges connecting to ghost domains. */
  ghostDomainEdges: KrsEdge[];
}
```

### 2. Ghost ドメインの抽出（`view-extract.ts` — `extractView` 内）

サービスビュー判定ブロック（`isServiceView`）内で、`buildDomainServiceMap()` を再利用して
クロスサービスドメインエッジを検出する。

```typescript
// 擬似コード
const allServices = system.children.filter(c => c.kind === "service");
const domainServiceMap = buildDomainServiceMap(allServices);
const ghostDomainMap = new Map<string, KrsNode>();
const ghostDomainEdges: KrsEdge[] = [];

// Outgoing: this service's domain -> foreign domain
for (const domain of containerNode.children.filter(c => c.kind === "domain")) {
  for (const edge of domain.edges) {
    const targetServiceId = domainServiceMap.get(edge.to);
    if (targetServiceId && targetServiceId !== containerId) {
      // Find the foreign domain node
      const targetService = allServices.find(s => s.id === targetServiceId);
      const foreignDomain = targetService?.children.find(c => c.id === edge.to);
      if (foreignDomain && !ghostDomainMap.has(edge.to)) {
        ghostDomainMap.set(edge.to, foreignDomain);
      }
      ghostDomainEdges.push(edge);
    }
  }
}

// Incoming: foreign domain -> this service's domain
const localDomainIds = new Set(
  containerNode.children.filter(c => c.kind === "domain").map(c => c.id)
);
for (const service of allServices) {
  if (service.id === containerId) continue;
  for (const domain of service.children.filter(c => c.kind === "domain")) {
    for (const edge of domain.edges) {
      if (localDomainIds.has(edge.to)) {
        if (!ghostDomainMap.has(domain.id)) {
          ghostDomainMap.set(domain.id, domain);
        }
        ghostDomainEdges.push(edge);
      }
    }
  }
}
```

### 3. LayoutNode の拡張（`layout.ts`）

```typescript
export interface LayoutNode {
  // ... 既存フィールド ...
  subLabel?: string;  // Ghost domain の親サービス名表示用
}
```

### 4. Ghost ドメインの配置（`layout.ts`）

メインコンテナの下に、`GHOST_DOMAIN_GAP`（例: 60px）を空けて配置する。

- Ghost domain ノードを横に並べる（domain が複数ある場合）
- 各ノードに `ghost: true` と `subLabel: parentServiceName` を設定
- Outermost コンテナを拡張して ghost domain を含める

### 5. Ghost ドメインエッジの配置（`layout.ts`）

- Outgoing: ソースドメインノード（コンテナ内）→ ghost ドメインノード（コンテナ下）
- Incoming: ghost ドメインノード（コンテナ下）→ ターゲットドメインノード（コンテナ内）
- `ghost: true` を LayoutEdge に設定

### 6. subLabel のレンダリング（`svg-renderer.ts`）

`renderNode()` 内で、`node.subLabel` が存在する場合にメインラベルの下に
小さいフォント（`fontSize * 0.75`）・やや透過（`opacity: 0.6`）でサービス名を描画する。

### 7. テスト

#### ユニットテスト（`view-extract.test.ts`）

- サービスビューで outgoing ghost domain が抽出されること
- サービスビューで incoming ghost domain が抽出されること
- ghost domain edge の from/to が正しいこと
- システムビュー・ドメインビューでは ghost domain が空であること
- 同じ外部ドメインが outgoing と incoming の両方で参照されても重複しないこと

#### 受け入れテスト（`docs/acceptance/`）

- `domain-drift.krs` で OrderService にドリルダウンしたとき、PaymentDomain が ghost ノードとして表示される
- Ghost ノードに「PaymentService」のサブラベルが表示される
- Ghost エッジが opacity 0.3 で描画される

## 描画イメージ

```
┌──────────────── OrderService ──────────────────┐
│                                                 │
│  ┌──────────────┐         ┌───────────────┐    │
│  │ OrderDomain  │────────▶│ShippingDomain │    │
│  └──────┬───────┘         └───────────────┘    │
│         │                                       │
└─────────┼───────────────────────────────────────┘
          │  ghost edge (opacity: 0.3)
          ▼
   ┌──────────────────┐
   │ PaymentDomain    │  ← ghost node (opacity: 0.3)
   │ (PaymentService) │  ← subLabel
   └──────────────────┘
```
