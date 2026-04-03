# Drill-down Collection Logic Unification

- **日付**: 2026-04-03
- **ステータス**: 検討中
- **関連**: [#226](https://github.com/hiroki-o/karasu/issues/226), `packages/core/src/renderer/drill-down-svg.ts`

## 背景・課題

`drill-down-svg.ts` には、ドリルダウンレベルを収集する関数が2つある:

- `collectDrillDownLevels` — system ビュー（`KrsNode[]` + `ownerIndex`）
- `collectDrillDownOrgLevels` — org ビュー（`OrganizationBlock[]`）

両者のアルゴリズム構造は同一で、違いは「スライス抽出」「レンダリング」「子ノード取得」のみ。
このまま放置すると、ロジック変更（例: ビュー遷移改善、スタイル伝播の変更）を両方に同時適用し続けるメンテナンスコストが発生する。

### ビュー種別ごとの要件

| ビュー | レイアウト | ドリルダウン | 付随情報 |
|---|---|---|---|
| System | 鳥瞰図（トポロジカルソート） | 2-layer 表示 | `ownerIndex`（チーム所有情報） |
| Org | 樹形図 | 2-layer 表示 | 所属コンテキスト表示 |

レンダリング方式は異なるが、**ドリルダウンのナビゲーション骨格**（CSS `:target` によるレベル切り替え、戻るボタン、再帰的レベル収集）は共通。

### 関数の構造比較

```
function collectDrillDown*Levels(data, styles, displayMode, path, viewId, parentViewId, levels):
  1. data と path からスライスを取得        ← ビュー固有
  2. スライスが空なら早期リターン            ← ビュー固有
  3. 子ノード一覧を取得                     ← ビュー固有
  ──────────────────────────────────────────
  4. ドリル可能な子を判定                    ← 共通化可能（HierarchyNode 導入後）
  5. 子ノードから childLevelLinks を構築     ← 共通
  6. スライスをレンダリング (SVG文字列)      ← ビュー固有（鳥瞰図 vs 樹形図）
  7. SVG を分解してビュー要素を levels に追加 ← 共通
  8. ドリル可能な子ノードに対して再帰呼び出し ← 共通
```

具体的な差異:

| ステップ | System | Org |
|---|---|---|
| スライス取得 | `extractView(systems, path)` | `extractOrgView(organizations, path)` |
| 空チェック | `childNodes.length === 0 && containerNode === null` | `focusedTeam === null && currentTeams.length === 0` |
| 子ノード一覧 | `viewSlice.childNodes` | `currentTeams`（`focusedTeam` 分岐あり）|
| ドリル可能判定 | `child.children.length > 0` | `t.teams.length > 0 \|\| t.members.length > 0` |
| レンダリング | `render(slice, styles, undefined, ownerIndex, displayMode, childLinks)` | `renderOrgView(slice, styles, displayMode, childLinks)` |

## 制約・前提

- **過剰抽象化の回避**: アダプタインターフェースが除去する重複より複雑になるなら見送る（Issue #226 の明示指示）
- TypeScript の型安全性を維持する
- `ownerIndex` は system ビュー専用の概念（org ビューのレンダリングには不要）。コールバック内にクロージャとして閉じ込める

## 検討した選択肢

### 案1: `HierarchyAdapter` クラスインターフェース

```typescript
interface HierarchyAdapter {
  getSlice(path: string[]): unknown;
  hasContent(slice: unknown): boolean;
  getDrillableChildren(slice: unknown): Array<{ id: string }>;
  render(slice: unknown, childLinks: Map<string, string>): string;
}
```

**メリット**: アルゴリズムが1か所に集約される。第3のビュー種別にも拡張しやすい。

**デメリット**: `unknown` 型で型安全性が下がる。ジェネリクスにすると型推論が複雑化する。インターフェース定義 + 2つのアダプタ実装で、除去する重複（~30行）とほぼ同等の行数が増える。

### 案2: 関数パラメータ（高階関数 / ジェネリクス）

```typescript
interface DrillDownCallbacks<S> {
  getSlice: (path: string[]) => S;
  hasContent: (slice: S) => boolean;
  getDrillableChildren: (slice: S) => Array<{ id: string }>;
  render: (slice: S, childLinks: Map<string, string>) => string;
}
```

**メリット**: 記述が軽量。ジェネリクスで型安全。

**デメリット**: ドリル可能判定がコールバック側に分散し、ビュー間で重複する可能性がある。

### 案3: 重複を維持する（現状）

**メリット**: リスクゼロ。各関数の引数シグネチャが明確。

**デメリット**: バグ修正・ロジック変更の2重適用コスト。

### 案4: `HierarchyNode` 型導入 + 高階関数（採用案）

`TeamNode` の `teams` / `members` を `children: OrgNode[]` に統一し、system ノードと共通の `HierarchyNode` 型を導入する。ドリルダウン骨格はこの型を活用しつつ、ビュー固有の処理はコールバックで吸収する。

#### `HierarchyNode` 型

```typescript
interface HierarchyNode {
  id: string;
  label?: string;
  children: HierarchyNode[];
}
```

TypeScript の構造的型付けにより、既存の型は定義変更なしでこれを満たす:

| 型 | 満たすか | 備考 |
|---|---|---|
| `SystemNode` | そのまま満たす | `children: KrsNode[]` を持つ |
| `TeamNode`（統一後） | 統一後に満たす | `children: OrgNode[]` に変更 |
| `MemberNode` | 不要 | リーフノード（ドリルダウン対象外） |

#### TeamNode の変更

```typescript
// Before
interface TeamNode {
  teams: TeamNode[];
  members: MemberNode[];
  // ...
}

// After
type OrgNode = TeamNode | MemberNode;

interface TeamNode {
  children: OrgNode[];  // サブチームとメンバーが混在
  // ...
}
```

これにより:
- **ドリル可能判定が統一**: `child.children.length > 0`（system と同じ）
- **樹形図の走査が単純化**: `children` を1本でイテレート、`kind` で描き分け
- **2-layer drill-down**: `children` のうち team をリンク化するだけ

#### ドリルダウン骨格

`HierarchyNode` により、ドリル可能判定を共通関数側で行える:

```typescript
interface DrillDownCallbacks<S> {
  getSlice: (path: string[]) => S;
  hasContent: (slice: S) => boolean;
  getChildren: (slice: S) => HierarchyNode[];  // getDrillableChildren ではなく全子ノード
  render: (slice: S, childLinks: Map<string, string>) => string;
}

function collectDrillDownLevelsGeneric<S>(
  callbacks: DrillDownCallbacks<S>,
  path: string[],
  viewId: string,
  parentViewId: string | null,
  levels: string[],
): void {
  const slice = callbacks.getSlice(path);
  if (!callbacks.hasContent(slice)) return;

  const children = callbacks.getChildren(slice);
  const drillable = children.filter(c => c.children.length > 0);  // ← HierarchyNode で共通化
  const childLevelLinks = new Map(
    drillable.map((c) => [c.id, `krs-view-${sanitizeId(c.id)}`]),
  );

  const svg = callbacks.render(slice, childLevelLinks);
  const { viewBox, innerContent } = extractSvgParts(svg);
  const backButton = parentViewId !== null ? renderBackButton(parentViewId) : "";
  const innerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%">${backButton}${innerContent}</svg>`;
  levels.push(`<g id="krs-view-${viewId}" class="krs-view">${innerSvg}</g>`);

  for (const child of drillable) {
    collectDrillDownLevelsGeneric(
      callbacks,
      [...path, child.id],
      sanitizeId(child.id),
      viewId,
      levels,
    );
  }
}
```

呼び出し側（system）:

```typescript
collectDrillDownLevelsGeneric(
  {
    getSlice: (path) => extractView(systems, path),
    hasContent: (slice) => slice.childNodes.length > 0 || slice.containerNode !== null,
    getChildren: (slice) => slice.childNodes,
    render: (slice, childLinks) => render(slice, styles, undefined, ownerIndex, displayMode, childLinks),
  },
  [], "root", null, levels,
);
```

呼び出し側（org）:

```typescript
collectDrillDownLevelsGeneric(
  {
    getSlice: (path) => extractOrgView(organizations, path),
    hasContent: (slice) => slice.focusedTeam !== null || slice.teams.length > 0,
    getChildren: (slice) => {
      const teams = slice.focusedTeam !== null ? slice.focusedTeam.teams : slice.teams;
      return teams;  // TeamNode は HierarchyNode を満たす（children 統一後）
    },
    render: (slice, childLinks) => renderOrgView(slice, styles, displayMode, childLinks),
  },
  [], "root", null, levels,
);
```

**メリット**:
- ドリル可能判定（`children.length > 0`）が共通関数側に統一され、コールバックの責務が減る
- `HierarchyNode` 型が system/org 双方のノード構造を統一的に表現する
- `TeamNode.children` 統一により、樹形図の走査・2-layer drill-down がシンプルになる
- `ownerIndex` 等のビュー固有情報はコールバックのクロージャに閉じ込まる

**デメリット**:
- `TeamNode` の AST 変更（`teams`/`members` → `children`）がパーサー、org レンダラー、テスト全般に波及する
- 2段階の作業が必要（AST 変更 → drill-down 統合）

## 比較

| 観点 | 案1（interface） | 案2（高階関数） | 案3（現状維持） | 案4（HierarchyNode + 高階関数） |
|---|---|---|---|---|
| 行数削減 | △ ほぼ±0 | △ ほぼ±0 | — | ○ ドリル判定も共通化 |
| 型安全性 | △ unknown | ○ ジェネリクス | ◎ そのまま | ◎ 構造的型付け |
| 可読性 | △ 抽象レイヤー | △ コールバック群 | ◎ そのまま | ○ コールバック減 |
| 拡張性 | ○ | ○ | △ | ◎ 共通型があり最も自然 |
| 実装コスト | 中 | 小 | なし | 中（AST変更含む） |

## 現時点の方針

**案4（`HierarchyNode` 型導入 + 高階関数）を採用**。理由:

1. `TeamNode.children` 統一により、system/org 双方で `children.length > 0` のドリル可能判定が共通化される
2. `HierarchyNode` は構造的型付けで既存型が自然に満たすため、複雑な型階層の導入が不要
3. 高階関数 + クロージャにより、`ownerIndex`（system 専用）やレンダリング方式（鳥瞰図 vs 樹形図）の差異を自然に吸収できる
4. `Full View` 側の収集関数にも同じパターンを将来的に適用できる

## 実装の進め方

依存関係から2段階に分ける:

### Phase 1: `TeamNode` AST 統合（新 Issue）

1. `TeamNode.teams` / `TeamNode.members` → `TeamNode.children: OrgNode[]` に統合
2. `HierarchyNode` インターフェースを `types/ast.ts` に定義
3. パーサー・`extractOrgView`・`renderOrgView`・テストを修正

### Phase 2: drill-down 骨格統合（#226）

1. `collectDrillDownLevelsGeneric<S>` を実装
2. `buildDrillDownSvg` / `buildDrillDownSvgOrg` からコールバックで呼び出し
3. 旧 `collectDrillDownLevels` / `collectDrillDownOrgLevels` を削除
4. テストで動作を検証

## 未解決の問い

- `Full View` 側の収集関数（`collectFullViewLevels`, `collectOrgFullViewLevels`）も同様のパターンで統合するか → Phase 2 の実装後に判断
- `OrgNode`（`TeamNode | MemberNode`）の実行時判別方法（discriminated union の `kind` プロパティ、構造の差による判別など）→ Phase 1 で決定
