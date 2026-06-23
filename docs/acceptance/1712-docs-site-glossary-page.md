# AT: docs-site "Glossary" page

- **日付**: 2026-06-23
- **関連 Issue**: [#1712](https://github.com/kompiro/karasu/issues/1712)
- **対象ファイル**: `docs/spec/glossary.md`, `docs/spec/glossary.ja.md`,
  `packages/docs-site/scripts/lib/site-map.ts`
- **関連 TPL**: [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)（正典の再掲がドリフトしない / 矛盾しない — 用語集を back-ref で紐付け）、[TPL-20260616-01](../test-perspectives/TPL-20260616-01-docs-pipeline-link-anchor-resolution.md)（リンク / アンカー解決）

## 受け入れ条件

- [x] `spec/glossary.md` が公開ページ集合（`PUBLISHED_EN_FILES`）に登録され、Reference サイドバーグループのルート `spec/glossary/` に解決される

  > ✅ Automated — `packages/docs-site/scripts/lib/site-map.ts` の `PUBLISHED_EN_FILES` に追加。既存の `routeOf` / `contentPathOf` のロジックで route `spec/glossary/`, content `spec/glossary.md` に解決される（`astro.config.mjs` の "Reference" グループが `spec` ディレクトリを autogenerate するため設定変更は不要）。

- [x] 英語版・日本語版の内部リンクとアンカーがすべて解決し、リンク切れがない（en/ja とも concepts / syntax / style / tags-annotations の見出しアンカーへ正しく張られている）

  > ✅ Automated — `pnpm --filter @karasu-tools/docs-site check-links`（`build` 内でも実行され、未解決ルート・壊れた見出しアンカーで失敗する）。TPL-20260616-01。

- [x] sync → build がエラーなく完了する（生成された Astro コンテンツが妥当）

  > ✅ Automated — `pnpm --filter @karasu-tools/docs-site build`（`sync` で `docs/spec/glossary*.md` を生成し、`astro build` が成功すること）。

- [ ] 用語集の各定義が正典（concepts / spec）と矛盾しない（新しい定義を導入していない）

  > 🧑 Manual — Explore エージェントが concepts.md / spec/* から抽出した term→定義→出典の対応に基づき各項目を作成し、リンク先の正典と突き合わせて確認した。TPL-20260511-02 を back-ref で紐付け。

- [ ] `astro dev` でサイドバーに **Reference → Glossary** が英語・日本語の両ロケールで表示され、ページが正しくレンダリングされる

  > 🧑 Manual — `pnpm --filter @karasu-tools/docs-site dev` を起動し、`/spec/glossary/` と `/ja/spec/glossary/` を開いて目視確認する（サイドバー配置・見出し・各グループのリスト・出典リンクの遷移）。
