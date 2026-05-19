# AT: Outline view のタグ駆動アイコン variant 解決

- **日付**: 2026-05-19
- **関連 Issue**: [#1415](https://github.com/kompiro/karasu/issues/1415)
- **対象ファイル**: `packages/core/src/builtins/icon-theme.ts`、`packages/app/src/components/OutlineView.tsx`、`packages/app/src/components/outline-adapters.ts`
- **関連 TPL**: [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md)、[TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md)

## 受け入れ条件

`packages/core/src/builtins/icon-theme.test.ts`、
`packages/app/src/components/OutlineView.test.tsx`、
`packages/app/src/components/outline-adapters.test.ts` でカバーされる。

- [x] `iconNameForNode` が base node kind を Icon Mode アイコン名に解決する

  > ✅ Automated — `packages/core/src/builtins/icon-theme.test.ts` › `iconNameForNode` › `resolves base node kinds to their Icon Mode icon`

- [x] `iconNameForNode` が client subtype タグを `client-<tag>` variant に解決する

  > ✅ Automated — `packages/core/src/builtins/icon-theme.test.ts` › `iconNameForNode` › `resolves client subtype tags to the client-<tag> variant`

- [x] `iconNameForNode` が resource variant タグを variant アイコンに解決する

  > ✅ Automated — `packages/core/src/builtins/icon-theme.test.ts` › `iconNameForNode` › `resolves resource variant tags to the variant icon`

- [x] 複数 subtype を持つ client は tag 順で first-match-wins する

  > ✅ Automated — `packages/core/src/builtins/icon-theme.test.ts` › `iconNameForNode` › `uses first-match-wins on tag order for a multi-subtype client`

- [x] Icon Mode アイコンを持たない kind（`system` 等）は `undefined` を返す

  > ✅ Automated — `packages/core/src/builtins/icon-theme.test.ts` › `iconNameForNode` › `returns undefined for kinds without an Icon Mode pictogram`

- [x] Outline が `client[mobile]` ノードに mobile-client ピクトグラムを表示する

  > ✅ Automated — `packages/app/src/components/OutlineView.test.tsx` › `resolves a client subtype tag to the variant pictogram`

- [x] Outline が `resource[table]` ノードに table ピクトグラムを表示する

  > ✅ Automated — `packages/app/src/components/OutlineView.test.tsx` › `resolves a resource variant tag to the variant pictogram`

- [x] adapter が `OutlineNode` に `tags` を引き継ぐ

  > ✅ Automated — `packages/app/src/components/outline-adapters.test.ts` › `toSystemOutline` › `maps a SystemNode tree to OutlineNode, preserving id/label/kind/tags/children`

## 手動確認チェックリスト

`client[mobile]` と `resource[table]` を含む `.krs` を Preview UI で
`index.krs` として開いて確認する。

- [ ] Outline で `client[mobile]` ノードが mobile-client のピクトグラムを表示する（base の `client` アイコンではない）
- [ ] Outline で `resource[table]` ノードが table のピクトグラムを表示する（base の `resource` アイコンではない）
- [ ] プレビューの Icon Mode を ON にしたとき、Outline と Icon Mode が同じノードに同じピクトグラムを表示する
- [ ] タグの無い素の `client` / `resource` ノードは従来通り base アイコンを表示する
