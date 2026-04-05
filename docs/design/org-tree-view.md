# Org ツリービュー

- **日付**: 2026-04-04
- **ステータス**: 提案
- **関連**: [Issue #309](https://github.com/kompiro/karasu/issues/309)

## 目的

Org タブに「Tree View」モードを追加し、組織階層を左→右のツリー図として一画面で俯瞰できるようにする。
現在のドリルダウン（グリッド）方式を置き換えるのではなく、ツールバーのトグルで切り替える。

## 完成イメージ

```
CTO ──── Engineering ──── Backend  ──── [Alice][Bob ]
     │                │            └── [Carol]
     │                └── Frontend ──── [Dave ][Eve ]
     └── Product ──── Design      ──── [Frank][Grace]
                                   └── [Hiro ]
```

- チームノードをクリック → メンバーがリーフノードとして右に展開
- サブチームとメンバーの両方を持つチーム → サブチームが先に並び、メンバーグリッドがその下
- 複数チームを同時展開可能

## レイアウトアルゴリズム

### 基本方針

再帰的な左→右ツリー配置。各ノードは以下の座標で固定される：

```
x = 親チームの右端 + HORIZONTAL_GAP
y = サブツリーの中央
```

### サブツリー高さの計算

```
subtreeHeight(team, expandedIds):
  if team has no children AND members not expanded:
    return TEAM_CARD_HEIGHT

  childrenHeight = 0
  for each subTeam in team.subTeams:
    childrenHeight += subtreeHeight(subTeam, expandedIds)
    childrenHeight += VERTICAL_GAP

  if team.id in expandedIds AND team has members:
    memberGridHeight = ceil(members.length / 3) * MEMBER_CARD_HEIGHT
                     + (ceil(members.length / 3) - 1) * MEMBER_GAP
    childrenHeight += memberGridHeight + VERTICAL_GAP

  return max(TEAM_CARD_HEIGHT, childrenHeight - VERTICAL_GAP)
```

### ノード配置

ルートから post-order でサブツリー高さを計算し、
pre-order で各ノードの (x, y) 座標を確定する。
親チームカードは子ノード群の垂直中央に配置する。

## SVG 構造

### チームノード

```xml
<g class="org-tree-team" data-team-id="backend">
  <rect class="team-card" ... />
  <text class="team-label">Backend</text>
  <text class="team-member-count">3 members</text>
</g>
```

### メンバーリーフノード（展開時）

チームノードと同じ `data-team-id` でグループ化し、展開状態を React が管理する。

```xml
<g class="org-tree-members" data-parent-team-id="backend">
  <!-- 3列グリッド -->
  <g class="member-card" transform="translate(0, 0)">...</g>
  <g class="member-card" transform="translate(MEMBER_W + GAP, 0)">...</g>
  <g class="member-card" transform="translate((MEMBER_W + GAP)*2, 0)">...</g>
</g>
```

### ベジェ曲線コネクタ

親チームカードの右端中央から子ノードの左端中央へ。

```
M parentX+cardWidth, parentCenterY
C midX, parentCenterY, midX, childCenterY
  childX, childCenterY
```

`midX = (parentX + cardWidth + childX) / 2`

## 展開/折りたたみ

### React 側の状態管理

```typescript
// useOrgView.ts に追加
const [expandedTeamIds, setExpandedTeamIds] = useState<Set<string>>(new Set());

function toggleTeamExpand(teamId: string) {
  setExpandedTeamIds(prev => {
    const next = new Set(prev);
    if (next.has(teamId)) next.delete(teamId);
    else next.add(teamId);
    return next;
  });
}
```

### SVG レンダリング

`renderOrgTreeView(organizations, expandedTeamIds)` を呼ぶたびに SVG 全体を再計算する。
展開状態が変わるたびに React が再レンダリングを行う。

### SVG エクスポート

`renderOrgTreeView(organizations, ALL_TEAMS_EXPANDED)` で全チーム展開済みの静的 SVG を生成する。

```typescript
// 全チーム ID を collectAllTeamIds() で収集して渡す
const allIds = collectAllTeamIds(organizations);
const exportSvg = renderOrgTreeView(organizations, new Set(allIds), { forExport: true });
```

`forExport: true` のとき、`data-team-id` 等のインタラクション用属性は省略する。

## 実装計画

### packages/core の変更

1. **`src/renderer/org-tree-renderer.ts`**（新規）
   - `renderOrgTreeView(organizations, expandedTeamIds, options?): string`
   - `collectAllTeamIds(organizations): string[]`
   - レイアウト計算関数群
   - ベジェコネクタ生成関数

2. **`src/renderer/org-tree-renderer.test.ts`**（新規）
   - レイアウト計算の単体テスト
   - SVG 出力の構造テスト（data 属性、コネクタ存在確認等）

3. **`src/index.ts`**（更新）
   - `renderOrgTreeView` と `collectAllTeamIds` をエクスポート

### packages/app の変更

4. **`src/hooks/useOrgView.ts`**（更新）
   - `expandedTeamIds: Set<string>` state 追加
   - `toggleTeamExpand(id: string)` ハンドラ追加
   - `treeViewSvg: string` の算出ロジック追加

5. **`src/components/KarasuPreviewColumn.tsx`**（更新）
   - Org タブに「Tree View」トグルボタン追加（アイコン + ラベル）
   - `onTeamToggle` コールバックを PreviewPane に渡す
   - エクスポートメニューに「Export Org Tree SVG」を追加

6. **`src/components/PreviewPane.tsx`**（更新）
   - `data-team-id` クリックを `onTeamToggle` に委譲

### ドキュメント

7. **`docs/acceptance/0044-org-tree-view.md`**（新規）

## 検討した選択肢

### CSS :target による展開（不採用）

同時展開が1チームのみに限定されるため不採用。
SVG エクスポートで動作する点は魅力だが、UX の制約が大きい。

### 新しい `DisplayMode` として実装（不採用）

既存の `DisplayMode = "shape" | "icon"` はノードの視覚スタイルを表す概念。
ツリー表示はレイアウト構造が根本的に異なるため、独立したトグルとして分離する。

## 未解決の問い

1. **大規模組織**: チーム数・階層が多い場合の SVG サイズ上限をどう扱うか
2. **メンバーカードの情報量**: 名前のみか、ロール（`team` プロパティ）も表示するか

## 確定事項

- **ルートノード**: `organization` ブロック自体は表示せず、トップレベルチームをルートとする。`organization` が複数ある場合はそれぞれのトップレベルチームを独立したツリーとして縦に並べる。
