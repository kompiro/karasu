---
type: product
---

# AT-2636: Team dependency graph as a third org-tab mode

- **日付**: 2026-09-04
- **関連 Issue**: [#2636](https://github.com/kompiro/karasu/issues/2636)（slice B of [#2597](https://github.com/kompiro/karasu/issues/2597)）
- **対象ファイル**:
  - `packages/core/src/renderer/team-dependency-graph.ts`
  - `packages/core/src/renderer/team-dependency-graph.test.ts`
  - `packages/core/src/compile/compile.ts` (`OrgCompileResult.teamDependencies`)
  - `packages/core/src/renderer/empty-state-labels.ts`
  - `packages/app/src/hooks/useOrgDisplayMode.ts`
  - `packages/app/src/hooks/useOrgDisplayMode.test.ts`
  - `packages/app/src/hooks/useOrgView.ts`
  - `packages/app/src/hooks/useAppViews.ts`
  - `packages/app/src/hooks/usePreviewContextValue.ts`
  - `packages/app/src/state/preview-context.tsx`
  - `packages/app/src/components/AppShell.tsx`
  - `packages/app/src/components/PreviewViewControls.tsx`
  - `packages/app/src/components/PreviewColumn.tsx`
  - `packages/app/src/components/PreviewColumn.test.tsx`
  - `packages/i18n/src/en.ts`, `packages/i18n/src/ja.ts`, `packages/i18n/src/types.ts`
  - `docs/tools/app.md`, `docs/tools/app.ja.md`
- **関連 TPL**: [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)（派生 state の陳腐化）, [TPL-2635](../test-perspectives/TPL-2635-ownership-resolution-declares-its-walk.md), [TPL-2075](../test-perspectives/TPL-2075-parsed-construct-renders-or-warns.md)

## 受け入れ条件

- [x] AT-A: 導出したチーム依存が org タブの第 3 モードとして描画され、ツールバーのトグルで到達できる
  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `offers the mode as a toolbar toggle beside Tree View` / `draws the derived graph when the mode is on`

- [x] AT-B: sync と async が視覚的に区別される（実線 / 破線）
  > ✅ Automated — `packages/core/src/renderer/team-dependency-graph.test.ts` › `keeps sync and async visually distinct — solid line versus dashed`

- [x] AT-C: モードを切り替えても既存の grid / Tree View の挙動が変わらない（同時に 2 モードが立つ状態に到達できない）
  > ✅ Automated — `packages/app/src/hooks/useOrgDisplayMode.test.ts` › `never has two modes on at once` / `toggles a mode back to the grid when pressed again`

- [x] AT-D: `organization` を持たないモデルではこのモードが提示されない
  > ✅ Automated — `PreviewColumn.test.tsx` › `does not offer the mode when the model declares no organization`

- [x] AT-E: 所有チームに解決しなかった端点が黙って消えず、グラフ上に件数として出る
  > ✅ Automated — `team-dependency-graph.test.ts` › `shows the unowned remainder in the footer rather than omitting it`

- [x] AT-F: 相互依存（チーム間の循環）が片方向に潰されず両方向とも描かれる
  > ✅ Automated — `team-dependency-graph.test.ts` › `draws both directions of a mutual dependency instead of dropping one`

- [x] AT-G: nested な対（一方が他方の org ツリー上の祖先）が cross-team と別の見え方になる
  > ✅ Automated — `team-dependency-graph.test.ts` › `carries the edge kind and relation as data attributes`

- [x] AT-H: モード表示中の SVG エクスポートが、grid ではなく導出グラフを書き出す
  > ✅ Automated — `PreviewColumn.test.tsx` › `exports the derived graph while the mode is on`

- [x] AT-I: 新しいツールバーラベルが `ja` ロケールで英語のまま出ない
  > ✅ Automated — `PreviewColumn.test.tsx` › `PreviewColumn — toolbar carries no English hardcodes under locale=ja`（`EN_TOOLBAR_STRINGS` に新ラベルを追加）

- [x] AT-J: ツールバーのトグルが自分のハンドラに繋がっている（隣の Tree View のものを呼ばない）
  > ✅ Automated — `PreviewColumn.test.tsx` › `wires the toggle to its own handler, not Tree View's`

- [x] AT-K: 循環（相互依存）の 2 チームが別の列に置かれ、先頭に空列ができない
  > ✅ Automated — `packages/core/src/renderer/team-dependency-graph.test.ts` › `puts the two teams of a cycle in different columns, with no blank leading column`

- [x] AT-L: 循環の戻りエッジが、間のカードの下をくぐらない経路で描かれる
  > ✅ Automated — `team-dependency-graph.test.ts` › `routes the return edge of a cycle clear of the cards it would cross`

- [x] AT-M: 同一チーム対が sync と async の両方を持つとき、2 本が別経路に開かれる（実線が破線を隠さない）
  > ✅ Automated — `team-dependency-graph.test.ts` › `fans sync and async apart when one team pair carries both`

- [x] AT-N: 相互依存の 2 方向で、エッジ本数ラベルが重ならない
  > ✅ Automated — `team-dependency-graph.test.ts` › `gives the two directions of a mutual pair distinct count positions`

- [x] AT-O: カードに収まらない team ラベルが切り詰められる
  > ✅ Automated — `team-dependency-graph.test.ts` › `truncates a team label that would overflow its card`

- [x] AT-P: ローカライズされたフッタ行が viewBox に収まる（日本語で切れない）
  > ✅ Automated — `team-dependency-graph.test.ts` › `widens the canvas so a localized footer line is not clipped`

- [x] AT-Q: 履歴で org のプレーンな permalink に戻ると、依存モードではなくグリッドが描かれる（URL と表示が食い違わない）
  > ✅ Automated — `packages/app/src/hooks/useOrgDisplayMode.test.ts` › `returns to the grid when a history restore addresses a plain org hash`

- [x] AT-R: どの経路も viewBox の外に出ない（迂回した曲線が切れて宙に浮かない）
  > ✅ Automated — `packages/core/src/renderer/team-dependency-graph.test.ts` › `keeps every control point inside the viewBox`

- [x] AT-S: 列を飛び越す依存が、間のカードを貫かない経路で描かれる
  > ✅ Automated — `team-dependency-graph.test.ts` › `routes a dependency that skips a column clear of the card in between`

- [x] AT-T: 列飛ばしと循環の戻り経路が行の反対側に分かれる（見分けがつく）
  > ✅ Automated — `team-dependency-graph.test.ts` › `sends the skip-level and the back edge to opposite sides of the row`

- [x] AT-U: フッタが迂回曲線より下に置かれ、重ならない
  > ✅ Automated — `team-dependency-graph.test.ts` › `keeps the footer below every routed curve`

## 手動確認

- [ ] 🧑 org タブで **チーム依存** を押すと導出グラフが描かれ、もう一度押すとグリッドに戻る。**ツリー表示** を押すとチーム依存が閉じる（<https://karasu.kompiro.dev/> で `examples/en/org` を開く）
  > 描画の見た目（レイアウトの読みやすさ・線の判別）は自動テストが原理的に届かない範囲。

## このスライスが**まだ**答えないこと

- 囲みを跨ぐ所有（structural overlap。slice C [#2637](https://github.com/kompiro/karasu/issues/2637)）はグラフに出ない
- このモードは **permalink / 共有リンクに乗らない**。`#krs-org-tree` に相当するトークンを
  持たないため、共有された URL は org タブのグリッドで開き、履歴で戻ったときも
  グリッドに復帰する（URL と表示が食い違わないことを AT-Q が固定している）
