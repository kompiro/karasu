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

- [ ] AT-D（manual）: app preview で collapse ボタン（`« Hide`）がファイルツリーヘッダーの左端に表示されることを目視確認する
  > 🧑 Manual — preview で確認

- [ ] AT-E（manual）: collapse 状態でサイドバー領域が薄いガター（8px）になり、エディタを覆い隠さないことを目視確認する
  > 🧑 Manual — preview で確認

- [ ] AT-F（manual）: collapsed gutter をクリックでサイドバーが再展開することを目視確認する
  > 🧑 Manual — preview で確認

- [ ] AT-G（manual）: サイドバー右端の resize handle をドラッグして幅を変更でき、180–480px の範囲でクランプされることを目視確認する
  > 🧑 Manual — preview で確認

- [ ] AT-H（manual）: resize handle をダブルクリックで既定幅（210px）に戻ることを目視確認する
  > 🧑 Manual — preview で確認

- [ ] AT-I（manual）: ページリロード後も直前のサイドバー幅が `localStorage` から復元されることを目視確認する
  > 🧑 Manual — preview で確認

## 補足

- スコープは collapse トグルの位置調整・collapsed 時のガター UI・サイドバー幅のドラッグリサイズ。
- 幅は `localStorage` キー `karasu:sidebar:width` に保存。
- 幅の上下限: 180px / 480px。既定値: 210px。
