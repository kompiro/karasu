# AT: Outline ビューをアクティブビューの AST に追従させる

- **日付**: 2026-05-19
- **関連 Issue**: [#1410](https://github.com/kompiro/karasu/issues/1410)
- **対象ファイル**: `packages/app/src/components/OutlineView.tsx`、
  `packages/app/src/components/outline-adapters.ts`、
  `packages/app/src/components/AppShell.tsx`、
  `packages/core/src/index.ts`（`DeployCompileResult.deployTree`）

## 受け入れ条件

`packages/app/src/components/outline-adapters.test.ts` と
`packages/app/src/components/OutlineView.test.tsx` でカバーされる。

- [x] system AST が `OutlineNode` ツリーに変換される（id/label/kind/children を保持）

  > ✅ Automated — `outline-adapters.test.ts` › `toSystemOutline`

- [x] org AST が organization → team → member の `OutlineNode` ツリーに変換される

  > ✅ Automated — `outline-adapters.test.ts` › `toOrgOutline`

- [x] deploy AST が全ブロックをトップレベル、配下にノードを持つツリーに変換される

  > ✅ Automated — `outline-adapters.test.ts` › `toDeployOutline`

- [x] `OutlineView` が `OutlineNode` ツリーを再帰描画し、deploy/org の kind はグリフにフォールバックする

  > ✅ Automated — `OutlineView.test.tsx` › `renders deploy and org node kinds with a glyph fallback`

- [x] Outline ノードのシングルクリックで `onSelectNode`、ダブルクリックで `onActivateNode`（祖先チェーン付き）が呼ばれる

  > ✅ Automated — `OutlineView.test.tsx` › `calls onSelectNode ...` / `calls onActivateNode ...`

## 手動確認チェックリスト

`examples/deploy-org/index.krs` を `index.krs` として Preview UI（Project モード）
で開き、サイドバーの Outline ビューを表示して確認する。

- [ ] system ビュー表示中、Outline が system AST（system/service/domain …）を描画する
- [ ] deploy タブに切替えると Outline が deploy ブロックとその配下ノードに変わる
- [ ] org タブに切替えると Outline が organization/team/member に変わる
- [ ] matrix タブ表示中は Outline が system AST のまま
- [ ] deploy ビューで Outline のノードをクリックするとプレビュー上で同じノードが
  ハイライトされる
- [ ] org ビューで Outline のチームをダブルクリックするとそのチームに drill-down する
- [ ] deploy ビューで別ブロックのノードをダブルクリックすると、その deploy
  ブロックがプレビューに表示される（`selectedDeployBlockId` が切替わる）
