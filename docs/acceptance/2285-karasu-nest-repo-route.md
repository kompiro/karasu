# AT: karasu-nest `/<owner>/<repo>` route and independent deploy

- **日付**: 2026-08-02
- **関連 Issue**: [#2285](https://github.com/kompiro/karasu/issues/2285)（nest-side routing + independent deploy）／親 [#1990](https://github.com/kompiro/karasu/issues/1990)
- **関連 ADR**: [ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md)（決定 5: 別 Worker / 決定 6: データ信頼）、[ADR-2249](../adr/2249-permalink-generation-seam.md)（permalink 面と nest の境界）
- **対象ファイル**:
  - `packages/nest/src/routes/repo.ts`（ルート本体）
  - `packages/nest/src/store/nest-store.ts` / `repo-directory.ts`（`owner/repo` → installation + sha の解決）
  - `packages/nest/wrangler.toml`、`.github/workflows/nest-deploy.yml`（独立デプロイ）

> nest ホスト上の `GET /<owner>/<repo>` は、**このサービスが生成した** `.krs` を返す。`karasu.kompiro.dev/<owner>/<repo>`（commit 済み `.krs` の解決）とは別の面であり、実行時に接続されない（ADR-2249）。レンダリングではなく生成物を返すのは、app の可用性をこのルートの契約に含めないため、および inline payload の上限で応答が黙って切られるのを避けるため。

## 受け入れ条件

- [x] AT-A: 生成済みの repo に対し、`.krs` が `text/plain; charset=utf-8` で 200 で返る

  > ✅ Automated — `packages/nest/src/routes/repo.test.ts` › `serves the generated .krs with its provenance`

- [x] AT-B: 応答に由来（`X-Karasu-Source-Sha` / `X-Karasu-Generated-At`）と生成物である旨（`X-Karasu-Generated`）が載る

  > ✅ Automated — `repo.test.ts` › `serves the generated .krs with its provenance`

- [x] AT-C: public / private を問わず `Cache-Control: no-store` である

  > ✅ Automated — `repo.test.ts` › `never lets the response be cached`

- [x] AT-D: URL の大文字小文字にかかわらず同じ生成物に解決する

  > ✅ Automated — `repo.test.ts` › `resolves regardless of casing`

- [x] AT-E: `?format=json` で `owner` / `repo` / `sha` / `generatedAt` / `krs` が返る

  > ✅ Automated — `repo.test.ts` › `serves JSON with the same provenance on request`

- [x] AT-F: 未生成の repo は 404 で、**次の一手**（App のインストール / ローカル reverse ガイド）を示す

  > ✅ Automated — `repo.test.ts` › `404s a repo nothing has been generated for, and says what to do`

- [x] AT-G: GitHub 名として不正な文字列は 404 ではなく 400（`invalid_repo`）を返す

  > ✅ Automated — `repo.test.ts` › `distinguishes a malformed name from a repo with nothing generated`

- [x] AT-H: `/:owner/:repo` の catch-all が `/healthz` を隠さない

  > ✅ Automated — `repo.test.ts` › `does not shadow /healthz`

- [x] AT-I: `KRS_CACHE` binding 未設定のデプロイは 500 ではなく 503（`not_configured`、binding 名入り）を返す

  > ✅ Automated — `repo.test.ts` › `refuses rather than 500s when the cache binding is missing`

- [x] AT-J: HEAD はヘッダのみ（本文なし）で返る／未対応メソッドは `Allow` 付きの 405

  > ✅ Automated — `repo.test.ts` › `answers HEAD with the headers and no body` / `405s a method the route does not serve`

- [x] AT-K: installation のアンインストール相当（`purgeInstallation`）で、生成物と `owner/repo` ポインタの**両方**が消える

  > ✅ Automated — `packages/nest/src/store/nest-store.test.ts` › `removes documents and pointers together`

- [x] AT-L: 生成物が TTL で先に消えても、ポインタが取り残されない（アンインストール後も「図がある」と言い続けない）

  > ✅ Automated — `nest-store.test.ts` › `expires the pointer with the document, so no orphan outlives an uninstall`

### 手動確認（実デプロイでのみ検証可能）

nest はまだ GitHub App（[#1992](https://github.com/kompiro/karasu/issues/1992)）にも同意文面（[#1996](https://github.com/kompiro/karasu/issues/1996)）にも接続されていない。ADR-1990 決定 6 により、**他者の private repo に向けてはならない**。以下は自分の repo に対する手動生成（`wrangler kv key put`）での確認を想定する。

- [ ] M-1: `wrangler kv namespace create KRS_CACHE` で作った id を `packages/nest/wrangler.toml` に入れ、`Deploy karasu-nest` workflow（`workflow_dispatch`）が成功する
- [ ] M-2: デプロイ後 `GET /healthz` が `bindings.KRS_CACHE: true`、他の secret を `false` で返す
- [ ] M-3: `wrangler secret put GITHUB_APP_ID` 後、`/healthz` の該当 binding が `true` に変わり、**値そのものは応答に出ない**
- [ ] M-4: 生成物が無い状態で `GET /<自分の owner>/<repo>` が 404 を返し、本文の案内リンクから BYO reverse ガイドに到達できる
- [ ] M-5: 手で `.krs` を投入した状態で同じ URL が `.krs` を返し、`X-Karasu-Source-Sha` が投入した SHA と一致する
- [ ] M-6: Pages app（`karasu.kompiro.dev`）の `/`, `/s`, `/render`, `/r/...` が nest のデプロイ後も従来どおり動作する（2 つのデプロイが独立していること）
- [ ] M-7: nest Worker のみをロールバックしても Pages app が影響を受けない
