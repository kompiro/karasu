# AT: karasu-nest のトークン・レイテンシ計測

- **日付**: 2026-08-02
- **関連 Issue**: [#2226](https://github.com/kompiro/karasu/issues/2226)（metering）／親 [#1990](https://github.com/kompiro/karasu/issues/1990)／gates [#1994](https://github.com/kompiro/karasu/issues/1994)
- **関連 ADR**: [ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md) 決定 3・6
- **関連 design**: [2226-nest-cost-model.md](../design/2226-nest-cost-model.md)
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

- [x] AT-H: 壊れたレコード 1 件がレポート全体を落とさない

  > ✅ Automated — `record.test.ts` › `skips a corrupt record rather than refusing to produce a report`

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

- [x] AT-S: 計測データも purge に含まれる（installation 単位・repo 単位とも）

  > ✅ Automated — `record.test.ts` › `takes cost records with the rest of an installation` / `removes one repo's records when it leaves an installation`、`reads.test.ts` › `takes read buckets with the rest of an installation`

- [x] AT-T: 何も走っていないとき NaN ではなくゼロを返す

  > ✅ Automated — `record.test.ts` › `answers zero rather than NaN when nothing has run`、`metrics.test.ts` › `answers zeroes rather than NaN before anything has run`

### 手動確認（実デプロイでのみ検証可能）

ADR-1990 決定 6 により、#1996 が入るまで他人の private repo には向けない。以下は自分の repo に対してのみ実施する。

- [ ] M-1: `wrangler secret put METRICS_TOKEN` 後、`/healthz` の `bindings.METRICS_TOKEN` が `true` になる
- [ ] M-2: 生成を 1 回走らせたあと `GET /admin/metrics` が `runs: 1` と実測トークン数を返す
- [ ] M-3: レポートの `cost.perRunUsd` が [design doc](../design/2226-nest-cost-model.md) の投影（小規模 約 $12）と同じ桁である
- [ ] M-4: レポートの `duration.p95Ms` が spike の 12〜19 分と同じ桁である
- [ ] M-5: `GET /<owner>/<repo>` を数回叩いたあと `readsPerRun` が増える
- [ ] M-6: App をアンインストールすると `runs` が 0 に戻る（計測データも purge される）
- [ ] M-7: 実測が揃った時点で design doc の投影表を実測表に差し替え、#1994 の quota を再評価する
