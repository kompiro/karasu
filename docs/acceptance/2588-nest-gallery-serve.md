# AT: karasu-nest が投稿を id で図として配信する

- **日付**: 2026-08-23
- **関連 Issue**: [#2588](https://github.com/kompiro/karasu/issues/2588)（serve a submission by id, as a diagram）／親 [#2578](https://github.com/kompiro/karasu/issues/2578)
- **関連 ADR**: [ADR-2578](../adr/2578-nest-retires-server-side-reverse.md)、[ADR-2259](../adr/2259-permalink-payload-cap.md)（**この経路には適用されない** — 下記）
- **関連 TPL**: [TPL-2249](../test-perspectives/TPL-2249-resolution-stays-deterministic.md)（解決は決定的である）、[TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)
- **対象ファイル**:
  - `packages/nest/src/gallery/render.ts`（`.krs` → SVG）
  - `packages/nest/src/gallery/html.ts`（エスケープとページ枠）
  - `packages/nest/src/routes/gallery.ts`（`GET /g/:id`）

> **ADR-2259 の 8000 文字上限はこの経路に効かない。** あの上限が縛るのは
> `resolveRepoPermalink` が `.krs` を `/s?s=` に畳み直すことで、制限されているのは
> **URL に載るサイズ**である。ギャラリーは id で配信するので、モデルが URL に載る経路
> そのものが無い。ADR-2259 は app の permalink 面の決定として引き続き有効。

## 受け入れ条件

- [x] AT-A: 図として返る（ソースを返すだけにならない）

  > ✅ Automated — `packages/nest/src/gallery/render.test.ts` › `renders a diagram rather than returning the source`、`packages/nest/src/routes/gallery.test.ts` › `serves an HTML page with the diagram inline`

- [x] AT-B: view 未指定で全 view バンドル、指定すれば単一 view を返す

  > ✅ Automated — `packages/nest/src/gallery/render.test.ts` › `bundles every view when none is named` / `renders a single named view`

- [x] AT-C: `format=svg` / `format=krs` で生の SVG と `.krs` を返す

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `serves the raw SVG and the .krs on request`

- [x] AT-D: 投稿者が付けたタイトルが HTML にエスケープされて出る

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `escapes a title chosen by a stranger`

- [x] AT-E: 非公開の投稿は「存在しない」と**同一の**応答になる（存在確認に使えない）

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `answers 404 for an unlisted submission, exactly as for one that is not there`

- [x] AT-F: 非公開の投稿は本人にだけ見え、別アカウントには見えない

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `shows an unlisted submission to its own author` / `does not show an unlisted submission to a different signed-in account`

- [x] AT-G: 公開投稿だけが共有キャッシュに載り、本人の閲覧は載らない

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `lets a published submission be cached, briefly` / `keeps an owner's own view out of a shared cache`

- [x] AT-H: 壊れた id は 404 で答える（エラーにしない）

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `answers 404 for a malformed id rather than an error`

- [x] AT-I: `/g/:id` と `/:owner/:repo` が互いを覆い隠さない

  > ✅ Automated — `packages/nest/src/routes/gallery.test.ts` › `does not shadow, and is not shadowed by, the repository route`

- [x] AT-J: 8000 文字を超えるモデルも配信できる（ADR-2259 の上限が適用されない）

  > ✅ Automated — `packages/nest/src/gallery/render.test.ts` › `does not cap the model at ADR-2259's inline-share ceiling`

- [x] AT-K: 表示できない文書は 422 で答える（500 にしない）

  > ✅ Automated — `packages/nest/src/gallery/render.test.ts` › `answers 422 for a document that cannot be shown, not 500`

## 手動確認

N/A — 自動テストですべて覆っている。
