# AT: App サイドバーの AST Outline ビュー

- **日付**: 2026-05-18
- **関連 Issue**: [#1408](https://github.com/kompiro/karasu/issues/1408)
- **対象ファイル**: `packages/app/src/components/OutlineView.tsx`、`packages/app/src/components/EditArea.tsx`

## 受け入れ条件

`packages/app/src/components/OutlineView.test.tsx` および
`packages/app/src/components/EditArea.test.tsx` でカバーされる。

- [x] Outline が systems とその入れ子の子ノードを再帰的に描画する

  > ✅ Automated — `packages/app/src/components/OutlineView.test.tsx` › `recursively renders systems and their nested children`

- [x] 構造が無いとき空メッセージを表示する

  > ✅ Automated — `packages/app/src/components/OutlineView.test.tsx` › `shows an empty message when there is no structure`

- [x] Outline エントリのクリックで `onSelectNode` がノード id 付きで呼ばれる

  > ✅ Automated — `packages/app/src/components/OutlineView.test.tsx` › `calls onSelectNode with the node id on a single click`

- [x] Outline エントリのダブルクリックで `onActivateNode` がノード id と祖先チェーン付きで呼ばれる

  > ✅ Automated — `packages/app/src/components/OutlineView.test.tsx` › `calls onActivateNode with the node id and ancestor chain on a double click`

- [x] highlighted ノードに selected スタイルが当たる

  > ✅ Automated — `packages/app/src/components/OutlineView.test.tsx` › `marks the highlighted node as selected`

- [x] label があれば id より label を表示する

  > ✅ Automated — `packages/app/src/components/OutlineView.test.tsx` › `prefers the label over the id when present`

- [x] ActivityBar の Outline ボタンでサイドバーが Outline ビューに切り替わる

  > ✅ Automated — `packages/app/src/components/EditArea.test.tsx` › `renders the Outline button and switches the sidebar to the outline view`

- [x] アクティブなビューのボタン再クリックでサイドバーが折りたたみ/再展開する（Files / Outline 両方）

  > ✅ Automated — `packages/app/src/components/EditArea.test.tsx` › `collapses and re-expands the sidebar when the active view button is re-clicked`

- [x] 折りたたみ中に非アクティブなボタンをクリックするとサイドバーが展開される

  > ✅ Automated — `packages/app/src/components/EditArea.test.tsx` › `expands the sidebar when switching views while collapsed`

## 手動確認チェックリスト

`examples/ja/getting-started/index.krs` を Preview UI（Project モード）で開いて確認する。

### ActivityBar とビュー切り替え

- [ ] ActivityBar に「Files」「Outline」の 2 ボタンが縦に並ぶ
- [ ] Outline ボタンを押すとサイドバーが AST ツリー表示に切り替わる
- [ ] アクティブなボタンを再度押すとサイドバーが折りたたまれ、もう一度押すと開く
- [ ] FileTree ヘッダーから「Files」テキストが消え、`⇄ Paste` / `+File` / `+Dir` ボタンは残っている

### Outline の内容と更新

- [ ] Outline が現在のドキュメントの system / 入れ子の component を階層表示する
- [ ] エディタでノードを追加・削除すると Outline が追従して更新される
- [ ] 各ノードのアイコンが Preview の Icon Mode で表示されるピクトグラムと一致する（system はアイコンが無く glyph 表示）

### ノード選択とハイライト

- [ ] Outline ノードをシングルクリックすると、現在の viewPath 内に描画されていればプレビューの該当ノードがハイライトされる
- [ ] Outline ノードをダブルクリックすると、プレビューが drill-down してから該当ノードがハイライトされる
- [ ] service / domain / infra ノードのダブルクリックでそのノードの中（子の図）に潜る
- [ ] usecase / resource など leaf ノードのダブルクリックで、`viewPath` を持つ最も近い祖先の図に移動し leaf がハイライトされる
- [ ] deploy / org ビュー表示中に Outline ノードを操作すると system ビューに切り替わる
