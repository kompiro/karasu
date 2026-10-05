# AT: ギャラリーの投稿ページが OGP で展開される

- **日付**: 2026-10-01
- **関連 Issue**: [#2995](https://github.com/kompiro/karasu/issues/2995)（投稿ページの OGP）／親 [#2993](https://github.com/kompiro/karasu/issues/2993)
- **関連 ADR**: [ADR-2993](../adr/2993-gallery-client-side-rendering.md)（投稿ページは sandbox の viewer。crawler は `<head>` だけを読む）、[ADR-1801](../adr/1801-karasu-nest-ogp-share-page.md)（app の `/s` の OGP。description の長さの上限を揃える）
- **対象ファイル**:
  - `packages/nest/src/gallery/ogp.ts`（meta タグの組み立て）
  - `packages/nest/src/gallery/validate.ts`（投稿時に最初の system の description を読む）
  - `packages/nest/src/store/submissions.ts`（`description` を保存する）
  - `packages/nest/src/routes/gallery.ts`（公開投稿のページにだけ出す）

この AT はスライス 1（タイトルと説明）を扱う。プレビュー画像（スライス 2）は Design Doc を経て別に足す。

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

## 手動確認

- [ ] AT-M1: deploy 済みの nest で公開投稿の URL を Slack・X・GitHub のいずれかに貼ると、タイトルと説明のカードが出る
