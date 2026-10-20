---
type: product
---

# AT: karasu serve の Share が、公開版 app を指すリンクを作る（#3162）

- **日付**: 2026-10-18
- **関連 Issue**: [#3162](https://github.com/kompiro/karasu/issues/3162)
- **関連 ADR**: [ADR-3162](../adr/3162-serve-share-hosted-links.md)
- **Related TPLs**: [TPL-3162](../test-perspectives/TPL-3162-link-for-others-built-on-reachable-origin.md), [TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md), [TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md), [TPL-2259](../test-perspectives/TPL-2259-shared-budget-enforced-at-every-producer.md)
- **対象ファイル**: `packages/app/src/ServeModeApp.tsx`、`packages/app/src/hooks/useShareDialog.ts`、`packages/app/src/components/ShareDialog.tsx`、`packages/app/src/components/preview-toolbar-slot.ts`、`packages/app/src/utils/hosted-app.ts`

> `karasu serve` は #3138 で Share を出さなくなった（リンクが手元のサーバーを指し、他人には開けないため）。リンクを公開版 app（https://karasu.kompiro.dev）宛てに作って Share を戻す。

## 受け入れ条件

### AC-1: serve モードで Share が出て、リンクは公開版を指す

- [x] AT-A: serve モードはツールバーの口に公開版の origin を渡し、Share を隠さない。Pages 用 build と npm の serve 用 build は同じ `ServeModeApp` を通るので、宛先は同じになる

  > ✅ Automated — `packages/app/src/ServeModeApp.test.tsx` › `ServeModeApp` › `keeps Share and points its links at the public app (#3162)`

- [x] AT-B: 口に origin があると、fragment リンクと（収まる大きさなら）`/s?s=` リンクの両方がその origin の `/` から作られ、serve のファイル名（path）を含まない。口に origin が無い app では、今までどおり今いるページから作られる

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `PreviewColumn — Share (karasu-nest inline URL)` › `builds both links on the slot's share origin, at its root, and says so`
  >
  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `PreviewColumn — Share (karasu-nest inline URL)` › `builds the links on this page, with no destination line, when no host sets an origin`
  >
  > ✅ Automated — `packages/app/src/utils/inline-share.test.ts` › `buildShareUrls` › `points both links at the public app when given its origin and the root path`

- [x] AT-C: karasu serve で開いた `/other` から Share すると、fragment リンクが `https://karasu.kompiro.dev/#s=` で始まり、`/other` を含まない（nightly の serve プロジェクト）

  > ✅ Automated — `packages/e2e/tests/at-0032-cli-serve-mode.spec.ts` › `AT-0032: CLI serve mode` › `TC-07: Share builds its links on the public app, not on the local server`

### AC-2: 宛先を共有する本人に知らせる

- [x] AT-D: 宛先が今いるページと違うとき（serve モード）だけ、ダイアログに「リンクは karasu.kompiro.dev で開く」の 1 行が出る

  > ✅ Automated — `packages/app/src/components/ShareDialog.test.tsx` › `ShareDialog` › `names the host the links open on only when they are built elsewhere`

### AC-3: 公開版の URL は 1 つの値にそろう

- [x] AT-E: app の `HOSTED_APP_ORIGIN` と docs-site の `APP_URL` が同じ値

  > ✅ Automated — `scripts/lint/hosted-app-origin.test.ts` › `the public app's URL` › `is the same in the app and in the docs site`

## 手動確認

- [ ] `karasu serve` で開いた図から Share の fragment リンクをコピーし、serve を止めた別のブラウザで開くと、同じ図が公開版 app で開く（下のモデルを `index.krs` として serve する）

  ```krs
  system Shop {
    service Web { label "Shop Web" }
    service Api { label "Shop API" }
    Web -> Api "calls"
  }
  ```
