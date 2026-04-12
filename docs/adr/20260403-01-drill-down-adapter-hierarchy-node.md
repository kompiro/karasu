# ADR-0046: Drill-down 収集ロジック統一 — `HierarchyNode` 型 + 高階関数

- **日付**: 2026-04-03
- **ステータス**: 決定済み
- **関連**: Issue #226

## 背景

`drill-down-svg.ts` には、ドリルダウンレベルを収集する関数が 2 つあった：

- `collectDrillDownLevels` — system ビュー（`KrsNode[]` + `ownerIndex`）
- `collectDrillDownOrgLevels` — org ビュー（`OrganizationBlock[]`）

両者のアルゴリズム構造（CSS `:target` ナビゲーション、戻るボタン、再帰的レベル収集）は同一で、違いは「スライス抽出」「レンダリング」「子ノード取得」のみ。バグ修正・ロジック変更を 2 重適用するメンテナンスコストが発生していた。

## 決定

`TeamNode` の `teams` / `members` を `children: OrgNode[]` に統合し、system ノードと共通の `HierarchyNode` 型を導入する：

```typescript
interface HierarchyNode {
  id: string;
  label?: string;
  children: HierarchyNode[];
}
```

ドリルダウン骨格は `collectDrillDownLevelsGeneric<S>` として高階関数化し、ビュー固有処理は `DrillDownCallbacks<S>` で吸収する：

```typescript
interface DrillDownCallbacks<S> {
  getSlice: (path: string[]) => S;
  hasContent: (slice: S) => boolean;
  getChildren: (slice: S) => HierarchyNode[];
  render: (slice: S, childLinks: Map<string, string>) => string;
}
```

### Phase 分割

- **Phase 1**: `TeamNode.children` 統合 + `HierarchyNode` 定義（パーサー、`extractOrgView`、`renderOrgView`、テスト修正）
- **Phase 2**: `collectDrillDownLevelsGeneric<S>` 実装 + `buildDrillDownSvg` / `buildDrillDownSvgOrg` のコールバック化、旧関数削除

## 理由

- **構造的型付けで自然に満たす**: TypeScript の構造的型付けにより、`SystemNode`（既に `children: KrsNode[]` を持つ）と統合後の `TeamNode` は型定義変更なしで `HierarchyNode` を満たす
- **ドリル可能判定の共通化**: `child.children.length > 0` という判定が system/org 双方で共通になり、コールバック側の責務が減る
- **`ownerIndex` のクロージャ閉じ込め**: `ownerIndex` 等のビュー固有情報は `render` コールバックのクロージャに閉じ込まる
- **行数削減 + 高い可読性**: 案1（HierarchyAdapter インターフェース）や案2（`unknown` 型のコールバック）と比べて、型安全性と可読性のトレードオフが最も良い
- **TeamNode の `children` 統一**: 樹形図の走査・2-layer drill-down がシンプルになり、`Full View` 側の収集関数にも将来適用できる

## 却下した案

### 案1: `HierarchyAdapter` クラスインターフェース

`unknown` 型での型安全性低下、ジェネリクスにすると型推論が複雑化、抽象レイヤーの追加で除去する重複（〜30 行）と同等の行数増加。

### 案2: 関数パラメータ（高階関数）のみ（`HierarchyNode` 導入なし）

ドリル可能判定がコールバック側に分散し、ビュー間で重複する。

### 案3: 重複を維持

メンテナンスコストの 2 重支払いが続く。

## 残課題

- `Full View` 側の収集関数（`collectFullViewLevels`, `collectOrgFullViewLevels`）への同パターン適用は Phase 2 後に判断
