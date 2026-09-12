---
type: product
---

# AT: org タブの 2 サブモードを共有プレビューペインに載せる（#2799）

- **日付**: 2026-09-12
- **関連 Issue**: [#2799](https://github.com/kompiro/karasu/issues/2799)（本 PR）, [#2800](https://github.com/kompiro/karasu/issues/2800)（先行して entity ビューを載せ替えた）
- **Related TPLs**: [TPL-2800](../test-perspectives/TPL-2800-diagram-pane-shared-viewer-affordances.md)（図を描くペインは共有ビューアコンポーネントを通す）, [TPL-1537](../test-perspectives/TPL-1537-react-passive-event-preventdefault-noop.md)（ズームの wheel リスナが非 passive である必要）
- **先行 AT**: [AT-0044](0044-org-tree-view.md)（Org Tree View のトグル・展開）, [AT-2636](2636-team-dependency-org-mode.md)（Team Dependencies モード）, [AT-2800](entity-view-pane-layout.md)（entity ビューの載せ替え）
- **対象ファイル**:
  - `packages/app/src/components/PreviewColumn.tsx`（org タブ 2 サブモードの描画分岐）
  - `packages/app/src/components/PreviewPane.tsx`（チームカードのクリックを受ける `onTeamToggle`）

> Org Tree View と Team Dependencies は、素の `overflow: auto` な `<div>` に SVG を流し込む最後の描画面だった。フィットもズームもパンも効かず、ビューの診断も届かない。ツリーにとってこれは [ADR-309](../adr/309-org-tree-view.md) が「大規模組織での SVG サイズ上限」として残課題にした失敗そのもので、深い組織はスクロールバー越しにしか読めなかった。

## 受け入れ条件

### AC-1: 2 つのサブモードが共有プレビューペインを通る

- [x] TC-1: org tree の SVG が `.preview-container` の中にあり、`preview-pane--org-tree` マーカーが残っている

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `org tab panes go through the shared preview pane (#2799)` › `renders the org tree SVG inside the shared preview container, keeping the pane marker` / `packages/e2e/tests/at-2799-org-tab-pane-layout.spec.ts` › `the org tree sits in .preview-container and is scaled to fit the pane`

- [x] TC-2: team dependencies の SVG が `.preview-container` の中にあり、`preview-pane--team-dependencies` マーカーが残っている

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `org tab panes go through the shared preview pane (#2799)` › `renders the team-dependency SVG inside the shared preview container` / `packages/e2e/tests/at-2799-org-tab-pane-layout.spec.ts` › `the team dependency graph sits in .preview-container and is zoomable`

- [x] TC-3: ペインより広い org tree が、はみ出さずペイン幅に収まって描かれる

  > ✅ Automated — `packages/e2e/tests/at-2799-org-tab-pane-layout.spec.ts` › `the org tree sits in .preview-container and is scaled to fit the pane`（4 階層のツリーで intrinsic 幅 > ペイン幅、かつ描画幅 ≤ ペイン幅）

- [x] TC-4: 両サブモード上でのホイール操作でズーム transform が変わる

  > ✅ Automated — `packages/e2e/tests/at-2799-org-tab-pane-layout.spec.ts` › `wheel over the org tree zooms it` / `the team dependency graph sits in .preview-container and is zoomable`

### AC-2: org ビューの診断が両サブモードに届く

- [x] TC-5: org ビューの診断が、tree モード・dependencies モードそれぞれのバナーに出る（3 モードとも同じコンパイル結果から描かれるため）

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `org tab panes go through the shared preview pane (#2799)` › `shows the org view's diagnostics in each sub-mode's banner`

### AC-3: 既存のチーム展開・エクスポートを壊さない

- [x] TC-6: チームカードのクリックでメンバーが展開・折りたたみできる（クリックの受け口がペイン div の `onClick` から `PreviewPane` の mouseup ディスパッチへ移ったことによる非退行）

  > ✅ Automated — `packages/e2e/tests/at-0044-org-tree-view.spec.ts` › `Click to expand members; click again to collapse (Cases 5 & 7)` / `Multiple teams can be expanded simultaneously (Case 6)` / `packages/app/src/components/PreviewColumn.test.tsx` › `still toggles a team's members when its card is clicked (AT-0044)` / `packages/e2e/tests/at-2799-org-tab-pane-layout.spec.ts` › `clicking a team card still expands its members through the pane`

- [x] TC-7: `-tree.svg` / `-team-dependencies.svg` のエクスポート、トグルの出現条件、breadcrumb の抑制が従来どおり

  > ✅ Automated — `packages/e2e/tests/at-0044-org-tree-view.spec.ts`（全 8 ケース）, `packages/app/src/components/PreviewColumn.test.tsx` › `PreviewColumn — org tab team-dependency mode (#2636)`

### 手動確認

- [ ] 深い組織（4 階層以上）で Org タブ → Tree View を開き、組織全体の形が一度に読めること。ホイールで拡大したときにチーム名とメンバー名が読めること
- [ ] Dependencies モードで、チーム数の多いモデルのグラフ全体が一度に読めること。ドラッグでパンして端のチームまで辿れること
