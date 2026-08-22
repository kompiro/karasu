# AT: docs サイトの変更を PR 上で読める

- **日付**: 2026-08-17
- **関連 Issue**: [#2260](https://github.com/kompiro/karasu/issues/2260)
- **設計 (ADR)**: [ADR-2260](../adr/2260-docs-site-pr-preview.md)
- **Related TPLs**:
  [TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)（本 AT が preview URL を焼き付けない理由）、
  [TPL-2253](../test-perspectives/TPL-2253-removal-sweep-needs-a-search-not-a-file-list.md)（trigger を 2 本目の手書きリストで閉じない）
- **対象ファイル**:
  - `.github/workflows/docs-preview.yml`（PR ごとのデプロイと後始末）
  - `packages/docs-site/wrangler.toml`（deploy 元ディレクトリと upload 先）
  - `scripts/lint/docs-site-ci-paths-sync.ts`（公開集合 ↔ `paths:` の drift ガード）

## 概要

docs サイトは `docs/` から生成される（`PUBLISHED_EN_FILES` の集合を `sync.ts` が取り込む）
ため、生成物は git に入っていない。`pages.yml` は main への push でのみデプロイするので、
レビュアーが読めるのは入力の markdown だけで、**レンダリング結果を初めて見るのはマージ後**
だった。

`docs-preview.yml` は PR ごとに docs サイトを Cloudflare Pages（`karasu-docs` プロジェクト）
へデプロイする。本番と同じビルド・同じ `base: "/karasu/"` を使い、`dist/` を `karasu/`
サブディレクトリへ置いてからアップロードすることで、**本番と同一の routing** を再現する。
その代償として preview の URL は app より 1 階層深い（`…pages.dev/karasu/`）。

## 受け入れ条件

### AC-1: 公開対象の doc を触る PR が preview を得る

- [x] 公開集合のすべての doc が `docs-preview.yml` の `paths:` のいずれかに一致する
  > ✅ Automated — `scripts/lint/docs-site-ci-paths-sync.test.ts` › `the committed workflows` › `cover every published doc and mirror each other`（`docs-preview.yml` と `reference-docs-check.yml` の両方について検査する）

- [x] `.ja.md` 兄弟ファイルも trigger 対象に含まれる（ja だけの編集でもサイトは変わる）
  > ✅ Automated — `scripts/lint/docs-site-ci-paths-sync.test.ts` › `the committed workflows` › `include the ja siblings, which a ja-only edit is the only way to change`

- [x] サイトが公開しないものだけを触る PR ではデプロイしない
  > ✅ Automated — `scripts/lint/docs-site-ci-paths-sync.test.ts` › `the docs preview deployment` › `does not fire for a change outside what the site publishes`

- [x] gallery の元になる `examples/**` も trigger 対象に含まれる（`sync.ts` が `.krs` をページへレンダリングする）
  > ✅ Automated — `scripts/lint/docs-site-ci-paths-sync.test.ts` › `the docs preview deployment` › `triggers on the examples the gallery pages are rendered from`

### AC-2: 本番と同じ routing を再現する

- [x] ステージング先が wrangler の upload ディレクトリと一致し、`karasu/` 一段下に置かれる
  > ✅ Automated — `scripts/lint/docs-site-ci-paths-sync.test.ts` › `the docs preview deployment` › `stages the build into the directory wrangler is configured to upload`

- [x] root の redirect は bare root のみで、`/*` splat ではない（base path が欠けたリンクは preview でも 404 のまま）
  > ✅ Automated — `scripts/lint/docs-site-ci-paths-sync.test.ts` › `the docs preview deployment` › `redirects the bare root only, so a missing base path still 404s`

### AC-3: app の preview と混ざらない

- [x] wrangler は `packages/docs-site` から実行され、root の `functions/[[path]].ts`（静的アセットより先に走る catch-all）を拾わない
  > ✅ Automated — `scripts/lint/docs-site-ci-paths-sync.test.ts` › `the docs preview deployment` › `runs wrangler from packages/docs-site, away from the root functions/ catch-all`

- [x] PR クローズ時の後始末が `karasu-docs` を対象にする（app の `karasu` ではない）
  > ✅ Automated — `scripts/lint/docs-site-ci-paths-sync.test.ts` › `the docs preview deployment` › `cleans up its own project, not the app's`

- [x] secret を持つデプロイジョブが GitHub-hosted runner に留まる（ADR-1890）
  > ✅ Automated — `scripts/ci/workflow-runner-policy.test.ts` › `GitHub Actions runner policy (ADR-1890)` › `runs exactly the compute-bound jobs on Ubicloud`

- [x] secret を読めない PR（fork / bot）では deploy も cleanup も skip され、赤くならない
  > ✅ Automated — `scripts/lint/docs-site-ci-paths-sync.test.ts` › `the docs preview deployment` › `skips rather than fails where the deployment secrets are unreachable`

## 手動確認

判定に実デプロイが要るものだけを残す。**到達先はこの記録に書かない** — preview URL は
ブランチごとに変わり、記録より寿命が短いため（TPL-2254）。docs を触る PR の Actions
run summary（"Docs preview deployed" の表）に出た `…/karasu/` を開いて確認する。

- [ ] `docs/spec/**` を触る PR で deploy job が走り、`/karasu/spec/syntax/` がレンダリングされる
- [ ] 両ロケールが解決する（`/karasu/…` と `/karasu/ja/…`）
- [ ] サイドバー・見出し・テーブルが本番と同じに見える
- [ ] preview 内の内部リンクをクリックしても preview 内に留まる（公開サイトへ飛ばない）
- [ ] deployment URL のルート（`…pages.dev/`）を開くと `/karasu/` へリダイレクトされる
- [ ] PR をクローズすると、そのブランチの deployment が消える

## 補足

- ステージングの routing は実測で確認済み。`dist/` を `karasu/` 配下へ置いて静的サーバで
  serve すると `/karasu/`・`/karasu/concepts/`・`/karasu/spec/glossary/`・
  `/karasu/ja/tools/cli/`・`_astro` の CSS がすべて 200 を返し、base path を欠いた
  `/concepts/` は 404 のままだった。preview が routing のバグを隠さないことがこの 404 で示される。
- `docs-preview.yml` の `build` は `sync && check-links && astro build` なので、リンク切れは
  このジョブでも落ちる。ただし `reference-docs-check.yml` 側のガードは置き換えない — preview が
  構成されていない PR でも走る必要がある（[#2257](https://github.com/kompiro/karasu/issues/2257)）。
- 前提として Cloudflare Pages プロジェクト `karasu-docs` が存在し、`CLOUDFLARE_API_TOKEN` が
  そこへ到達できる必要がある。app の `karasu` は共有できない（デプロイがアセット集合を丸ごと
  置き換えるため）。
