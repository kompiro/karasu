# AT: bare `/<owner>/<repo>` permalink route（`/r/` prefix の廃止）

- **日付**: 2026-08-02
- **関連 Issue**: [#1961](https://github.com/kompiro/karasu/issues/1961)（親 #1828 permalink layer / epic #1826）
- **設計 (ADR)**: [ADR-2249](../adr/2249-permalink-generation-seam.md)（`.krs` が無い miss は案内ページ / permalink 面は生成しない）、[ADR-1828](../adr/1828-repo-backed-ref-pinned-permalink.md)（repo-backed resolver 本体）
- **関連 ADR**: [ADR-1801](../adr/1801-karasu-nest-ogp-share-page.md)（unit-tested builder + 薄い Function アダプタの分割）、[ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md)（生成は karasu-nest の責務）
- **Related TPLs**: [TPL-1961](../test-perspectives/TPL-1961-catch-all-route-inverts-default.md)（既定を反転させる catch-all は、反転しない側の経路を判別子か機械チェックで固定する）、[TPL-2249](../test-perspectives/TPL-2249-resolution-stays-deterministic.md)（解決に生成・パーソナライズを混ぜない）、[TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)（trust boundary の入力検証）、[TPL-1480](../test-perspectives/TPL-1480-consistency-check-triggers-on-both-sides.md)（整合チェックは両側の変更で起動させる）
- **対象ファイル**:
  - `packages/app/src/routes.ts`（予約セグメントの単一の出所）／`packages/app/src/hooks/useProjectNavigation.ts`（SPA ルートを同じ定数から導出）
  - `packages/app/src/render/bare-route.ts`（guard・outcome 分類・`Cache-Control`・`/r/` 書き換え）
  - `packages/app/src/render/no-krs-page.ts`（案内ページ）
  - `functions/[[path]].ts`（bare route アダプタ）／`functions/r/[[path]].ts`（301 に縮退）
  - `packages/app/public/_routes.json`（Function を起動させる経路の限定）

> `github.com/<owner>/<repo>` の **host を差し替えるだけ**で karasu が開く。prefix を覚える必要をなくすのが目的で、`/r/` は 301 に縮退する。`.krs` が無い repo は SPA に化けず、状態と次の一手を示す案内ページを返す（ADR-2249）。root catch-all は静的アセットより先に走るため、**permalink でないものはすべて `context.next()` で SPA に戻す**ことが実装の中心。

## 受け入れ条件

### AC-1: bare 形が解決する（host 差し替えだけで届く）

- [x] AT-A: ref 省略の `…/<owner>/<repo>/<path>.krs` が default branch HEAD を解決して `/s?s=…` へ 302 する

  > ✅ Automated — `packages/app/src/render/bare-route.test.ts` › `matchBarePermalink` › `matches a bare owner/repo (ref omitted → default branch)` ＋ `classifyResolveOutcome` › `redirects a resolved model`

- [x] AT-B: `@<ref>` を付けた形も解決し、full 40-hex SHA のときだけ `immutable` キャッシュになる

  > ✅ Automated — `packages/app/src/render/bare-route.test.ts` › `redirectCacheControl` › `caches a full-SHA redirect immutably` / `lets the edge hold a mutable redirect but makes the browser revalidate`

- [x] AT-C: percent-encode された `%40` も ref 区切りとして解釈される（`url.pathname` は復号されないため、guard の前に decode する）

  > ✅ Automated — `packages/app/src/render/bare-route.test.ts` › `decodePathname` › `decodes percent-encoding so %40 is seen as the ref separator`

### AC-2: 既定が反転しない（catch-all が SPA を飲み込まない）

- [x] AT-D: 予約セグメント（`projects` / `s` / `render` / `r` / `api` / `assets` / `fonts`）で始まる経路を guard が必ず辞退する

  > ✅ Automated — `packages/app/src/render/bare-route.test.ts` › `matchBarePermalink` › `declines every reserved top-level segment`

- [x] AT-E: 1 セグメントのパス、および owner/repo の文字種に合わない経路を辞退する

  > ✅ Automated — `packages/app/src/render/bare-route.test.ts` › `matchBarePermalink` › `declines a single segment — nothing to address a repo with` / `declines owners GitHub could never issue` / `declines a repo name outside GitHub's charset`

- [x] AT-F: `.krs` で終わらない多セグメント経路（`/docs/getting-started/intro` 等）は案内ページではなく **SPA に戻す**（resolver の 400 は「そもそも permalink ではない」の意）

  > ✅ Automated — `packages/app/src/render/bare-route.test.ts` › `classifyResolveOutcome` › `passes a 400 back to the SPA instead of signposting it`

- [x] AT-G: 予約リスト・`_routes.json` の `exclude`・SPA のルート定義が 1 箇所から導出され、片方だけ増えたら落ちる

  > ✅ Automated — `packages/app/src/routes-config.test.ts` › `_routes.json` › `excludes the SPA route /projects/*` ほか、`SPA project route` › `is built from the same segment the guard reserves`

### AC-3: `.krs` が無い repo は案内ページ（ADR-2249）

- [x] AT-H: 解決できなかった repo に 200 の案内ページを返し、BYO reverse 手順への導線を含む

  > ✅ Automated — `packages/app/src/render/no-krs-page.test.ts` › `buildNoKrsPage` › `answers 200, because a missing model is the page's content and not a failure` / `points at the reverse-engineering guide as the next step`

- [x] AT-I: 案内ページは **repo の実在を主張しない**（GitHub raw は「repo が無い」と「`.krs` が無い」を同じ 404 で返し、区別には ADR-1828 が禁じる API hop が要る）

  > ✅ Automated — `packages/app/src/render/no-krs-page.test.ts` › `buildNoKrsPage` › `does not assert that the repository exists`

- [x] AT-J: 明示 `@<ref>` 付きで解決できない場合は案内ページに飲ませず **エラーを表示**する

  > ✅ Automated — `packages/app/src/render/bare-route.test.ts` › `classifyResolveOutcome` › `shows the error for 400/404 when a ref WAS pinned`

- [x] AT-K: upstream の 502 / 500 は案内ページにしない（障害を「モデルが無い」と偽らない）

  > ✅ Automated — `packages/app/src/render/bare-route.test.ts` › `classifyResolveOutcome` › `never signposts a transient failure`

### AC-4: `/r/` の廃止と互換

- [x] AT-L: `/r/<rest>` が bare 形へ 301 する。`/r` 単体は `/` へ。`r` で始まる owner（`/rails/rails`）は書き換えない

  > ✅ Automated — `packages/app/src/render/bare-route.test.ts` › `bareTargetForLegacyPrefix`

### AC-5: 今日動いている経路が不変（実測）

> 下記 AT-M〜AT-P は `wrangler pages dev packages/app/dist`（wrangler 4.118.0 / workerd 1.20260730.1、実 Pages ルーティング）に対する `curl` で確認済み。**実測値**: `/`・`/projects/my-project`・`/nope`・`/docs/getting-started/intro`・`/guide/boundary/design`・`/kompiro/karasu/docs/foo.txt`・`/%ZZ/bad` → SPA、`/favicon.svg`・`/assets/<chunk>.js` → 静的、`/s`・`/render` → 400、`/nope/deeper`・`/kompiro/karasu` → 案内ページ、`…/index.krs` と `…/index.krs@<sha>` → 302 `/s?s=`、`/kompiro/karasu@<sha>` → 404、`/r/…@<sha>` → 301。CI テストではなく手動 curl 検証のため box は `[ ]` のままにする（canonical marker 規約: `[x]` は自動テスト裏付けを要する）。

- [ ] AT-M: `/`・静的アセット・`/s`・`/render` が従来と同じ応答を返す
- [ ] AT-N: `/projects/<id>` を直接開いて（リロード相当）SPA が返る
- [ ] AT-O: 未知の 1 セグメント／非 `.krs` パスが SPA fallback に落ちる
- [ ] AT-P: 不正な percent-encoding（`/%ZZ/bad`）が 500 にならず SPA に落ちる

### AC-6: 本番 Pages でのみ確認できる項目

- [ ] AT-Q: **手動** — preview deployment で `_redirects` の SPA fallback が効くこと。`wrangler pages dev` は `/* /index.html 200` を "Infinite loop detected" として無視するため、local と本番で fallback の経路が異なる
- [ ] AT-R: **手動** — preview deployment で `/assets/*` が Function を起動しないこと（`_routes.json` の exclude が honor されること）。起動すると 1 ページロードあたり数十の invocation を消費する
- [ ] AT-S: **手動** — bare permalink を開いた画面が `/r/` 時代と同じモデル・同じ drill-down で描画されること（HTTP chain は AC-5 で確認済み、残りは目視）
