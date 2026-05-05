---
type: product
---

# AT-1108: Reposition sidebar collapse button to file tree header (GitHub-style)

- **日付**: 2026-05-05
- **関連 Issue**: [#1108](https://github.com/kompiro/karasu/issues/1108)
- **対象ファイル**:
  - `packages/app/src/styles/app.css`

## 受け入れ条件

- [x] AT-A: `EditArea` に `sidebarContent` を渡すと collapse トグルボタンが描画される（既存テストで担保）
  > ✅ Automated — `EditArea.test.tsx` › `renders sidebar area with toggle button when sidebarContent is provided`

- [x] AT-B: トグルボタン押下で `.sidebar-collapsed` クラスが付与され、再押下で外れる（既存テストで担保）
  > ✅ Automated — `EditArea.test.tsx` › `toggle button collapses/expands sidebar`

- [x] AT-C: `previewFocused` のときはトグルボタンが描画されない（既存テストで担保）
  > ✅ Automated — `EditArea.test.tsx` › `hides toggle button when previewFocused is true`

- [ ] AT-D（manual）: app preview を起動して、collapse ボタンがファイルツリーヘッダーの左上（GitHub の file tree と同じ位置）に表示されることを目視確認する
  > 🧑 Manual — preview で確認

- [ ] AT-E（manual）: collapse 状態で expand ボタンが edit-area の左上に残り、押下するとサイドバーが復元することを目視確認する
  > 🧑 Manual — preview で確認

- [ ] AT-F（manual）: ボタンがアイコン + テキストラベル（`« Collapse` / `» Expand`）を保持していることを目視確認する（toolbar button rule, ADR 0007）
  > 🧑 Manual — preview で確認

## 補足

スコープは CSS による位置・スタイル調整のみ。React コンポーネント構造、トグル状態、aria-label は変更しない。
