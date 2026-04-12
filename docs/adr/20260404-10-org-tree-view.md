# ADR-20260404-10: Org Tree View — 組織階層の左→右ツリー俯瞰図

- **日付**: 2026-04-04（更新: 2026-04-05）
- **ステータス**: 決定済み
- **関連**: Issue #309, Issue #320, [ADR-20260323-03](20260323-03-organization-diagram.md)

## 背景

Org タブのドリルダウン（グリッド）方式では一画面で組織全体を俯瞰できず、CTO → Engineering → Backend → メンバー といった階層を追うたびに画面遷移が必要だった。`organization` / `team` / `member` ブロック自体は ADR-20260323-03 で実装済みで、これを左→右のツリー図として 1 画面に展開できる Tree View モードが求められた。

## 決定

Org タブに **Tree View モード**をツールバートグルで追加する。ドリルダウン方式を置き換えるのではなく、併存させる。

### レイアウトアルゴリズム

再帰的な左→右ツリー配置：

```
x = 親チームの右端 + HORIZONTAL_GAP
y = サブツリーの中央
```

サブツリー高さは post-order で計算し、pre-order で各ノードの `(x, y)` 座標を確定する。親チームカードは子ノード群の垂直中央に配置する。

### ノード構造

- **チームノード**: `<g class="org-tree-team" data-team-id="backend">` + `team-card` / `team-label` / `team-member-count`
- **メンバーリーフ**: 展開時に `<g class="org-tree-members" data-parent-team-id="...">` で 3 列グリッド表示
- **コネクタ**: 親カードの右端中央から子の左端中央へベジェ曲線 (`M ... C ... `)

### 展開/折りたたみ

React 側で `expandedTeamIds: Set<string>` を `useOrgView` に追加し、`renderOrgTreeView(organizations, expandedTeamIds)` を呼ぶたびに SVG 全体を再計算する。**複数チームを同時に展開可能**。

### SVG エクスポート

`renderOrgTreeView(organizations, ALL_TEAMS_EXPANDED, { forExport: true })` で全チーム展開済みの静的 SVG を生成する。`forExport: true` のとき `data-team-id` 等のインタラクション用属性は省略する。

### Phase 1 / Phase 2

- **Phase 1 (#309)**: `src/renderer/org-tree-renderer.ts` 新設、`useOrgView` / `KarasuPreviewColumn` にトグル追加
- **Phase 2 (#320)**: `.krs.style` のセレクタ `team` / `member` / `#NodeId` を Tree View にも適用。`RenderOrgTreeOptions` に `styles?: ResolvedStyles` を追加し、`resolveStyles()` が返す `ResolvedStyles` を renderer に渡す

### ルートノードの扱い

`organization` ブロック自体は表示せず、トップレベルチームをルートとする。`organization` が複数ある場合はそれぞれのトップレベルチームを独立したツリーとして縦に並べる。

## 理由

- **一画面俯瞰**: ツリー図で組織全体のネスト構造を一目で把握でき、ドリルダウンの遷移コストが消える
- **ドリルダウンと併存**: 既存のグリッドモードを壊さずトグルで切替できる。慣れたユーザーの体験を妨げない
- **複数同時展開**: CSS `:target`（1 要素のみ対象）では表現できない使い方をサポートするため React state で管理する
- **既存スタイルシステムの再利用**: Phase 2 では `resolveStyles()` が既に `organizations` を受け取って `styles.nodes` を計算するため、renderer に `ResolvedStyles` を渡すだけでカスケードが機能する
- **オプションオブジェクトへの追加**: `RenderOrgTreeOptions` に `styles?` を追加することで既存呼び出しの後方互換性を維持できる（直接引数にすると既存テスト・呼び出し側の全変更が必要）

## 却下した案

### CSS `:target` による展開

SVG エクスポートで動作する利点はあるが、**同時展開が 1 チームのみ**に限定されるため UX 制約が大きい。

### 新しい `DisplayMode` として実装

既存の `DisplayMode = "shape" | "icon"` はノードの視覚スタイルを表す概念で、Tree View はレイアウト構造が根本的に異なる。独立したトグルとして分離するほうが自然。

## 残課題

- 大規模組織での SVG サイズ上限
- メンバーカードの情報量（名前のみか、ロール / `team` プロパティも表示するか）
