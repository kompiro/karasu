# AT-1646: Open a gallery example in the app (id + fixed origin)

- **日付**: 2026-06-16
- **関連 Issue**: [#1646](https://github.com/kompiro/karasu/issues/1646)
- **関連設計 / ADR**: `docs/design/app-open-gallery-example.md`（#1660 でマージ）、[ADR-20260616-08](../adr/20260616-08-en-ja-example-parity.md)（最小シード方針）
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

### AC-4: deep-link で起動（手動確認）

- [ ] `https://karasu.pages.dev/?example=payment-platform&lang=en` を開くと payment-platform の英語 example が ProjectMode に読み込まれる（`?lang=ja` で日本語）。不正 slug ではエラーバナーが出て fetch されない（目視）

## 検証方法

- 自動: `pnpm --filter @karasu-tools/core run test`（manifest）/ `pnpm --filter @karasu-tools/app exec vitest run src/utils/fetch-example.test.ts` / `pnpm --filter @karasu-tools/docs-site run test`。PR CI に乗る。
- 手動: deep-link を開いて ProjectMode への読み込みと多言語・異常系を目視（AC-4）。
