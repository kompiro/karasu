# AT-1642: English variants of the gallery scenario examples (Phase A)

- **日付**: 2026-06-16
- **関連 Issue**: [#1642](https://github.com/kompiro/karasu/issues/1642)
- **関連 ADR**: [ADR-20260616-07](../adr/20260616-07-en-ja-example-parity.md)（en/ja example parity）、[ADR-20260616-03](../adr/20260616-03-docs-site-ssg.md)
- **Related TPLs**: [TPL-20260616-01](../test-perspectives/TPL-20260616-01-docs-pipeline-link-anchor-resolution.md), [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)
- **対象**:
  - `examples/en/<name>/`（9 シナリオの英語版）
  - `packages/docs-site/scripts/lib/examples-manifest.ts`（`localized()` ヘルパ / per-locale エントリ）

## 概要

docs gallery の en ページが日本語ラベルの図を出していた問題に対し、日本語ラベルのシナリオ example 9 件（`payment-platform` / `org` / `hr-tool` / `deploy` / `migration` / `org-only` / `deploy-only` / `multi-file-system` / `deploy-org`）の英語版を `examples/en/<name>/` に用意し、gallery を per-locale で出し分ける。`client-mcp` は元から英語のため共有のまま。`feature-samples` も英語のため対象外。`getting-started` は既存の en/ja 対応のまま。

本 PR は **Phase A（追加のみ・低 ripple）**。ja を `examples/ja/` へ移す対称化（Phase B）と、アプリ同梱は対象外（設計どおりアプリは最小シードを維持）。

## 受け入れ条件

### AC-1: 英語版 example がコンパイルでき、構造が ja と一致する

> ✅ Automated by `packages/docs-site/scripts/lib/render-examples.test.ts` (suite-wide)

- [x] manifest の全 example（ja/en 両ロケールのエントリ）が例外なくコンパイルでき、1 つ以上の非空ビューを生成する
- [x] multi-file（`examples/en/multi-file-system`）が `import` 解決込みでレンダリングできる

### AC-2: gallery がシナリオの図をロケール別に出し分ける

- [x] `localized()` ページは en エントリ `examples/en/<name>` / ja エントリ `examples/<name>` を持ち、`githubDir` も per-locale
  > ✅ Automated — `packages/docs-site/scripts/lib/gallery-pages.test.ts` › `single-example page embeds the view as a data-URI img with a source fence`（en ページの GitHub リンクが `examples/en/payment-platform` を指す）
- [ ] `/examples/ja/payment-platform/` 等の en ページが**英語ラベルの図**を、`/ja/examples/...` が**日本語ラベルの図**を表示する（目視）

### AC-3: 既に英語の example は重複させない

- [x] `client-mcp`（元から英語）は `single()` の共有エントリで `examples/en/client-mcp` に置く（ja 版は作らない）
  > ✅ Automated — `examples-manifest.ts` 上 `client-mcp` のみ `single(`（他 9 件は `localized(`）

### AC-4: 完全対称化（Phase B — `examples/<lang>/<name>/`）

- [x] 全 example が `examples/ja/<name>/`（日本語著者）/ `examples/en/<name>/`（英語著者）へ移行し、root 直下は `en/` `ja/` `github-actions/` `README.md` のみ
  > ✅ Automated — `packages/core/src/examples.test.ts` の byte 一致ガードが移行後パス（`examples/en/feature-samples` / `examples/ja/multi-file-system` / `examples/ja/{deploy-only,org-only}`）で通る
- [x] bundled example の移動後も `examples.ts` 同梱内容と on-disk が byte 一致し、ADR の `assumptions:` file パスも実在を維持する
  > ✅ Automated — `pnpm --filter @karasu-tools/core run test`（examples.test）+ `pnpm exec adr check-assumptions`（移動した 4 件の assumption パスを更新済み）
- 注: `docs/adr/*` の決定本文は不変（immutability 規約）。移動で stale になる本文中のパス参照は意図的に残し、`assumptions:` の live check のみ更新した。

## 検証方法

- 自動: `pnpm --filter @karasu-tools/docs-site run test`（render smoke が ja/en 両エントリを描画）/ `pnpm --filter @karasu-tools/core run test`（byte 一致）/ `pnpm exec adr check-assumptions`。すべて PR CI に乗る。
- 手動: `pnpm --filter @karasu-tools/docs-site run build && … run preview` で `/examples/` の各シナリオを en/ja 目視（AC-2）。
