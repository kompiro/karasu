# AT-1646: Open a gallery example in the app (id + fixed origin)

- **日付**: 2026-06-16
- **関連 Issue**: [#1646](https://github.com/kompiro/karasu/issues/1646)
- **関連 ADR**: [ADR-20260616-11](../adr/20260616-11-open-gallery-example-in-app.md)（id 指定・固定 origin）、[ADR-20260616-08](../adr/20260616-08-en-ja-example-parity.md)（最小シード方針）
- **Related TPLs**: [TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md)（信頼境界での入力検証）
- **対象**:
  - `packages/core/src/builtins/openable-examples.ts`（manifest + `findOpenableExample`）
  - `packages/app/src/utils/fetch-example.ts`、`packages/app/src/hooks/useProjectActions.ts`（`openExample`）、`packages/app/src/ProjectModeApp.tsx`（deep-link）
  - `packages/docs-site/scripts/lib/gallery-pages.ts`（「Open in the app」ボタン）

## 概要

gallery の example を app で開く導線（#1646）。**任意 URL は受け取らない** — `slug`+`lang` を受け、app が固定の karasu raw origin から組み立てて fetch する。deep-link `?example=<slug>&lang=<lang>` と gallery 各ページの「Open in the app」ボタンで起動。multi-file は entry から `import` を辿って同 origin から再帰取得する。

## 受け入れ条件

### AC-1: openable manifest が入力を厳格検証する（TPL-20260510-17）

> ✅ Automated by `packages/core/src/builtins/openable-examples.test.ts` (suite-wide)

- [x] 既知 example × 利用可能 lang は entry を返す。未知 slug / 不正 lang / 利用不可 lang（client-mcp の ja 等）は `undefined`
- [x] パストラバーサル slug（`../etc`, `a/b`, 大文字混じり）は `undefined`（fetch させない）

### AC-2: fetch は固定 origin のみ・import 追従は example 配下に限定

- [x] 不正/未知 slug・lang では **一切 fetch しない**
  > ✅ Automated — `packages/app/src/utils/fetch-example.test.ts` › `rejects an unknown / malformed slug or lang WITHOUT fetching`
- [x] 単一ファイル example を固定 origin から取得し Project files を返す
  > ✅ Automated — `packages/app/src/utils/fetch-example.test.ts` › `fetches a single-file example from the fixed origin`
- [x] `import` / `@import` を同 origin から再帰取得（`resolvePath` で example 配下に confine、redirect 不追従）
  > ✅ Automated — `packages/app/src/utils/fetch-example.test.ts` › `follows imports recursively from the same origin` / `fetches @import style files too`
- [x] fetch 失敗（404 等）は throw し、UI でグレースフルに表示
  > ✅ Automated — `packages/app/src/utils/fetch-example.test.ts` › `throws on a fetch failure (404)`（UI 表示は `useProjectActions.openExample` の catch → `project.error.openExample`）

### AC-3: gallery「Open in the app」ボタン

- [x] openable な example のページのみ、そのロケールで開けるときだけボタンを出す（feature-samples は非表示、client-mcp は en のみ）
  > ✅ Automated — `packages/docs-site/scripts/lib/gallery-pages.test.ts` › `adds an 'Open in the app' link only for openable examples`

### AC-4: deep-link で起動（e2e 自動化 — #1679）

ブラウザ launch 経由でしか検証できない導線のため、固定 raw origin を `page.route()` で intercept し、on-disk の `examples/` を返すことで hermetic に検証する（ネットワーク非依存・`main` の現状に非依存）。

- [x] `?example=payment-platform&lang=en` で payment-platform の英語 example が固定 origin から fetch され、Project として復元・描画される
  > ✅ Automated — `packages/e2e/tests/at-1646-open-gallery-example.spec.ts` › `en deep-link restores payment-platform as a Project and renders its view`
- [x] `?lang=ja` は日本語の bundled variant を選ぶ（UI ロケールと独立、cf. #1670）
  > ✅ Automated — 同 spec › `lang=ja selects the Japanese bundled variant (#1670)`
- [x] 不正 slug（`../etc`）は manifest で弾かれ **一切 fetch せず**エラーバナーを出す（信頼境界, TPL-20260510-17）
  > ✅ Automated — 同 spec › `a malformed slug is rejected without any fetch (TPL-20260510-17)`

> 注: deep-link で entry が `index.krs` でない example（payment-platform は `system.krs`）はプロジェクト切替時の自動オープン対象にならないため、preview を見るには entry ファイルを開く操作が要る。e2e はこのユーザー操作を再現してから描画を検証する。

## 検証方法

- 自動: `pnpm --filter @karasu-tools/core run test`（manifest）/ `pnpm --filter @karasu-tools/app exec vitest run src/utils/fetch-example.test.ts` / `pnpm --filter @karasu-tools/docs-site run test` / `pnpm --filter @karasu-tools/e2e exec playwright test at-1646`（deep-link launch）。PR CI に乗る。
- 手動: 実 origin での deep-link 動作は本番デプロイ後にスポット確認（任意）。
