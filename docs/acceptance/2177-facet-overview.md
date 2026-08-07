# AT: facet 所属一覧（導出）と register 総合サンプル

- **日付**: 2026-08-04
- **関連 Issue**: [#2177](https://github.com/kompiro/karasu/issues/2177)（Part B slice 4。親 [#2160](https://github.com/kompiro/karasu/issues/2160)、program [#2065](https://github.com/kompiro/karasu/issues/2065)）
- **関連 ADR**: [ADR-2065](../adr/2065-tags-and-facets.md)（本 PR で昇格）、[ADR-2173](../adr/2173-facet-grammar-and-model.md)、[ADR-2174](../adr/2174-facet-overlay.md)
- **上位 AT**: [`2065-tags-and-facets.md`](2065-tags-and-facets.md)（プログラム統合。本 AT はそのスライス分）
- **関連 TPL**: [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)（派生 state の二重持ち）、[TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)（複合キーは識別次元を全部持つ）、[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)、[TPL-1716](../test-perspectives/TPL-1716-user-facing-surface-docs-sync.md)
- **対象ファイル**:
  - `packages/core/src/renderer/facet-overview.ts`（新規）/ `compile/compile.ts` / `index.ts`
  - `packages/app/src/components/FacetOverviewPanel.tsx`（新規）/ `PreviewColumn.tsx` / `hooks/useSystemView.ts` / `hooks/useAppViews.ts` / `state/{preview-context,active-view-data}.ts`
  - `examples/en/feature-samples/tag-facet-registers.krs`（+ `.krs.style`）、`packages/core/src/builtins/examples.ts`
  - `packages/i18n/src/{types,en,ja}.ts`

## 受け入れ条件

- [x] AT-A: `buildFacetOverview` が各 facet の所属要素を document 順で返す

  > ✅ Automated — `packages/core/src/renderer/facet-overview.test.ts` › `lists the elements that declare each facet`

- [x] AT-B: 宣言のメタデータ（`label` / `description` / `link`）が一覧に載る — 監査が実際のポリシー文書まで辿れる

  > ✅ Automated — 同 describe › `carries the declaration's metadata, so an audit can reach the policy`

- [x] AT-C: 別スコープの同名ノードが**別々の行**になり、path で区別できる

  > ✅ Automated — 同 describe › `keeps two same-named nodes in different scopes apart (TPL-1352)`。**この 1 件がこの実装の形を決めている** — `facetIndex` は bare node id で keying するので、そこから作ると 2 要素が 1 行に潰れ、互いの facet を取り違える。だから宣言サイトを歩いている

- [x] AT-D: 参照のみ（未宣言）の facet も一覧に出て、メンバーを取りこぼさない

  > ✅ Automated — 同 describe › `reports a referenced-but-undeclared facet with no members lost`

- [x] AT-E: 宣言されたが誰も所属していない facet が**空リストで出る**（黙って消えない）

  > ✅ Automated — 同 describe › `lists a declared facet nobody joined, with an empty member list`。省くと「宣言済みだが未使用」と「存在しない」が区別できなくなる — 監査が訊いているのはまさにそこ

- [x] AT-F: 1 要素に同じ facet を 2 行書いても 1 行に畳まれる

  > ✅ Automated — 同 describe › `collapses a facet repeated on one element into one row`

- [x] AT-G: `system` の外に書かれた要素にも届く

  > ✅ Automated — 同 describe › `reaches elements declared outside a system block`

- [x] AT-H: 一覧の facet 順が overlay の色割り当て順と一致する（パネルの swatch と図のリングが同じ色になる）

  > ✅ Automated — 同 describe › `orders facets the same way the overlay assigns colours`

- [x] AT-I: `compile` が `facetOverview` を返し、`facets`（セレクタ用）と **id・順序が一致**する — 1 つの導出の 2 つの見え方であって、2 つの source ではない

  > ✅ Automated — 同ファイル › `compile reports the overview` › `agrees with 'facets' on ids and order — one derivation, two views`

- [x] AT-J: パネルが Facets メニューから開き、facet ごとの件数が出る

  > ✅ Automated — `packages/app/src/components/FacetSelector.test.tsx` › `Facet membership overview (#2177)` › `opens from the Facets menu and lists each facet with its member count`

- [x] AT-K: パネルが「この一覧は導出である」と明示する（著述する場所を探させない）

  > ✅ Automated — 同 describe › `says the list is derived, so nobody looks for a place to author it`

- [x] AT-L: 同名ノード 2 件がパネル上でも 2 行として描かれ、path で区別できる

  > ✅ Automated — 同 describe › `shows two same-named nodes as two rows, told apart by their path`。core 側（AT-C）が正しくても、パネルが bare id を React key にしていたら片方が消える

- [x] AT-M: 未宣言 facet に印が付くが、`facet-not-declared` の内容を**繰り返さない**（1 つの間違いを 2 箇所で説明しない）

  > ✅ Automated — 同 describe › `marks a referenced-but-undeclared facet without repeating the diagnostic`

- [x] AT-N: 宣言の `link` が `rel="noopener"` 付きで出る（NodeDetailPanel と同じ scheme フィルタを通る）

  > ✅ Automated — 同 describe › `links out to the declared policy document`

- [x] AT-O: パネル上の facet 名クリックで overlay がトグルする（一覧から図を駆動できる）

  > ✅ Automated — 同 describe › `toggles the overlay from a facet's name, so the list can drive the diagram`

- [x] AT-P: facet を使っていないモデルでは入口ごと出ない

  > ✅ Automated — 同 describe › `offers no overview entry for a model with no facets`

- [x] AT-Q: register 総合サンプルが parse し、`examples.ts` と byte 一致し、gallery でレンダリングされる

  > ✅ Automated — `packages/core/src/examples.test.ts` の parse ガードと drift ガード（`.krs.style` も対象に含めるよう拡張した）、`packages/docs-site/scripts/lib/render-examples.test.ts`

- [x] AT-J2: `facetOverview` が `useAppViews` の bundle から `PreviewContextValue.systemView` まで実際に届く

  > ✅ Automated — `packages/app/src/hooks/usePreviewContextValue.test.tsx` › `usePreviewContextValue — system-view forwarding`。**実際に踏んだ不具合の再発防止**: この手書きマッピングに `facetOverview` を足し忘れていたため、メニュー項目を押しても `facetOverview.length` のガードが `undefined` を見てパネルが出なかった。`FacetSelector.test.tsx` は `PreviewContextValue` を手で組み立てるのでこの経路を通らず、検出できていなかった。転送を外すと落ちることを変異で確認済み

- [ ] AT-R: 🧑 Manual — 所属一覧を開き、**「PCI スコープに何が入っているか」に 1 画面で答えられる**こと。要素側に所属を書く設計の代償をこの導出ビューが払えているかの確認で、払えていないならパネルの情報設計が足りない

- [ ] AT-S: 🧑 Manual — 一覧が長いモデル（20 要素以上が 1 facet に属する）でパネルが読めること。スクロールが図を巻き込まないこと（`data-wheel-zoom-ignore`）

- [ ] AT-T: 🧑 Manual — light / dark 双方で swatch・path・件数が読めること

- [ ] AT-U: 🧑 Manual — `tag-facet-registers.krs` を開き、4 register の違いが**サンプルを読んで理解できる**こと。とくに「`[external]` は何もグルーピングしない」「`facets pci` だけが overlay に出る」が体験として伝わるか

## 補足 — 自動化しなかったもの

**一覧が監査の問いに答えられるか**（AT-R）は自動化していない。テストが言えるのは「行が出る」
までで、その一覧を見て人が判断できるかは人にしか判定できない。これは #2177 が引き受けた
trade-off そのもの（所属を要素側に書く代わりに、集中一覧を導出で払う）の検証点なので、
experimental の間の実測フィードバックで情報設計を調整する前提。

**`facetIndex` を読む実装に戻していないこと**は AT-C / AT-L が両側で fence している。片側だけだと、
core が正しくてもパネルの React key で潰れる／パネルが正しくても core が union を返す、のどちらかを
見逃す。
