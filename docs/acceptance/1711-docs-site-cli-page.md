# AT: docs-site "Using the CLI" page

- **日付**: 2026-06-23
- **関連 Issue**: [#1711](https://github.com/kompiro/karasu/issues/1711)
- **対象ファイル**: `docs/tools/cli.md`, `docs/tools/cli.ja.md`,
  `packages/docs-site/scripts/lib/site-map.ts`
- **関連 TPL**: [TPL-20260616-01](../test-perspectives/TPL-20260616-01-docs-pipeline-link-anchor-resolution.md)（リンク / アンカー解決）、[TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)（ページ内容を実装と同期）

## 受け入れ条件

- [x] `tools/cli.md` が公開ページ集合（`PUBLISHED_EN_FILES`）に登録され、サイトのルート `tools/cli/` に解決される

  > ✅ Automated — `packages/docs-site/scripts/lib/site-map.ts` の `PUBLISHED_EN_FILES` に追加。既存の `routeOf` / `contentPathOf` のロジックで route `tools/cli/`, content `tools/cli.md` に解決される（`astro.config.mjs` の "Tools" サイドバーグループが `tools` ディレクトリを autogenerate するため設定変更は不要）。

- [x] 英語版・日本語版の内部リンクがすべて解決し、リンク切れがない

  > ✅ Automated — `pnpm --filter @karasu-tools/docs-site check-links`（`build` 内でも実行され、未解決リンク・壊れたアンカーで失敗する）。TPL-20260616-01。

- [x] sync → build がエラーなく完了する（生成された Astro コンテンツが妥当）

  > ✅ Automated — `pnpm --filter @karasu-tools/docs-site build`（`sync` で `docs/tools/cli*.md` を生成し、`astro build` が成功すること）。

- [ ] ページに記載したコマンド名・オプション・既定値が実装（`packages/cli/src/index.ts`）と一致する

  > 🧑 Manual — `serve` / `render` のオプションと既定値、コマンド一覧を `packages/cli/src/index.ts` の commander 定義と突き合わせて確認する（実装時に突き合わせ済み）。TPL-20260511-02。

- [ ] `astro dev` でサイドバーに **Tools → Using the karasu CLI** が英語・日本語の両ロケールで表示され、ページが正しくレンダリングされる

  > 🧑 Manual — `pnpm --filter @karasu-tools/docs-site dev` を起動し、`/tools/cli/` と `/ja/tools/cli/` を開いて目視確認する（サイドバー配置・見出し・テーブル・外部リンク）。
