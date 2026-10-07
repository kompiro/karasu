# AT-2937: docs-site で boundary と facet を core 語彙として見せる（gallery + home）

- **日付**: 2026-10-07
- **関連 Issue**: [#2937](https://github.com/kompiro/karasu/issues/2937)
- **設計 (ADR)**: [ADR-2677](../adr/2677-language-v2-act.md)（「影響」の後続に docs-site 反映として載る）、[ADR-1628](../adr/1628-docs-site-examples-gallery.md)（gallery のビルド時レンダリング）
- **Related TPLs**: [TPL-1621](../test-perspectives/TPL-1621-docs-pipeline-link-anchor-resolution.md)（docs 取り込みパイプラインの link / anchor 解決。check-links が見ない生成ページと home のリンクを unit test で解決する）
- **対象**:
  - `packages/docs-site/scripts/lib/{examples-manifest,render-examples,gallery-pages}.ts`
  - `packages/docs-site/scripts/sync.ts`
  - `packages/docs-site/home/{en,ja}.md`

## 概要

言語 v2.0 で core になった `boundary` と `facet` は、どちらも viewer の状態（Group by: Boundary / facet の選択）の下でしか描かれない。gallery の manifest に図ごとの描画オプション（`groupBy` / `selectedFacets`）を持たせ、system view の compile にだけ渡す。新ページ _Grouping & membership_ に boundary の feature-sample 3 本（`groupBy: "boundary"`）と `tag-facet-registers`（facet `pci` を選択）を載せ、各図の下に「app で同じ切り替えを入れると同じ図になる」旨と spec 節へのリンクを置く。home の「What is karasu?」に 4 つの register（tag / annotation / facet / boundary）を 1 行で示す。

## 受け入れ条件

### AC-1: 描画オプションが system view に効く

> ✅ Automated by `packages/docs-site/scripts/lib/render-examples.test.ts` (suite-wide)

- [x] `groupBy: "boundary"` を持つ図は boundary 枠（`data-container-id="__group_…"`）を描き、オプションなしでは描かない
- [x] `selectedFacets` を持つ図は選んだ facet ごとに ring（`data-facet-ring="<id>"`）を描き、オプションなしでは描かない
- [x] manifest の全図が、自分の描画オプション込みで en / ja ともにコンパイルでき、非空のビューを 1 つ以上出す

### AC-2: Grouping & membership ページ

- [x] 各図の下に note と spec 節への route-relative リンクが出る（en / ja）
  > ✅ Automated — `packages/docs-site/scripts/lib/gallery-pages.test.ts` › `grouping-and-membership puts a note and a route-relative spec link under each diagram`
- [x] `tag-facet-registers` は feature-samples ページから移り、どの example も 1 ページにしか載らない
  > ✅ Automated — `packages/docs-site/scripts/lib/gallery-pages.test.ts` › `publishes each feature sample on one page only`
- [x] gallery の spec リンクのアンカーが、同期元の docs の見出しに en / ja とも解決する
  > ✅ Automated — `packages/docs-site/scripts/lib/gallery-pages.test.ts` › `gallery spec links resolve (TPL-1621)`
- [x] `examples/` と manifest の対応（examples-coverage）が保たれる
  > ✅ Automated — `packages/docs-site/scripts/lib/examples-coverage.test.ts`

### AC-3: home の 4 register

- [x] en / ja の home が tags-annotations の _Vocabulary registers_ 節と Grouping & membership ページへリンクし、home の全 in-site リンクが解決する
  > ✅ Automated — `packages/docs-site/scripts/lib/home-links.test.ts`

### AC-4: 図の見た目（手動確認）

リンクの解決と描画オプションの効きは AC-1〜3 の自動テストで判定している。残るのは、生成した SVG が data-URI の `<img>` として枠とハイライトを読める形で表示されるかだけで、これはブラウザで見るしかない。

- [ ] [Grouping & membership（en）](https://kompiro.github.io/karasu/examples/grouping-and-membership/) と [ja](https://kompiro.github.io/karasu/ja/examples/grouping-and-membership/) で、boundary の 3 図に色付きの枠が、`tag-facet-registers` の図に `pci` のハイライトが見える

## 検証方法

- 自動: `pnpm --filter @karasu-tools/docs-site run test`
- 手動: 上記の docs-site 本番 URL を目視（AC-4）
