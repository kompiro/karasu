# AT: docs-site publish the diagnostics reference page

- **日付**: 2026-06-23
- **関連 Issue**: [#1734](https://github.com/kompiro/karasu/issues/1734)
- **対象ファイル**: `packages/docs-site/scripts/lib/site-map.ts`
- **関連 TPL**: [TPL-20260616-01](../test-perspectives/TPL-20260616-01-docs-pipeline-link-anchor-resolution.md)（公開集合の変更でリンク / アンカー解決が破れないこと）

## 受け入れ条件

- [x] `spec/diagnostics.md` が公開ページ集合（`PUBLISHED_EN_FILES`）に登録され、Reference サイドバーグループのルート `spec/diagnostics/`（en）/ `ja/spec/diagnostics/`（ja）に解決される

  > ✅ Automated — `packages/docs-site/scripts/lib/site-map.ts` の `PUBLISHED_EN_FILES` に追加。既存の `routeOf` / `contentPathOf` のロジックで解決され、`diagnostics.ja.md` sibling も自動公開される（`astro.config.mjs` の "Reference" グループが `spec` ディレクトリを autogenerate するため設定変更は不要）。

- [x] diagnostics ページの内部リンク / アンカーがすべて解決し、リンク切れがない（公開集合に追加したことで新たな未解決リンクが生まれない）

  > ✅ Automated — `pnpm --filter @karasu-tools/docs-site check-links`（`build` 内でも実行）。diagnostics の ADR / TPL リンクは在サイト外（GitHub blob）で検証対象外、在サイトのアンカーリンクは無い。TPL-20260616-01。

- [x] sync → build がエラーなく完了する（`/spec/diagnostics/` と `/ja/spec/diagnostics/` が生成される）

  > ✅ Automated — `pnpm --filter @karasu-tools/docs-site build`。

- [ ] `astro dev` でサイドバーに **Reference → diagnostics** が英語・日本語の両ロケールで表示され、ページが正しくレンダリングされる

  > 🧑 Manual — `pnpm --filter @karasu-tools/docs-site dev --host` を起動し、`/karasu/spec/diagnostics/` と `/karasu/ja/spec/diagnostics/` を開いて目視確認する（サイドバー配置・見出し・規則ファミリのテーブル）。
