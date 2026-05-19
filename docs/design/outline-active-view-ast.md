# Outline ビューをアクティブビューの AST に追従させる

- **日付**: 2026-05-19
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1410](https://github.com/kompiro/karasu/issues/1410)
  - 関連 ADR: [ADR-20260519-01](../adr/20260519-01-app-outline-view.md) — Outline ビューの導入
  - 関連 TPL:
    - [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md) — 同一モデルを複数サーフェスに出すとき表示は一致させる
    - [TPL-20260510-08](../test-perspectives/TPL-20260510-08-derived-state-staleness.md) — 派生 view の memoization は source state の変化次元すべてを key に含める
    - [TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md) — スコープ付き一覧と drill-down の関係
  - コード: `packages/app/src/components/OutlineView.tsx`、
    `packages/app/src/components/AppShell.tsx`、
    `packages/app/src/hooks/useAppViews.ts`、
    `packages/app/src/hooks/useDeployView.ts`、
    `packages/core/src/index.ts`（`DeployCompileResult`）

## 背景・課題

ADR-20260519-01 で導入した Outline ビューは、常に **system AST**
（`views.system.resolvedSystems: SystemNode[]`）を描画する。プレビューが
deploy / org ビューを表示していても Outline は system ツリーのまま変わらず、
画面に出ている図とサイドバーのツリーが食い違う。

Issue #1410 はこれを「アクティブビューの AST を反映する」ことを求める:

- `activeView === "deploy"` → Outline は deploy AST を描画する
- `activeView === "org"` → Outline は org AST を描画する
- `activeView === "system" | "matrix"` → system AST（現状維持。matrix は
  system モデルから派生するため system AST が正しい）
- ノード選択は、表示中のビュー側で drill-down / ハイライトする

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| `OutlineView` | `systems: SystemNode[]` を受け取り `KrsNode` を再帰描画。`node.kind` で Icon Mode アイコンを引く presentational コンポーネント |
| system AST | `useAppViews` の `views.system.resolvedSystems: SystemNode[]` として公開済み |
| org AST | `views.org.organizations: OrganizationBlock[]` として公開済み。`OrganizationBlock → teams: TeamNode[] → children: OrgNode[]`（`team` \| `member`） |
| deploy AST | **未公開**。`DeployCompileResult` は `deployBlocks: DeployBlockInfo[]`（`{id,label}` のみ）と `nodeMetadata` だけ。解決済みの `DeployBlock[] / DeployNode[]` ツリーを持たない |
| ノード操作 | `handleOutlineSelect`（single click＝ハイライト）と `handleOutlineActivate`（double click＝drill-down）。どちらも `highlightSystemNode` 経由で **常に system ビューへ強制切替** する |
| drill-down 経路 | system は `nodeMetadata.viewPath`、org は `orgPathIndex` / `nodePathIndex`、deploy は `viewPath` drill-down を持たず `selectedDeployBlockId` でブロック単位に切替える（`CompileOptions.viewPath` は deploy では無視される） |
| ハイライト | `highlightedNodeId` を preview と共有。`SET_HIGHLIGHTED_NODE` / `SET_ACTIVE_VIEW` で dispatch |

ノードの構造が3ビューで異なる:

- system: `KrsNode`（`service`/`domain`/`usecase`/`resource`/… 入れ子あり）
- org: `OrganizationBlock`/`TeamNode`/`MemberNode`（入れ子あり）
- deploy: `DeployBlock`/`DeployNode`（`war`/`jar`/`oci`/`lambda`/… **入れ子なし**、ブロック→ノードの2階層）

いずれも `id` / `label` / `children` という構造的共通点（`HierarchyNode`）は持つ。

## 制約・前提

- `OutlineView` は presentational のまま保つ（ADR-20260519-01 の方針）。AST の
  選択とハンドラ配線は `AppShell` 側の責務。
- deploy AST を Outline に出すには **core 側（`DeployCompileResult`）の変更**が
  必要。`deployBlocks: DeployBlockInfo[]` は block selector / NodeDetailPanel が
  `{id,label}` 前提で広く消費しているため、型は変えず**別フィールドを追加**する。
- Outline の source AST は `activeView` に依存する派生 state になる。memoization
  する場合は `activeView` を key に含める（TPL-20260510-08）。
- out of scope: Outline からの CRUD 編集（ADR-20260519-01 同様）。matrix 専用の
  Outline 表現（matrix は system AST のままとする）。

## 検討した選択肢

### 案1: ビューごとに専用 Outline コンポーネント

`SystemOutline` / `DeployOutline` / `OrgOutline` を別々に実装し、`AppShell` が
`activeView` で出し分ける。

**メリット**

- 各コンポーネントが自分のノード型・選択セマンティクスを直に扱える。型キャスト
  や共通化の無理がない。

**デメリット**

- 再帰描画・選択ハイライト・インデント・アイコン枠といった presentational な
  共通要素が3回複製される。ADR-20260519-01 が「presentational な単一
  `OutlineView`」とした方針から外れる。

### 案2: 統一 `OutlineNode` モデル + ビューごとアダプタ（推奨）

presentational な `OutlineView` を、ビュー非依存の統一モデル `OutlineNode`
（`{ id, label, kind, children: OutlineNode[] }`）を描画するように一般化する。
`AppShell` は `activeView` に応じて3つのアダプタのいずれかで source AST を
`OutlineNode[]` に変換して渡す:

- `toSystemOutline(SystemNode[])` — 既存挙動。`kind` はそのまま
- `toOrgOutline(OrganizationBlock[])` — `organization`/`team`/`member` を `kind` に
- `toDeployOutline(resolved deploy blocks)` — `deploy-block` と各 `DeployNodeKind`

`OutlineView` のアイコン表（`KIND_ICON_NAME` / `KIND_GLYPH`）に deploy / org の
`kind` を追加する。選択ハンドラ（`onSelectNode` / `onActivateNode`）はビュー
ごとに `AppShell` で配線する。

**メリット**

- presentational な再帰描画ロジックは1か所のまま。ADR-20260519-01 の方針を維持。
- ビュー固有の知識（drill-down 経路・ブロック選択）はアダプタとハンドラに
  局所化される。
- 将来ビューが増えてもアダプタを1つ足すだけ。

**デメリット**

- `OutlineNode` という中間モデルが1段増える。`kind` が3ビュー分の union に
  広がる。

## 比較

| 観点 | 案1（専用×3） | 案2（統一モデル＋アダプタ） |
| --- | --- | --- |
| presentational コードの重複 | 3コピー | 1か所 |
| ADR-20260519-01 との整合 | 外れる | 維持 |
| ビュー固有ロジックの所在 | 各コンポーネント | アダプタ + AppShell ハンドラ |
| 中間モデル | 不要 | `OutlineNode` が1段増える |
| ビュー追加時のコスト | コンポーネント1つ | アダプタ1つ |

## 現時点の方針

**案2 を採用する** — presentational な `OutlineView` を単一に保つ ADR-20260519-01
の方針を崩さずに3ビューへ拡張でき、ビュー固有の差分（ノード型・drill-down
経路・deploy のブロック選択）をアダプタとハンドラに閉じ込められるため。

### 実装の指針

1. **core**: `DeployCompileResult` に解決済み deploy ツリーを表す新フィールドを
   追加する（例 `deployBlockTree: DeployBlock[]`、または app が必要とする
   `{id,label,kind}` のみの軽量型）。`compileProject(diagramType:"deploy")` は
   レンダリングのため内部で既にブロックとノードを解決しているので、それを
   結果に載せるだけ。既存 `deployBlocks: DeployBlockInfo[]` は変更しない。
2. **useDeployView / useAppViews**: 新フィールドを `DeployViewBundle` に通す。
3. **OutlineView**: props を `systems: SystemNode[]` から
   `nodes: OutlineNode[]` に一般化する。`OutlineNode = { id, label, kind,
   children }`。`KIND_ICON_NAME` / `KIND_GLYPH` に org（`team` など）・deploy
   （`DeployNodeKind`）の項目を追加する。
4. **アダプタ**: `toSystemOutline` / `toOrgOutline` / `toDeployOutline` を
   新規追加（純関数、`packages/app/src/components/` か `hooks/` 配下）。
5. **AppShell**: `activeView` で source AST とアダプタを選び `OutlineNode[]` を
   `OutlineView` に渡す。`activeView` を memo key に含める（TPL-20260510-08）。
   `handleOutlineSelect` / `handleOutlineActivate` をビュー別に配線する:
   - system / matrix: 現状の `highlightSystemNode` 経路（matrix では system に
     切替）
   - org: `SET_HIGHLIGHTED_NODE`、drill-down は `orgPathIndex`
   - deploy: `SET_HIGHLIGHTED_NODE`、activate は対象ノードの属する block を
     `selectedDeployBlockId` に切替。Outline は全 deploy ブロックを
     トップレベルに並べる（ブロック→ノードの2階層）
6. AT: `docs/acceptance/1410-outline-active-view.md` を新規作成。TC は:
   - deploy ビュー表示中、Outline が deploy ブロック/ノードを描画する
   - org ビュー表示中、Outline が organization/team/member を描画する
   - system / matrix ビューでは Outline が system AST のまま
   - `activeView` を切替えると Outline の内容が連動して変わる（TPL-20260510-08）
   - 各ビューで Outline ノードのハイライトがプレビューと一致する（TPL-20260510-06）
7. ADR 昇格: 実装完了後 `docs/adr/20260519-NN-outline-active-view-ast.md` として
   昇格し、本 Design Doc を同 PR で削除する。ADR-20260519-01 に follow-up として
   `related_to` リンクする。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: Outline の表示がアクティブビューに追従するようになる
  （改善方向の挙動変更のみ）。
- core API: `DeployCompileResult` にフィールド**追加**のみ。既存 consumer は無影響。
- ドキュメント更新: ADR-20260519-01 の follow-up として新 ADR。`docs/spec/` の
  変更は不要（UI 挙動のみ、構文・スタイル仕様に変更なし）。
- テスト・examples への影響: `OutlineView` の props 変更に伴い既存
  `OutlineView.test.tsx` を新 props（`nodes`）へ追従させる。examples は変更不要。

## 決定済みの論点

1. **deploy で複数ブロックをどう出すか** → **全ブロックをトップレベルに並べる**。
   Outline は「何があるか」の俯瞰が役割（TPL-20260510-21）。別ブロックのノードを
   activate したら `selectedDeployBlockId` をそのブロックに切替える。
2. **deploy / org プレビューが `highlightedNodeId` ハイライトに対応済みか** →
   **対応済み**。`PreviewColumn` は `activeView` ごとに deploy / org / system の
   `highlightedNodeId` を配線済みで、`PreviewPane` は SVG の `data-node-id` /
   `data-container-id` でノードを解決する。Outline のハイライト連動は本 Issue
   のスコープに含めてよい。
