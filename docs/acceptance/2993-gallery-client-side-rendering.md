# AT: ギャラリーの投稿をブラウザで描画する

- **日付**: 2026-09-30
- **関連 Issue**: [#2998](https://github.com/kompiro/karasu/issues/2998)（nest が投稿ページを sandbox の viewer として配信する）／[#2997](https://github.com/kompiro/karasu/issues/2997)（viewer のビルド）／親 [#2993](https://github.com/kompiro/karasu/issues/2993)
- **設計**: 親 Issue [#2993](https://github.com/kompiro/karasu/issues/2993) の案 D4（ADR 昇格後はその ADR を参照する）
- **関連 TPL**: [TPL-2993](../test-perspectives/TPL-2993-third-party-content-runs-outside-session-origin.md)（第三者の内容を描画する script は、セッションの origin の権限で走らせない）
- **対象ファイル**:
  - `packages/nest/src/routes/gallery.ts`（`GET /g/:id` を viewer として返す）
  - `packages/nest/src/gallery/viewer-page.ts`（本文の埋め込みとヘッダー）
  - `packages/nest/src/gallery/viewer-assets.ts`、`packages/nest/scripts/stage-viewer.ts`、`packages/nest/wrangler.toml`（viewer の配置と配信範囲）
  - `packages/app/viewer.html`、`packages/app/src/viewer/`（viewer 本体）

## 受け入れ条件

- [x] AT-A: `/g/<id>` は viewer を返し、Worker は SVG を描かない

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `serves the viewer with the submission embedded, not a server-drawn diagram`

- [x] AT-B: 投稿ページの CSP は `sandbox` を含み、`allow-same-origin` を含まない（所有者の閲覧も同じ）

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `serves the viewer as a sandbox without an origin (TPL-2993)`

- [x] AT-C: 投稿ページに form も新しいタブへのリンクも無く、コンソールへは同じタブのリンクで行く

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `puts no form on the page, not even for the owner`、`packages/nest/src/gallery/viewer-page.test.ts` › `uses links that stay in the tab, and no form`

- [x] AT-D: `</script>` や `$&` を含む投稿でも、埋め込みが壊れず元の本文に戻る

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `embeds a source containing </script> without breaking out of the data block`、`packages/nest/src/gallery/viewer-page.test.ts` › `escapes everything that could end the element, and round-trips` / `keeps replacement patterns in a stranger's text literal`

- [x] AT-E: 投稿者が付けたタイトルとログイン名はエスケープされる

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `escapes a title chosen by a stranger`、`packages/nest/src/gallery/viewer-page.test.ts` › `escapes what strangers typed`

- [x] AT-F: 非公開の投稿は「存在しない」と同一の応答のまま（描画経路を変えても公開範囲は広がらない）

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `answers 404 for an unlisted submission, exactly as for one that is not there`

- [x] AT-G: viewer のアセットは `Access-Control-Allow-Origin: *` 付きで配信される

  > ✅ Automated — `packages/nest/scripts/stage-viewer.test.ts` › `gives the assets CORS, because the page that loads them has no origin`

- [x] AT-H: 配置されるのは bundle・テンプレート・`_headers` だけ

  > ✅ Automated — `packages/nest/scripts/stage-viewer.test.ts` › `stages the bundle, the template and _headers, and nothing else`

- [x] AT-I: テンプレートが差し込み口の契約から外れたら、黙って壊れたページを出さずに失敗する

  > ✅ Automated — `packages/nest/src/gallery/viewer-page.test.ts` › `refuses a template with %s`、`packages/app/src/viewer/viewer-html.test.ts` › `has %s exactly once`

- [x] AT-J: viewer が配置されていない deploy では 503 を返し、キャッシュさせない

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `answers 503 when the viewer is not deployed, and does not cache it`

- [x] AT-K: `?format=svg` と `?format=krs` はこれまでどおり生の SVG と `.krs` を返す

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `serves the raw SVG and the .krs on request, without the sandbox`

- [x] AT-L: 静的に直接返すのは `/assets/*` だけで、`/viewer.html` は Worker を通る。deploy は viewer を配置してから行う

  > ✅ Automated — `scripts/ci/nest-viewer-assets.test.ts` › `serves only /assets/* statically; everything else reaches the Worker first` / `stages the viewer before the deploy step`

## 手動確認

- [ ] AT-M1: deploy 済みの nest で Dify の投稿（355KB）を開くと、ブラウザで図が描かれ、ドリルダウン・タブの切り替え・詳細パネルが動く
- [ ] AT-M2: 同じページで DevTools の Console から `self.origin` が `"null"`、`document.cookie` の読み取りが例外になる。Network にはページと `/assets/*` 以外のリクエストが出ない
- [ ] AT-M3: `/viewer.html` を直接開くと 404 になる（テンプレートがセッションの origin で開けない）
- [ ] AT-M4: ヘッダーの `.krs` / `SVG` / `Manage`（所有者のとき）が同じタブで開き、`Manage` から開いたコンソールで操作できる
- [ ] AT-M5: Firefox と Safari でも viewer が起動する
