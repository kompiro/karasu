# AT: EdgeContextMenu の shadcn DropdownMenu 移行

- **日付**: 2026-05-19
- **関連 Issue**: [#1400](https://github.com/kompiro/karasu/issues/1400)
- **対象ファイル**: `packages/app/src/components/EdgeContextMenu.tsx`、
  `packages/app/src/components/ui/dropdown-menu.tsx`
- **関連**: ADR-20260515-01（shadcn/ui 採用）/ TPL-20260516-01（a11y 契約の移行劣化）

## 受け入れ条件

`packages/app/src/components/PreviewPane.test.tsx` の "edge context menu" describe でカバーされる。

- [x] エッジ（canonical id を持つ）を右クリックするとメニューが開く

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `opens the menu on right-click of an edge group with a canonical id`

- [x] エッジ以外を右クリックしてもメニューは開かない

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `does not open the menu on right-click outside an edge`

- [x] direction 項目を選ぶと `onPickEdgeDirection` が呼ばれる

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `calls onPickEdgeDirection when a direction is chosen`

- [x] `.krs.style` 書き込み先が無いとき direction 項目が disabled になる（`aria-disabled` / `data-disabled`）

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `disables the direction items when no styleTargetPath is set`

- [x] 解決済みターゲットパスの basename がヘッダに表示される

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `shows the resolved target path basename in the menu header`

- [x] ターゲットパスが無いときヘッダのターゲット行は出ない

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `omits the target path line when there is no styleTargetPath`

## 手動確認チェックリスト

`.krs.style` を `@import` した `.krs` を Preview UI で開き、エッジ（canonical id を持つ
ものは hover でカーソルが変わる）を右クリックして確認する。

- [ ] メニュー表示中、↑ / ↓ で direction 項目間のフォーカスが移動し、Home / End で先頭・末尾に飛ぶ
- [ ] 頭文字キー（例: `d`）で type-ahead により項目が絞り込まれる
- [ ] `.krs.style` 書き込み先が無い状態（`@import` 無しの `.krs`）では、disabled な direction 項目が矢印キーのフォーカス移動でスキップされる
- [ ] Enter / Space で項目を選択すると、メニューが閉じて当該方向が `.krs.style` に書き込まれる
- [ ] Esc キー、およびメニュー外クリックでメニューが閉じる（dismissal 契約の維持）
- [ ] メニューは従来どおり右クリックした座標位置に表示される
