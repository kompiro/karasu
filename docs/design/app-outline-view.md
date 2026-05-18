# App サイドバーに AST Outline ビューを追加する

- **日付**: 2026-05-18
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1408](https://github.com/kompiro/karasu/issues/1408) — Add an AST Outline view to the App sidebar
  - フォローアップ Issue: [#1410](https://github.com/kompiro/karasu/issues/1410) — deploy/org 表示時に Outline を対応 AST に切り替える
  - 関連 TPL:
    - [TPL-20260518-01](../test-perspectives/TPL-20260518-01-involutive-toggle-renders-both-states.md) — involutive な toggle は両方の結果状態を検証する
    - [TPL-20260516-01](../test-perspectives/TPL-20260516-01-control-a11y-contract-survives-migration.md) — interactive control の a11y 契約
    - [TPL-20260510-20](../test-perspectives/TPL-20260510-20-id-not-label-for-identity.md) — 同一性には label でなく id を使う
  - コード: `packages/app/src/components/EditArea.tsx`、`packages/app/src/components/AppShell.tsx`、`packages/app/src/components/file-tree/FileTreeView.tsx`

## 背景・課題

App のサイドバーはプロジェクトのファイルシステム（FileTree）を表示するが、
`.krs` ドキュメントの **構造的な形** — system / 入れ子の component / relation —
を一覧する手段がない。大きな図ほど「どんなノードがあるか」を把握しづらい。

解決済みの AST（`SystemNode[]`）はすでに `useAppViews` の
`views.system.resolvedSystems` として利用可能で、プレビューの
`highlightedNodeId` 機構もある。これらを使い、ナビゲート可能なツリー型の
Outline をサイドバーに追加する。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| ActivityBar | `EditArea.tsx` 内に 1 ボタン（"Files"）のみ。`sidebarCollapsed` を toggle するだけ |
| サイドバー本体 | `EditArea` が `sidebarContent`（= FileTree）を 1 つだけ受け取り、`sidebarCollapsed` で表示/非表示 |
| FileTree | `FileTreeView.tsx`。ヘッダーに `Files` テキストラベル + `⇄ Paste` / `+File` / `+Dir` ボタン |
| AST | `useAppViews` の `views.system.resolvedSystems: SystemNode[]`（解決済み AST） |
| ハイライト | `app-reducer` の `SET_HIGHLIGHTED_NODE` action → `highlightedNodeId` |

## 制約・前提

- ActivityBar のボタンは icon + text label 必須（ADR-20260328 / `.claude/rules/app-ui.md`）。`aria-pressed` / `aria-label` を持つ。
- Outline は presentational なツリーコンポーネントとし、`FileTreeView` のパターンに倣う（再帰描画）。
- ノードの同一性は `SystemNode.id` で扱う（label ではない — TPL-20260510-20）。
- Out of scope: Outline からのノード編集（rename / 追加 / 削除）。今回は閲覧 + ハイライトのみ。

## 現時点の方針

ActivityBar を「単一の collapse toggle」から「複数ビューを切り替える VS Code 型
の activity bar」に拡張する。

### サイドバーの挙動

- ActivityBar に **"Files"** と **"Outline"** の 2 ボタンを置く。
- サイドバーは `sidebarView`（`"files" | "outline"`）で表す **現在アクティブな
  1 ビュー** を表示する。
- **アクティブなボタンを再クリック** → `sidebarCollapsed` を toggle（開く/閉じる）。
- **非アクティブなボタンをクリック** → `sidebarView` をそのビューに切り替える。
  そのとき折りたたみ中なら展開する（`sidebarCollapsed = false`）。
- `aria-pressed` は「そのビューがアクティブ かつ サイドバー展開中」を表す。
  両ボタンの押下状態は排他。
- FileTreeView ヘッダー内の `Files` テキストラベルを削除する（ビュー名は
  ActivityBar が示すため重複）。`⇄ Paste` / `+File` / `+Dir` ボタンは残す。

### ノード選択時の挙動 — drill-down + ハイライト

`highlightedNodeId` のハイライトは **現在描画中の SVG に対する視覚効果のみ**
で、`viewPath` を自動変更しない（`PreviewPane.tsx` の `useEffect` が
`querySelector` で現 SVG を引くだけ）。Outline は AST の入れ子をすべて見せる
ため、現 `viewPath` に無い深いノードを選ぶと「ハイライトのみ」では静かに失敗
する。

そこで Outline のノード選択は、既存のクロスナビ（`useCrossNavigation` の
org→system）と同じ作法で **対象ノードを表示する `viewPath` へ移動してから
ハイライト** する:

- `views.system.nodeMetadata.get(nodeId)?.viewPath` でそのノードを露出させる
  `viewPath` を引く（既存の drill-down が使っているのと同じ index）。
- `activeView` が `system` 以外（`deploy` / `org` / `matrix`）のときは
  `SET_ACTIVE_VIEW { activeView: "system", highlightNodeId }` で system ビュー
  に切り替えてから `navigateViewPath` で移動する。
- 本 PR では Outline は **常に system AST** を表示する。`deploy` / `org`
  表示中に Outline を対応 AST へ切り替えるのはフォローアップ #1410。`matrix`
  は system AST を出すのが正しい（matrix は system モデルの派生）。

### 実装の指針

1. `EditArea.tsx`:
   - `sidebarView` state（`"files" | "outline"`）を追加。`sidebarContent` 1 つを
     受け取る代わりに `filesContent` と `outlineContent`（または `sidebarViews`
     map）を受け取り、`sidebarView` に応じて表示する。
   - ActivityBar に Outline ボタンを追加。クリックハンドラは
     「アクティブなら collapse toggle / 非アクティブなら切り替え + 展開」。
   - Files ボタンも同じハンドラ規則に統一する。
2. 新規 `packages/app/src/components/OutlineView.tsx`:
   - props: `systems: SystemNode[]`、`highlightedNodeId: string | null`、
     `onSelectNode: (nodeId: string) => void`。
   - `SystemNode` とその `children` を再帰描画する presentational ツリー。
     `FileTreeView` の構造（ヘッダー + content + 再帰 item）に倣う。
   - ノードクリックで `onSelectNode(node.id)`。`highlightedNodeId` と一致する
     item に selected スタイルを当てる。
3. `AppShell.tsx`:
   - `OutlineView` を生成し、`views.system.resolvedSystems` を渡す。
   - `onSelectNode` ハンドラ:
     - `activeView !== "system"` なら `SET_ACTIVE_VIEW { activeView: "system",
       highlightNodeId: nodeId }`、そうでなければ
       `SET_HIGHLIGHTED_NODE { nodeId }`。
     - `views.system.nodeMetadata.get(nodeId)?.viewPath` があれば
       `navigateViewPath` で移動する。
   - `EditArea` に files / outline 両ビューを渡す。
4. `app.css`: ActivityBar に複数ボタンが並ぶスタイル、Outline ツリーのスタイル
   を追加。
5. AT: `docs/acceptance/` に新規ファイル。TC は:
   - サイドバー展開時、Outline ボタンで Files ↔ Outline が切り替わる。
   - アクティブボタン再クリックでサイドバーが折りたたみ/展開する（両ビューで）。
   - Outline が現在のドキュメントの AST を反映し、ドキュメント変更で更新される。
   - 現 `viewPath` 内の Outline ノード選択でプレビューの該当ノードがハイライトされる。
   - 現 `viewPath` 外（深くネストした）Outline ノード選択で、プレビューが
     drill-down してから該当ノードをハイライトする。
6. ADR 昇格: 実装完了後 `docs/adr/YYYYMMDD-NN-app-outline-view.md` として
   昇格し、本 Design Doc は同 PR で削除する。

### TPL 上の注意

- ActivityBar のボタンは「再クリックで開閉が反転する」involutive toggle を
  含む。TPL-20260518-01 に従い、**Files / Outline 双方で「開く」「閉じる」両
  結果状態**がレンダリングまで到達することを検証する（reducer 単体テストだけ
  で済ませない）。
- ボタン追加・FileTreeView ヘッダー改変は a11y 契約に触れる。TPL-20260516-01
  に従い、`aria-pressed` / `aria-label` / 可視ラベルが両ボタンで正しいことを
  明示的に点検する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: ActivityBar の見た目が変わる（ボタン 2 個）。FileTree
  ヘッダーから `Files` 文字が消える。機能的後退はなし。
- ドキュメント更新: なし（spec 変更を伴わない UI 機能）。
- テスト・examples への影響: `EditArea` の props 形状が変わるため既存
  コンポーネントテストの更新が必要。examples への影響なし。

## 決めないこと（意図的なスコープ外）

- Outline からのノード編集（CRUD: rename / 追加 / 削除）は今回行わない。
  将来の拡張余地として残す。
- `deploy` / `org` 表示時に Outline をその AST へ切り替えるのは本 PR で行わず、
  フォローアップ #1410 に切り出す。本 PR の Outline は常に system AST を表示する。
