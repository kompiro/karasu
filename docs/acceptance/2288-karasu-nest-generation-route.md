# AT: karasu-nest 生成リクエストと状態照会

- **日付**: 2026-08-02
- **関連 Issue**: [#2288](https://github.com/kompiro/karasu/issues/2288)（generation route）／親 [#1990](https://github.com/kompiro/karasu/issues/1990)
- **関連 ADR**: [ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md) 決定 1・6、[ADR-2262](../adr/2262-karasu-nest-intake.md)（installation gate）
- **関連 TPL**: [TPL-2288](../test-perspectives/2288-background-work-platform-ceiling.md)
- **対象ファイル**:
  - `packages/nest/src/routes/generate.ts`（受付と状態照会）
  - `packages/nest/src/generate/run.ts`（fetch → redact → reverse → publish）
  - `packages/nest/src/generate/dispatch.ts` / `workflow.ts`（実行基盤への受け渡し）
  - `packages/nest/src/store/run-status.ts`（4 状態と stale 判定）

> gate spike の実測は 85 ファイルで 12〜19 分。**この時間を HTTP レスポンスにも `ctx.waitUntil` にも載せられない**（`waitUntil` はレスポンス送出後およそ 30 秒）ことが、この面の設計を決めている。受付は 202 + 状態 URL、実行は Workflow。

## 受け入れ条件

- [x] AT-A: `POST /<owner>/<repo>/generate` は 202 と `Location: /<owner>/<repo>/status` を返し、モデル本体は返さない

  > ✅ Automated — `packages/nest/src/routes/generate.test.ts` › `hands the work to a Workflow and answers 202 with a status location`

- [x] AT-B: 実行は Workflow に渡る（`ctx.waitUntil` には載せない）

  > ✅ Automated — `generate.test.ts` › `hands the work to a Workflow and answers 202 with a status location`（`GENERATE_WORKFLOW.created` を検証）

- [x] AT-C: Workflow インスタンス id は commit で決まり、競合した 2 回目の dispatch は新しい run を作らない

  > ✅ Automated — `generate.test.ts` › `keys the Workflow instance on the commit, so a duplicate cannot start`

- [x] AT-D: 実行中の記録がある間は dispatch せず、SHA 解決も行わない（API 呼び出しを増やさない）

  > ✅ Automated — `generate.test.ts` › `does not dispatch while a fresh run is recorded`

- [x] AT-E: 死んだ run が残した `running` は stale として扱い、再実行できる

  > ✅ Automated — `generate.test.ts` › `retries past a run that went stale`、`packages/nest/src/store/run-status.test.ts` › stale 判定

- [x] AT-F: 状態照会は「未リクエスト / 実行中 / 完了 / 失敗」を区別する（一律 404 にしない）

  > ✅ Automated — `generate.test.ts` › `distinguishes never-requested from not-installed` / `reports a run in flight` / `reports a failure with its recorded reason` / `reports done from the published document, without an installation lookup`

- [x] AT-G: stale な `running` は「実行中」ではなく `failed` として報告する

  > ✅ Automated — `generate.test.ts` › `reports a stale run as failed rather than as still going`

- [x] AT-H: App が入っていない repo は 404 で、private の存在有無を漏らさない

  > ✅ Automated — `generate.test.ts` › `404s a repository no installation can read`

- [x] AT-I: `GENERATE_WORKFLOW` 未設定のデプロイは 500 ではなく 503 で断る

  > ✅ Automated — `generate.test.ts` › `refuses rather than 500s when the Workflow binding is missing`

- [x] AT-J: 生ファイル内容は redact を通ってからしかモデルに渡らない

  > ✅ Automated — `packages/nest/src/generate/run.test.ts` › `redacts before the model sees anything`

- [x] AT-K: 読めない blob が 1 つあっても run 全体を捨てない。全部読めないときは失敗する

  > ✅ Automated — `run.test.ts` › `skips a blob it cannot read rather than discarding the whole run` / `fails when every blob is unreadable, rather than reversing an empty repo`

- [x] AT-L: GitHub 側の truncation と自前のファイル上限を区別して報告する

  > ✅ Automated — `run.test.ts` › `reports a truncated tree rather than implying the whole repo` / `reports its own file cap separately from GitHub's truncation`

- [x] AT-M: 呼び出し側に見せる失敗メッセージは allowlist されたものだけ（runtime 例外の文言は出さない）

  > ✅ Automated — `run.test.ts` › `passes through a message this codebase wrote` / `replaces a message from anywhere else`

- [x] AT-N: 失敗した run は publish しない

  > ✅ Automated — `run.test.ts` › `does not publish anything when the reverse fails`

### 手動確認（実デプロイでのみ検証可能）

GitHub App と LLM の secret が未設定なので、以下は App 登録後に実施する。
ADR-1990 決定 6 により、**#1996（data-trust）が入るまで他人の private repo には向けない**。

- [ ] M-1: `wrangler deploy` 後、`/healthz` の `bindings.GENERATE_WORKFLOW` が `true` になる
- [ ] M-2: 自分の repo で `POST /<owner>/<repo>/generate` → 202 が返り、Cloudflare の Workflows 画面にインスタンスが 1 つ現れる
- [ ] M-3: 12〜19 分ポーリングして `state` が `running` → `done` に遷移し、`GET /<owner>/<repo>` が `.krs` を返す（＝ 30 秒で切れないことの実証）
- [ ] M-4: 同じ repo に対して連続 2 回 POST しても Workflows 画面のインスタンスが 1 つのままである
- [ ] M-5: 実行中に Worker を再デプロイしても run が完走する（Workflow がリクエストから独立していることの実証）
- [ ] M-6: 存在しない repo に POST すると 404 が返り、応答から repo の存在有無が判別できない
