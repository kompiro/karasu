# AT: docs-site "Using the App" page

- **日付**: 2026-06-23
- **関連 Issue**: [#1710](https://github.com/kompiro/karasu/issues/1710)
- **対象ファイル**: `docs/tools/app.md`, `docs/tools/app.ja.md`,
  `packages/docs-site/scripts/lib/site-map.ts`, `packages/docs-site/astro.config.mjs`

## 受け入れ条件

- [x] `tools/app.md` が公開ページ集合に登録され、サイトのルートに解決される

  > ✅ Automated — `packages/docs-site/scripts/lib/site-map.test.ts`（`PUBLISHED_EN_FILES` / `routeOf` / `contentPathOf` の既存テストが `tools/app.md` → route `tools/app/`, content `tools/app.md` を検証）

- [x] 英語版・日本語版の内部リンクがすべて解決し、リンク切れがない

  > ✅ Automated — `pnpm --filter @karasu-tools/docs-site check-links`（`build` 内でも実行され、未解決リンク・壊れたアンカーで失敗する）

- [x] sync → build がエラーなく完了する（生成された Astro コンテンツが妥当）

  > ✅ Automated — `pnpm --filter @karasu-tools/docs-site build`（`sync` で `docs/tools/app*.md` を生成し、`astro build` が成功すること）

- [ ] `astro dev` でサイドバーに **Tools → Using the karasu App** が英語・日本語の両ロケールで表示され、ページが正しくレンダリングされる

  > 🧑 Manual — `pnpm --filter @karasu-tools/docs-site dev` を起動し、`/tools/app/` と `/ja/tools/app/` を開いて目視確認する（サイドバー配置・見出し・テーブル・外部リンク）。
