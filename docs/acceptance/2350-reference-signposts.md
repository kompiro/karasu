# AT: Reference から「いつ書くか / どう描かれるか」へ出られる

- **日付**: 2026-08-31
- **関連 Issue**: [#2350](https://github.com/kompiro/karasu/issues/2350)
- **対象ファイル**: `packages/app/src/utils/docs-site-links.ts`,
  `packages/app/src/components/ReferenceContent.tsx`,
  `scripts/lint/reference-docs-links.ts`

## 受け入れ条件

該当する観点は [TPL-1621](../test-perspectives/TPL-1621-docs-pipeline-link-anchor-resolution.md)（リンクとアンカーの未解決はビルド時に落とす）。
Reference の発見可能性側の隣人は [TPL-2316](../test-perspectives/TPL-2316-declarable-construct-reachable-from-reference.md)。

- [x] Reference が「ここにあるのは何が書けるか」だと述べ、「いつ使うか」（ガイド・記法クックブック）と「どう描かれるか」（Examples ギャラリー）へのリンクを持つ

  > ✅ Automated — `packages/app/src/components/ReferenceContent.test.tsx` › `ReferenceContent signpost` › `frames the tables as 'what you can write' and points at the guides and the gallery`

- [x] リンク先はページ単位で、`#fragment` を持たない。外部リンクとして `target="_blank"` / `rel="noopener noreferrer"` が付く

  > ✅ Automated — `packages/app/src/components/ReferenceContent.test.tsx` › `ReferenceContent signpost` › `links to published docs-site pages, page-level and without an anchor`

- [x] ロケールに追従し、`ja` では `/ja/` 配下へ飛ぶ

  > ✅ Automated — `packages/app/src/components/ReferenceContent.test.tsx` › `ReferenceContent signpost` › `follows the locale into the /ja/ prefix`

- [x] どのタブを開いていても出続ける

  > ✅ Automated — `packages/app/src/components/ReferenceContent.test.tsx` › `ReferenceContent signpost` › `stays visible on every tab`

- [x] **pop-out ウィンドウが carry する** — ツールバーを持たず、これまで行き止まりだったモード（#1548）で出口があること

  > ✅ Automated — `packages/app/src/components/ReferenceContent.test.tsx` › `ReferenceContent signpost` › `is carried by the pop-out window, which has no toolbar to fall back on`

- [x] リンク先が docs サイトの公開ページでなくなったら落ちる。判定は en / ja それぞれ独立で、片方だけ翻訳が無いケースも検出する

  > ✅ Automated — `scripts/lint/reference-docs-links.test.ts` › `check` › `rejects a route that is not a published page` / `rejects a route whose en page is published but whose ja page is not`

- [x] `#fragment` を足したら、ページ自体が公開されていても落ちる（アンカーはロケールごとに slug が変わるため）

  > ✅ Automated — `scripts/lint/reference-docs-links.test.ts` › `check` › `rejects a #fragment even when the page itself is published`

- [x] 公開ページ集合は docs サイト自身の情報源（`PUBLISHED_EN_FILES` + `routeOf`、`GALLERY_PAGES`）から組み立てられ、ガード側に転記されていない

  > ✅ Automated — `scripts/lint/reference-docs-links.test.ts` › `publishedRoutes` › `covers the guide pages and the generated gallery in both locales` / `does not invent routes for pages the site does not publish`

- [x] 実リポジトリの signpost リンクが finding ゼロである

  > ✅ Automated — `scripts/lint/reference-docs-links.test.ts` › `check` › `passes for the signpost routes the app ships`

## 手動確認

- [ ] 🧑 Manual — <https://karasu.kompiro.dev> で Docs ▾ → Reference を開き、**別ウィンドウとして開いた pop-out** の中で 3 本のリンクが新しいタブで公開サイトの当該ページに着く（jsdom では別ウィンドウの生成と実際の遷移を観測できない）
