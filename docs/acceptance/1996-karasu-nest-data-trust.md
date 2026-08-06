# AT: karasu-nest のデータ信頼

- **日付**: 2026-08-03
- **関連 Issue**: [#1996](https://github.com/kompiro/karasu/issues/1996)（data-trust）／親 [#1990](https://github.com/kompiro/karasu/issues/1990)
- **関連 ADR**: [ADR-1996](../adr/1996-karasu-nest-data-trust.md)、[ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md) 決定 6（成立条件）
- **関連 TPL**: [TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md)、[TPL-2287](../test-perspectives/TPL-2287-detector-near-misses-are-the-spec.md)
- **対象ファイル**:
  - `docs/policy/nest-data-handling.md`（技術的事実の記述と同意文面の案）
  - `scripts/lint/nest-retention-policy-sync.test.ts`（文書とコードの drift ガード）
  - `packages/nest/src/store/nest-purge-coverage.test.ts`（削除の網羅）

> ADR-1990 決定 6 は成立条件であって follow-up ではない。この AT が全部緑でも**下の H-1〜H-9（契約・法務文書）が残っている限り条件は満たされていない**。技術側の緑を「準備完了」と読まないための注記をここに置く。

## 受け入れ条件

- [x] AT-A: 文書が述べる保持期間が、実装の定数と一致する（`.krs` 90 日 / run 24 時間 / metrics・reads・quota 400 日）

  > ✅ Automated — `scripts/lint/nest-retention-policy-sync.test.ts` › `states the retention of the generated .krs` / `states the retention of the run status record` / `states the retention of the cost record` / `states the retention of the read counter` / `states the retention of the monthly quota counter`

- [x] AT-B: 同時実行枠の 90 分も文書と一致する

  > ✅ Automated — `nest-retention-policy-sync.test.ts` › `states the concurrency slot's 90 minutes`

- [x] AT-C: 文書が述べる「読む量」の上限が実装と一致する（取得 200 ファイル・200KB／モデルに渡る 60 ファイル・400KB）

  > ✅ Automated — `nest-retention-policy-sync.test.ts` › `states the file limits the model actually sees`

- [x] AT-D: 文書が挙げる各 KV 鍵が purge に配線されている（**一覧が網羅的であることは検証していない** — 新しい prefix が増えたことは機械的に検出できず、`nest-purge-coverage.test.ts` の seeder 台帳を人が読んで塞ぐ。[TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md)）

  > ✅ Automated — `nest-retention-policy-sync.test.ts` › `names each prefix the purge is wired for (not that the list is complete)`、`packages/nest/src/store/nest-purge-coverage.test.ts` › `leaves nothing behind when an installation is removed`

- [x] AT-E: PR-back が既定で無効であることを、文書とコードの両方が言っている（片方だけ変わったら落ちる）

  > ✅ Automated — `nest-retention-policy-sync.test.ts` › `does not claim PR-back is enabled while the switch defaults off`

- [x] AT-F: 生ソースは redact を通さずにモデルへ渡らず、ストアにも残らない（**ログに出ないことは型では担保していない** — 文書もそう書いている）

  > ✅ Automated — `packages/nest/src/generate/run.test.ts` › `redacts before the model sees anything`、`packages/nest/src/meter/record.test.ts` › `keeps no repository content in the body`

- [x] AT-K: **private repository のモデルは配信しない。** 応答は「未生成」と完全に同じで、存在の判別材料にならない

  > ✅ Automated — `packages/nest/src/routes/repo.test.ts` › `does not serve a model generated from a private repository` / `answers a private repository exactly as it answers a missing one`

- [x] AT-L: 可視性が記録されていない旧文書は private として扱う（安全側に倒す）

  > ✅ Automated — `repo.test.ts` › `treats a document with no recorded visibility as private`、`packages/nest/src/store/krs-cache.test.ts` › `round-trips an entry`

- [x] AT-M: 配信を拒否した読み取りは計数しない

  > ✅ Automated — `repo.test.ts` › `does not count a read it refused`

- [x] AT-N: 文書が「private は配信しない」と言っていることを機械検証する（コードだけ変えて文書が古くなる事故を防ぐ）

  > ✅ Automated — `scripts/lint/nest-retention-policy-sync.test.ts` › `says a private repository's model is not served`

- [x] AT-G: アンインストールで全カテゴリが消え、件数が報告される

  > ✅ Automated — `nest-purge-coverage.test.ts` › `counts what it deleted in every category, so a webhook can say so`、`packages/nest/src/routes/webhook.test.ts` › `purges everything an installation produced when it is uninstalled`

- [x] AT-H: suspend もアンインストールと同じ扱いで purge する

  > ✅ Automated — `webhook.test.ts` › `purges on suspension too`

- [x] AT-I: purge の失敗は 200 ではなく 500 を返す（GitHub に再送させる）

  > ✅ Automated — `webhook.test.ts` › `reports a failed purge as retryable rather than acknowledging it`

- [x] AT-J: redact の件数が記録され、生成物の PR 本文にも出る

  > ✅ Automated — `run.test.ts` › `writes tokens, wall-clock and input size against the commit`、`packages/nest/src/deliver/pull-request.test.ts` › `says what was read and that it was not kept`

### 人間がやること（自動化できない・してはいけない）

**この節が終わるまで ADR-1990 決定 6 は満たされていない。** 未了のまま `PR_DELIVERY` を設定したり、自分以外の private repo に App を入れたりしない。

- [ ] H-1: Anthropic との zero-retention 契約を締結する、または現行規約で非保持・非学習が担保されることを確認して記録する
- [ ] H-2: privacy policy を起草し、**資格のある人間**のレビューを受ける（`docs/policy/nest-data-handling.md` は素材であって privacy policy ではない）
- [ ] H-3: ToS を起草し、責任制限についてレビューを受ける
- [ ] H-4: 企業向け DPA を引き受けるかどうかを決める
- [ ] H-5: 公開先（docs-site 上の URL）を決め、install prompt からの導線を作る
- [ ] H-6: 削除請求・照会の窓口を決める
- [ ] H-7: H-1〜H-6 が済んだら、GitHub App の権限と install prompt の文面を更新し、その後にはじめて `PR_DELIVERY=on` を検討する
- [ ] H-8: 未了が長期化する場合、ADR-1990 の退避先（public repo のみへの縮小）を別 ADR で検討する
- [ ] H-9: `POST /<owner>/<repo>/generate` に認証が無いため、第三者が他人の installation の月間 quota を消費できる。生成物は返らないので情報漏洩ではないが、いたずらの余地として残っている。認証を足すか、許容として明文化するかを決める
