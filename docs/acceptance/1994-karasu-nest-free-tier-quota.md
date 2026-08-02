# AT: karasu-nest の free-tier quota と rate limit

- **日付**: 2026-08-02
- **関連 Issue**: [#1994](https://github.com/kompiro/karasu/issues/1994)（quota + rate limit）／親 [#1990](https://github.com/kompiro/karasu/issues/1990)／gate [#2226](https://github.com/kompiro/karasu/issues/2226)
- **関連 ADR**: [ADR-1994](../adr/1994-karasu-nest-free-tier-quota.md)（水準と根拠）、[ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md) 決定 3・6
- **関連 TPL**: [TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md)（新 prefix の purge 配線）、[TPL-2284](../test-perspectives/TPL-2284-purge-scope-identity-is-canonical.md)（識別子の正規化）
- **対象ファイル**:
  - `packages/nest/src/quota/policy.ts`（水準と、その水準を出した算術）
  - `packages/nest/src/quota/ledger.ts`（月次カウンタと in-flight スロット）
  - `packages/nest/src/quota/gate.ts`（判定）
  - `packages/nest/src/routes/generate.ts`（断り方）
  - `packages/nest/src/generate/workflow.ts`（スロットの返却）

> quota は「断る仕組み」ではなく「サービスが存続するための予算上限」であり、断られた人にモデルを得る道が残っていることまでが要件。

## 受け入れ条件

- [x] AT-A: 使用ゼロの installation は通る

  > ✅ Automated — `packages/nest/src/quota/gate.test.ts` › `allows an installation that has used nothing`

- [x] AT-B: 月の割当を使い切ると 429 で断り、回復日時を返す

  > ✅ Automated — `gate.test.ts` › `refuses once the month's allowance is gone, and says when it comes back`、`packages/nest/src/routes/generate.test.ts` › `refuses once the month's allowance is gone, and points somewhere useful`

- [x] AT-C: 断り文にローカル逆生成ガイドへの導線が入る

  > ✅ Automated — `generate.test.ts` › `refuses once the month's allowance is gone, and points somewhere useful`

- [x] AT-D: 同時実行中は 429 と `Retry-After: 300` で断る

  > ✅ Automated — `generate.test.ts` › `refuses while another generation is running, with a shorter wait`、`gate.test.ts` › `refuses while the deployment is already running one`

- [x] AT-E: quota を capacity より先に判定する（安定した答えを優先する）

  > ✅ Automated — `gate.test.ts` › `checks quota before capacity, so a refusal is one a caller can act on`

- [x] AT-F: 断るときに GitHub API を呼ばない

  > ✅ Automated — `generate.test.ts` › `refuses before spending a GitHub API call`

- [x] AT-G: dispatch した時点で課金し、スロットを取る

  > ✅ Automated — `generate.test.ts` › `charges the installation when a run is dispatched` / `takes a concurrency slot when a run is dispatched`

- [x] AT-H: 既存 run を polling している呼び出しには課金しない

  > ✅ Automated — `generate.test.ts` › `does not charge a caller who is only polling an existing run`

- [x] AT-I: dispatch が重複だった場合は課金を戻す

  > ✅ Automated — `generate.test.ts` › `gives the charge back when the dispatch turns out to be a duplicate`

- [x] AT-J: ある installation の使用量が別の installation を断らない

  > ✅ Automated — `generate.test.ts` › `does not let one installation's usage refuse another`、`gate.test.ts` › `does not let one installation's usage refuse another`

- [x] AT-K: 月が変わると割当が戻る（UTC 暦月）

  > ✅ Automated — `gate.test.ts` › `starts a fresh allowance in the next month` / `buckets on UTC calendar months` / `rolls a December period into the next year`

- [x] AT-L: 0 埋めした installation id が別の quota を買わない

  > ✅ Automated — `packages/nest/src/quota/ledger.test.ts` › `folds a zero-padded installation id onto the same counter`

- [x] AT-M: 同一インスタンスの再取得がスロットを二重に消費しない

  > ✅ Automated — `ledger.test.ts` › `is idempotent for the same instance, so a retry takes no second slot`

- [x] AT-N: 死んだ run のスロットは期限切れとして無視される（デプロイ全体が止まらない）

  > ✅ Automated — `ledger.test.ts` › `ignores a slot whose holder is presumed dead`

- [x] AT-O: in-flight 判定は list metadata から読む（accept 経路に subrequest 上限を持ち込まない）

  > ✅ Automated — `ledger.test.ts` › `reads slots from list metadata, not one fetch per slot`

- [x] AT-P: 数値でないカウンタから復帰する

  > ✅ Automated — `ledger.test.ts` › `recovers from a counter that is not a number`

- [x] AT-Q: 返金は 0 を下回らない

  > ✅ Automated — `ledger.test.ts` › `does not refund below zero`

- [x] AT-R: quota 台帳もアンインストールで消える。installation 4 の purge が 42 を巻き込まない

  > ✅ Automated — `packages/nest/src/store/nest-purge-coverage.test.ts` › `leaves nothing behind when an installation is removed` / `counts what it deleted in every category, so a webhook can say so`、`ledger.test.ts` › `does not let installation 4 sweep installation 42`

- [x] AT-S: repo が 1 つ外れても月の割当は戻らない（quota は installation 単位）

  > ✅ Automated — `nest-purge-coverage.test.ts` › `leaves nothing repo-scoped behind when one repo leaves an installation`

- [x] AT-T: 上限を上書きできる（将来の有料 tier が 2 つ目の gate を要求しない）

  > ✅ Automated — `gate.test.ts` › `honours an overridden limit, so a paid tier needs no second gate`

### 手動確認（実デプロイでのみ検証可能）

ADR-1990 決定 6 により、#1996 が入るまで他人の private repo には向けない。

- [ ] M-1: 自分の repo で 4 回連続 POST すると 4 回目が 429 になり、本文にガイド URL が入っている
- [ ] M-2: 429 の `Retry-After` が翌月 1 日までの秒数と一致する
- [ ] M-3: 実行中に別の repo へ POST すると 429 `busy` が返り、`Retry-After: 300` になる
- [ ] M-4: 実行が完了すると次の POST が通る（`finally` のスロット返却が効いている）
- [ ] M-5: 実行中に Worker を強制再デプロイして run を殺した場合、90 分後にはスロットが空く（期限切れの床が効いている）
- [ ] M-6: `GET /admin/metrics` の `runs` と quota の消費数が一致する（失敗した試行も両方に数えられている）
- [ ] M-7: アンインストール後に再インストールすると月の割当が戻っている（ADR-1994 が受け入れた副作用の確認）
