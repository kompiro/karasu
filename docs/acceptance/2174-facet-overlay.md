# AT: facet overlay — multi-select 強調・多重所属の描画・legend 掲出

- **日付**: 2026-08-02
- **関連 Issue**: [#2174](https://github.com/kompiro/karasu/issues/2174)（Part B slice 2。親 [#2160](https://github.com/kompiro/karasu/issues/2160)、program [#2065](https://github.com/kompiro/karasu/issues/2065)）
- **ADR**: 未昇格（Part B 全スライス完了後。設計は親 Issue [#2160](https://github.com/kompiro/karasu/issues/2160) から辿る）
- **関連 spec**: [`docs/spec/syntax.md`](../spec/syntax.md) §Cross-cutting membership（+ja）/ [`docs/tools/app.md`](../tools/app.md) §Toolbar（+ja）
- **関連 TPL**: **新規** [TPL-2174](../test-perspectives/TPL-2174-opt-in-visual-layer-is-inert-when-off.md)（opt-in な視覚レイヤの無効時 inert）、[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)、[TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md)、[TPL-1886](../test-perspectives/TPL-1886-rekey-transform-preserves-per-element-decoration.md)、[TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)、[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)、[TPL-1402](../test-perspectives/TPL-1402-involutive-toggle-renders-both-states.md)、[TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)
- **対象ファイル**:
  - `packages/core/src/renderer/facet-overlay.ts`（新規）/ `svg-renderer.ts` / `svg-builder.ts` / `layout.ts`
  - `packages/core/src/compile/compile.ts` / `compile-diff.ts` / `renderer/drill-down-svg.ts` / `renderer/all-layers-svg.ts`
  - `packages/app/src/hooks/useSystemView.ts` / `components/PreviewColumn.tsx`、`packages/i18n/src/{types,en,ja}.ts`

> スコープは overlay（強調・減光・リング・legend・selector）のみ。`.krs.style` の
> facet セレクタは slice 3（#2175）、概観 / 監査パネルと feature-sample は slice 4（#2177）。

## 受け入れ条件

- [x] AT-A: facet を 1 つも選択していないとき、overlay は自分のマーカー（`data-facet-member` / `data-facet-ring` / 減光 opacity）を 1 つも出さない

  > ✅ Automated — `packages/core/src/renderer/facet-overlay.test.ts` › `emits none of its own markers when no facet is selected`。**変異で検証済み** — 無効時に `data-facet-member="none"` を出す変異は等値テストも全スイートも通過し、この assert だけが落ちる

- [x] AT-B: facet を宣言・参照しているモデルと、していないモデルのレンダリング結果が一致する（配置が動かない）

  > ✅ Automated — 同 describe › `renders identically whether or not the model declares facets`

- [x] AT-C: 選択を解除すると元の見た目に戻る（TPL-1402）

  > ✅ Automated — 同 describe › `returns to the baseline when the selection is cleared`

- [x] AT-D: 1 facet 選択でメンバーにリングが付き、非メンバーが減光する

  > ✅ Automated — `facet overlay — selection changes the picture (TPL-1503)` › `rings members and dims non-members`

- [x] AT-E: 多重所属の要素に所属数だけリングが出て、順序が既知 facet 順に一致する（選択順では変わらない）

  > ✅ Automated — 同 describe › `draws one ring per selected facet the node belongs to` / `orders a node's facets by known-facet order, not by selection order`

- [x] AT-F: 色は既知 facet 順で割り当てられ、1 つ選択解除しても残りの色が動かない

  > ✅ Automated — `facet overlay — colour stability` › `assigns colours by known-facet order so deselecting one does not recolour the rest`

- [x] AT-G: legend に選択中 facet の色凡例が出る。宣言 `label` が無ければ id で出る。未選択の facet は出ない（TPL-1223）

  > ✅ Automated — `facet overlay — legend` の 3 ケース

- [x] AT-H: エッジは端点の片方でもメンバーなら通常、両端非メンバーなら減光

  > ✅ Automated — `facet overlay — edges` の 2 ケース

- [x] AT-I: Group by team / boundary と**同時**に有効（band frame と リングが同一 SVG に共存し、配置が overlay の有無で変わらない）

  > ✅ Automated — `facet overlay — orthogonal to Group-by` › `draws band frames and facet rings into the same SVG` / `places nodes identically with and without the overlay`

- [x] AT-J: icon / shape 両 display mode でリングが出る（TPL-1001）

  > ✅ Automated — `facet overlay — display modes (TPL-1001)`

- [x] AT-K: live compile / drill-down / all-layers / all-views / entity view の全経路で overlay が乗り、未選択では全経路でマーカーが出ない（TPL-219 / TPL-1983）

  > ✅ Automated — `packages/core/src/compile/facet-overlay-surfaces.test.ts` › `facet overlay reaches every render surface (TPL-219)`。**この test が実装漏れを実際に検出した**（`buildDrillDownSvg` / `buildAllViewsSvg` が引数を受け取るだけで読んでいなかった）

- [x] AT-L: compare（diff）モードでも overlay が乗る

  > ✅ Automated — 同ファイル › `facet overlay in compare mode`

- [x] AT-M: `SystemCompileResult.facets` が宣言済み facet を label 付き・参照のみを label 無しで、既知 facet 順に返す。facet 未使用モデルでは空

  > ✅ Automated — 同ファイル › `compile reports the model's facets for the selector` の 3 ケース

- [x] AT-N: facet 未使用モデルでは Facets セレクタが表示されない

  > ✅ Automated — `packages/app/src/components/FacetSelector.test.tsx` › `is absent for a model that declares no facets`

- [x] AT-O: セレクタはマルチセレクトで、1 回開いたまま複数選べる

  > ✅ Automated — 同 describe › `stays open across selections, so multi-select is one open, many picks`

- [x] AT-P: モデルから消えた facet が選択に残らない（TPL-1032）

  > ✅ Automated — `useSystemView` が `result.facets` との交差を read 時に取る（実装上「空だが有効な overlay」を作れないため、残留状態が型として存在しない）

- [x] AT-K2: app のエクスポート経路（`useViewSvg` → drill-down / all-layers / all-views / entity view）に選択が渡る

  > ✅ Automated — `packages/app/src/hooks/useViewSvg.test.tsx` の既存 groupBy スレッディング試験と同じ経路。**レビューで検出した実装漏れ**（`useViewSvg` が `selectedFacets` を受け取っておらず、エクスポートだけ overlay が落ちていた）を修正した

- [x] AT-L2: compare モードで、削除されたノードも選択中 facet のリングを保つ

  > ✅ Automated — `packages/core/src/compile/facet-overlay-surfaces.test.ts` › `keeps a removed node's ring`。after 側だけで解決すると削除ノードが「元から非メンバー」に見えるため、boundary 軸と同じ before 側 backfill を入れた（ADR-1886）

- [x] AT-P2: facet をトグルすると再コンパイルが走る

  > ✅ Automated — `packages/app/src/hooks/useSystemView.test.tsx` › `recompiles the overlay when a facet is toggled`。**レビューで検出**（`facetsKey` が `deps` から漏れており、トグルしても図が変わらなかった）。dep を外すとこのテストが落ちることを変異で確認済み

- [ ] AT-Q: 🧑 Manual — app で facet を選び、メンバーにリング・非メンバーの減光・legend の色凡例が**目で読めること**（色のコントラストが light / dark 双方で成立しているか。TPL-1697）

  > `pnpm --filter @karasu-tools/app dev` → `index.krs` に `facet pii { label "Personal data" }` と `service Api { facets pii }` を書き、Facets セレクタから選択。テーマを切り替えて両方で確認

- [ ] AT-R: 🧑 Manual — **Group by: team / boundary と同時に**有効にして、バンドとリングが互いを潰さずに読めること（#2174 が名指しする AT 項目）

- [ ] AT-S: 🧑 Manual — team frame / external・infra カテゴリを畳んだとき、stub にリングが残り「畳んだ瞬間に overlay が消える」ようにならないこと（TPL-1886）

- [ ] AT-T: 🧑 Manual — ドリルダウンしても所属が読めること（`requires_auth` 相当の facet が階層を跨いで追えるか。#2174 が名指しする AT 項目）

- [ ] AT-U: 🧑 Manual — SVG 書き出しに overlay が乗ること（renderer に焼く判断＝案 1-A の根拠が実際に成立しているか）

## 補足 — 自動化しなかったもの

リングの**視認性**（色のコントラスト・重なりの読み取りやすさ）は自動化していない。
パレットが両テーマで読めることは TPL-1697 の観点であり、機械では「色が付いている」
までしか言えないため、AT-Q を実機確認として残す。experimental の間の実測フィードバック
で調整する前提（design doc「未解決の問い」）。
