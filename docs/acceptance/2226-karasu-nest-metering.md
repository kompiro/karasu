# AT: karasu-nest のトークン・レイテンシ計測

- **日付**: 2026-08-02
- **関連 Issue**: [#2226](https://github.com/kompiro/karasu/issues/2226)（metering）／親 [#1990](https://github.com/kompiro/karasu/issues/1990)／gates [#1994](https://github.com/kompiro/karasu/issues/1994)
- **関連 ADR**: [ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md) 決定 3・6
- **関連 TPL**: [TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md)（新 prefix の purge 配線）、[TPL-2288](../test-perspectives/TPL-2288-background-work-platform-ceiling.md)（器の上限）
- **対象ファイル**:
  - `packages/nest/src/meter/cost.ts`（単価と換算）
  - `packages/nest/src/meter/record.ts`（run 単位の記録と集計）
  - `packages/nest/src/meter/reads.ts`（read 計上）
  - `packages/nest/src/routes/metrics.ts`（`GET /admin/metrics`）

> quota の水準は ADR-1990 が意図的に空けている。この面の役目は**その空欄を埋められる数字を、repo の中身を持ち出さずに**集めること。

## 受け入れ条件

- [x] AT-A: 1 回の生成がトークン・wall-clock・ファイル数・redaction 数を commit 単位で記録する

  > ✅ Automated — `packages/nest/src/generate/run.test.ts` › `writes tokens, wall-clock and input size against the commit`

- [x] AT-B: 記録の本文に repo の内容（パス・中身・redaction 値・`.krs`）が入らない

  > ✅ Automated — `packages/nest/src/meter/record.test.ts` › `keeps no repository content in the body`

- [x] AT-C: 入力サイズは redaction **前**で測る（redaction は縮めるだけ）

  > ✅ Automated — `run.test.ts` › `measures input size before redaction, which only ever shrinks it`

- [x] AT-D: 計測の失敗が生成を失敗させない。metrics store 無しでも動く

  > ✅ Automated — `run.test.ts` › `keeps a model that was produced even if the metric cannot be written` / `runs without a metrics store at all`

- [x] AT-E: パスごとのトークンを保持する（どのパスが高いか言える）

  > ✅ Automated — `run.test.ts` › `writes tokens, wall-clock and input size against the commit`

- [x] AT-F: 集計はモデル別に分ける（異なる単価を合算しない）

  > ✅ Automated — `record.test.ts` › `splits token totals by model, because costs cannot be summed across them`

- [x] AT-G: 平均だけでなく p50 / p95 を返す

  > ✅ Automated — `record.test.ts` › `reports percentiles, not just a mean`

- [x] AT-H: 壊れたレコード 1 件がレポート全体を落とさず、落とした件数を報告する

  > ✅ Automated — `record.test.ts` › `counts a record with no usable summary as skipped, not as a run`

- [x] AT-I: 単価は日付つきスナップショットで、未知モデルは推測せずエラーにする

  > ✅ Automated — `packages/nest/src/meter/cost.test.ts` › `refuses a model it has no price for, rather than guessing` / `dates its prices, so a report is reproducible`

- [x] AT-J: 見積りの丸めは切り上げ（請求を下回らない）

  > ✅ Automated — `cost.test.ts` › `rounds up, so an estimate never lands under the bill`

- [x] AT-K: read の計上はレスポンス経路を遅らせない（`waitUntil`）。生成物が無いときは数えない

  > ✅ Automated — `packages/nest/src/routes/repo.test.ts` › `counts a served model, off the response path` / `does not count a repository it had nothing for`

- [x] AT-L: read は UTC 日でバケットする（KV の同一鍵書き込みレートを避ける）

  > ✅ Automated — `packages/nest/src/meter/reads.test.ts` › `buckets on UTC days, not on local ones`

- [x] AT-M: 数値でないバケットから復帰する

  > ✅ Automated — `reads.test.ts` › `recovers from a bucket that is not a number`

- [x] AT-N: `GET /admin/metrics` は集計のみを返し、repo 名を含まない

  > ✅ Automated — `packages/nest/src/routes/metrics.test.ts` › `names no repository, so the report is not a list of who installed the App`

- [x] AT-O: 認証は bearer token の定数時間比較。欠落と不一致が同じ応答で、前方一致は通らない

  > ✅ Automated — `metrics.test.ts` › `refuses a missing token and a wrong one with the same answer` / `refuses a token that is a prefix of the real one`

- [x] AT-P: 認証前にストアを読まない

  > ✅ Automated — `metrics.test.ts` › `does not read the store before the token is checked`

- [x] AT-Q: `METRICS_TOKEN` 未設定のデプロイは 503

  > ✅ Automated — `metrics.test.ts` › `refuses rather than 500s when no token is configured`

- [x] AT-R: 価格のわからないモデルの支出を黙って落とさず、モデル名を出す

  > ✅ Automated — `metrics.test.ts` › `names a model it cannot price instead of quietly dropping its spend`

- [x] AT-S: 計測データも purge に含まれる。**ファサード経由**で検証する（installation 単位・repo 単位とも）

  > ✅ Automated — `packages/nest/src/store/nest-purge-coverage.test.ts` › `leaves nothing behind when an installation is removed` / `leaves nothing behind when one repo leaves an installation` / `counts what it deleted in every category, so a webhook can say so`
  >
  > 各ストアの `purgeInstallation` を直接呼ぶテスト（`record.test.ts` / `reads.test.ts`）は**配線漏れを検出しない**。実際 `reads/` はこの AT が緑のまま `NestStore` に配線されていなかった（[TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md)）。ここが参照するのは `NestStore` を経由し、purge 後にストアが**空である**ことを見るテストに限る。

- [x] AT-S2: 失敗した試行も課金されるので記録される。同一 commit の複数試行が上書きし合わない

  > ✅ Automated — `packages/nest/src/meter/record.test.ts` › `keeps every attempt at one commit, because every attempt was billed`、`packages/nest/src/generate/run.test.ts` › `records what a failed attempt spent before it threw`

- [x] AT-S3: 集計は list metadata から読み、鍵ごとの `get` を発行しない（Workers の subrequest 上限）

  > ✅ Automated — `record.test.ts` › `reads its totals from list metadata, not by fetching every record`

- [x] AT-S4: read 計数が下限値であることをレポートが明示する

  > ✅ Automated — `packages/nest/src/routes/metrics.test.ts` › `labels the read count as a lower bound rather than letting it read as exact`

- [x] AT-T: 何も走っていないとき NaN ではなくゼロを返す

  > ✅ Automated — `record.test.ts` › `answers zero rather than NaN when nothing has run`、`metrics.test.ts` › `answers zeroes rather than NaN before anything has run`

### 手動確認（実デプロイでのみ検証可能）

ADR-1990 決定 6 により、#1996 が入るまで他人の private repo には向けない。以下は自分の repo に対してのみ実施する。

- [ ] M-1: `wrangler secret put METRICS_TOKEN` 後、`/healthz` の `bindings.METRICS_TOKEN` が `true` になる
- [ ] M-2: 生成を 1 回走らせたあと `GET /admin/metrics` が `runs: 1` と実測トークン数を返す
- [ ] M-3: レポートの `cost.perRunUsd` が構造的上限（`MAX_TOKENS` と `DEFAULT_MAX_BYTES_READ` から導かれる $3.60。算出は [#2226](https://github.com/kompiro/karasu/issues/2226)）を**超えていない**。超えていたら上限定数の理解が誤っている
- [ ] M-4: レポートの `duration.p95Ms` が spike の 12〜19 分と同じ桁である
- [ ] M-5: `GET /<owner>/<repo>` を数回叩いたあと `readsPerRun` が増える
- [ ] M-6: App をアンインストールすると `runs` と `reads` の**両方**が 0 に戻る（`wrangler kv key list` で `metrics/` と `reads/` に鍵が残っていないことも確認する）
- [ ] M-7: 実測が揃った時点で design doc の投影表を実測表に差し替え、#1994 の quota を再評価する
