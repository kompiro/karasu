# AT: karasu-nest OGP share page (`/s?s=` unfurl)

- **日付**: 2026-06-26
- **関連 Issue**: [#1801](https://github.com/kompiro/karasu/issues/1801)（共有リンクの OGP 画像）
- **関連 ADR**: [ADR-20260626-01](../adr/20260626-01-karasu-nest-hosted-preview.md)（karasu-nest。OGP は「後続」節）
- **関連 TPL**: [TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md)（URL 由来 payload → server-rendered HTML）、[TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)（share page と `/render`・SPA の payload セマンティクス一致）
- **対象ファイル**:
  - `functions/s.ts`（Pages Function `GET /s` — 薄い Workers アダプタ）
  - `packages/app/src/render/share-page.ts`（`buildSharePage` — framework-agnostic, unit-tested）
  - `packages/app/src/utils/inline-share.ts`（`buildShareUrls` / `MAX_UNFURL_PAYLOAD`）
  - `packages/app/src/components/ShareDialog.tsx` / `PreviewColumn.tsx`（2 リンク UI）
  - `packages/i18n/src/{en,ja,types}.ts`（ダイアログ文言）

> 共有リンクを Slack / Discord / X 等に貼ったとき、`system` 図で unfurl させる。payload は fragment（`#s=`）だとクローラに届かないため、server-visible な query（`/s?s=`）の server-rendered ページから OGP `<meta>` を返し、画像は既存 `/render?…&format=png` を再利用する。人間は `location.replace('/#s=…')` で既存の SPA 復元経路へ bounce する。

## 受け入れ条件

### 自動

- [x] AT-A: `buildSharePage` が valid payload で **200 `text/html`** を返し、`og:image` が `/render?s=…&view=system&format=png&width=1200` を指し、`twitter:card=summary_large_image` と `/#s=…` への bounce を含む

  > ✅ Automated — `packages/app/src/render/share-page.test.ts`

- [x] AT-B: `og:title` = 最初の system の `label ?? id`、`og:description` = その system の `description`（未設定なら静的フォールバック）

  > ✅ Automated — `packages/app/src/render/share-page.test.ts`

- [x] AT-C（TPL-20260510-17）: decode 由来の title/description が **HTML escape** され、属性/タグ injection が成立しない（`"><script>` を含む label でスクリプトが生 HTML に出ない）

  > ✅ Automated — `packages/app/src/render/share-page.test.ts`

- [x] AT-D（TPL-20260510-17）: `s` が base64url 文字集合外（`"` `<` 等を含む）なら **400**、`s` 欠落でも 400

  > ✅ Automated — `packages/app/src/render/share-page.test.ts`

- [x] AT-E: charset は valid だが decode 不能な payload でも **エラーにせず** 静的 meta で 200 を返す（best-effort）

  > ✅ Automated — `packages/app/src/render/share-page.test.ts`

- [x] AT-F: `buildShareUrls` が private（`#s=`）と unfurl（`/s?s=`）の両 URL を返し、両者が同一 encoded payload を運ぶ（single encode）

  > ✅ Automated — `packages/app/src/utils/inline-share.test.ts`

- [x] AT-G: encoded payload が `MAX_UNFURL_PAYLOAD`（~8000）超で unfurl URL は `null`（private のみ）

  > ✅ Automated — `packages/app/src/utils/inline-share.test.ts`

- [x] AT-H: Share ダイアログが private / unfurl の 2 リンクを **トレードオフ文面付き**で表示し、oversize 時は private のみ + 警告。Copy はクリックしたリンクの URL を渡す

  > ✅ Automated — `packages/app/src/components/ShareDialog.test.tsx` / `packages/app/src/components/PreviewColumn.test.tsx`

### 手動（プレビューデプロイで検証）

> OGP の実 unfurl はクローラ挙動に依存するため CI では検証できない。Cloudflare プレビューデプロイで確認する。

- [ ] AT-I: `GET /s?s=<payload>` をブラウザで開くと SPA に bounce し、共有プロジェクトが復元される（`<noscript>` のリンクからも辿れる）
- [ ] AT-J: 同 URL を **Slack** に貼ると system 図のプレビュー画像が表示される
- [ ] AT-K: 同 URL を **Discord** / **X** に貼ってもプレビューが表示される（少なくとも 1 つ。各社のクローラ差は許容）
- [ ] AT-L: og:title / og:description にプロジェクト名・説明が反映される（label / description を設定したモデルで確認）
- [ ] AT-M: 大きいプロジェクトでは Share ダイアログが private リンクのみ + oversize 警告になり、private リンクで復元できる
