# AT: ギャラリーの投稿ページが OGP で展開される

- **日付**: 2026-10-01
- **関連 Issue**: [#2995](https://github.com/kompiro/karasu/issues/2995)（投稿ページの OGP）／親 [#2993](https://github.com/kompiro/karasu/issues/2993)
- **関連 ADR**: [ADR-2993](../adr/2993-gallery-client-side-rendering.md)（投稿ページは sandbox の viewer。crawler は `<head>` だけを読む）、[ADR-1801](../adr/1801-karasu-nest-ogp-share-page.md)（app の `/s` の OGP。description の長さの上限を揃える）
- **対象ファイル**:
  - `packages/nest/src/gallery/ogp.ts`（meta タグの組み立て）
  - `packages/nest/src/gallery/validate.ts`（投稿時に最初の system の description を読む）
  - `packages/nest/src/store/submissions.ts`（`description` を保存する）
  - `packages/nest/src/routes/gallery.ts`（公開投稿のページにだけ出す。画像のルート `GET /g/<id>/og.png`）
  - `packages/nest/src/gallery/og-image.ts`（画像の URL・キャッシュキー・Cache API）
  - `packages/nest/src/gallery/og-rasterize.ts`（resvg-wasm で PNG にする）
  - `packages/nest/scripts/stage-viewer.ts`（画像のフォントを `viewer-assets/og-fonts/` に置く）

スライス 1（タイトルと説明）は AT-A〜E、スライス 2（プレビュー画像、[#2995](https://github.com/kompiro/karasu/issues/2995) の Design Doc の方針 T3 + S3 + P1）は AT-F〜K で扱う。

## 受け入れ条件

- [x] AT-A: 公開投稿のページの `<head>` に、保存されたレコードから組み立てた `og:title` / `og:description` / `og:url` / `twitter:card` が出る

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `gives a public submission an OGP card from its stored record (#2995)`、`packages/nest/src/gallery/ogp.test.ts` › `emits the card a crawler reads`

- [x] AT-B: description が無い投稿は、誰のモデルかを示す固定文になる

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `falls back to whose model it is when the record has no description`、`packages/nest/src/gallery/ogp.test.ts` › `says whose model it is when the document has no description`

- [x] AT-C: 限定公開の投稿は、所有者自身の閲覧でも OGP を出さない

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `gives an unlisted submission no card, even on its owner's own view`

- [x] AT-D: タイトルと description はエスケープされ、description は crawler が表示する長さに収まる

  > ✅ Automated — `packages/nest/src/gallery/ogp.test.ts` › `escapes what strangers typed` / `keeps a long description within what crawlers show`

- [x] AT-E: description は投稿時（API とコンソール）に読み、差し替えで読み直す。差し替え後の文書に無ければ消える

  > ✅ Automated — `packages/nest/src/gallery/validate.test.ts` › `reads the first system's description for the page's OGP (#2995)` / `leaves the description out when the first system has none`、`packages/nest/src/routes/submit.test.ts` › `keeps the first system's description for the page's OGP (#2995)`、`packages/nest/src/routes/console.test.ts` › `re-reads the description from the replacement (#2995)`、`packages/nest/src/store/submissions.test.ts` › `keeps the description it was given, and clears it when a replacement has none (#2995)`

- [x] AT-F: 公開投稿の `og.png` は system view を 1200×630 の枠に収めた PNG で、`public, max-age=600` と `nosniff` が付く。描いた画像は 1 日の期限で Cache API に置き、2 回目は描かずにキャッシュから返す。差し替えると描き直す

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `draws a public submission as a framed PNG, cacheable as briefly as its page` / `keeps the drawn image in the edge cache for a day, without cookies or Vary` / `serves the second request from the cache without drawing again` / `draws again once the submission is replaced`

- [x] AT-G: キャッシュキーは保存されたレコードから組み立て、要求のクエリを変えても描き直さない

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `keys the cache on the stored record, so the request's query cannot force a redraw`

- [x] AT-H: 限定公開・存在しない・形の崩れた id の `og.png` は同じ 404 になり、所有者のセッションでも 404 になる

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `answers an unlisted, a missing and a malformed id with the same 404, even for the owner`

- [x] AT-I: キャッシュに画像があっても、投稿の削除・非公開化・アカウント削除が KV に伝わった後は配らない。画像のルートはセッションを読まず、KV に書かない

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `does not serve a cached image once %s`（3 通り）/ `never reads the session, so a signed-in browser's thumbnail costs no session write` / `writes nothing to KV`

- [x] AT-J: 公開投稿のページは `og:image`（`?v=` 付き）と幅・高さ・型、`summary_large_image` を出す。公開 origin を知らない deploy では `summary` のまま

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `gives a public submission an OGP card from its stored record (#2995)` / `keeps the small card when the deploy does not know its own origin`、`packages/nest/src/gallery/ogp.test.ts` › `switches to the large card when there is an image`

- [x] AT-K: 描けない文書は 422、PNG 化の失敗は 500 で、どちらもキャッシュに置かない。キャッシュへの格納の失敗や Cache API の無い環境でも画像は返る。フォントは app の `/render` と同じ組を置く（TPL-1799）

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `answers 422 for a document that cannot be drawn, and caches nothing` / `answers 500 when the rasterizer fails, caches nothing, and tries again next time` / `still answers when the cache refuses the image` / `draws every time where the runtime has no Cache API`、`packages/nest/scripts/stage-viewer.test.ts` › `stages exactly the fonts the app's /render loads (TPL-1799)` / `refuses to stage when an OGP font is missing (#2995)`

## 手動確認

- [ ] AT-M1: deploy 済みの nest で公開投稿の URL を Slack・X・GitHub のいずれかに貼ると、タイトルと説明のカードが出る
- [ ] AT-M2: deploy 済みの nest で公開投稿の URL を Slack・X・GitHub のいずれかに貼ると、system view の画像付きの大きなカードが出る。日本語のラベルが豆腐（□）にならない
- [ ] AT-M3: deploy 済みの nest で、`og.png` を一度開いた公開投稿を削除（または非公開に）してから 1 分ほど待って `og.png` を開き直すと 404 になる
