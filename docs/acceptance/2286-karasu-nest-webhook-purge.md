# AT: karasu-nest GitHub webhook receiver と uninstall purge

- **日付**: 2026-08-02
- **関連 Issue**: [#2286](https://github.com/kompiro/karasu/issues/2286)（webhook + purge）／親 [#1990](https://github.com/kompiro/karasu/issues/1990)
- **関連 ADR**: [ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md) 決定 6（uninstall = purge は成立条件であって follow-up ではない）
- **対象ファイル**:
  - `packages/nest/src/routes/webhook.ts`（受付・イベント振り分け）
  - `packages/nest/src/github/webhook-signature.ts`（署名検証）
  - `packages/nest/src/store/nest-store.ts`（purge の実体）
  - `packages/nest/src/router.ts`（literal ルートが catch-all に食われないこと）

> `POST /webhooks/github` は、この面が「アンインストールで消える」と言えるようにするための唯一の配線。署名検証は**生のリクエストバイト**に対して行い、比較は `crypto.subtle.verify`（constant-time）で行う。

## 受け入れ条件

- [x] AT-A: `installation.deleted` でそのインストールの生成物とポインタが両方消え、他のインストールは無傷である

  > ✅ Automated — `packages/nest/src/routes/webhook.test.ts` › `purges everything an installation produced when it is uninstalled`

- [x] AT-B: `installation.suspend` でも purge する（取り消し可能でも、消えるのは再生成できる派生物のほう）

  > ✅ Automated — `webhook.test.ts` › `purges on suspension too`

- [x] AT-C: `created` / `unsuspend` / `new_permissions_accepted` では purge しない

  > ✅ Automated — `webhook.test.ts` › `does not purge on an installation event that is not a revocation` / `does not purge on unsuspend` / `does not purge on new_permissions_accepted`

- [x] AT-D: `installation_repositories.removed` は外された repo だけを purge する

  > ✅ Automated — `webhook.test.ts` › `purges only the repositories removed from an installation`

- [x] AT-E: 一覧に鍵にできない名前が混じっても、残りの purge は完了する

  > ✅ Automated — `webhook.test.ts` › `finishes the list when one removed name is unusable`

- [x] AT-F: 同じ配信を 2 回受けても安全（GitHub の at-least-once 配信と再送ボタン）

  > ✅ Automated — `webhook.test.ts` › `is idempotent, so a redelivery is safe`

- [x] AT-G: 署名が無い／別 secret で作られている配信は 401 で、**ストアに触れない**

  > ✅ Automated — `webhook.test.ts` › `rejects an unsigned delivery without touching the store` / `rejects a delivery signed with the wrong secret`

- [x] AT-H: 署名が失敗した理由を応答が漏らさない（欠落と不一致が同じ応答）

  > ✅ Automated — `webhook.test.ts` › `says nothing about why a signature failed`

- [x] AT-I: `GITHUB_WEBHOOK_SECRET` 未設定のデプロイは、検証できないものを受理せず 503 を返す

  > ✅ Automated — `webhook.test.ts` › `refuses rather than accepting anything when the secret is not configured`

- [x] AT-J: 署名前に読み込むボディに上限があり、超過は 413（宣言長・実長の両方で）

  > ✅ Automated — `webhook.test.ts` › `refuses a body larger than it will buffer, before verifying anything` / `refuses an oversized body that declared no length`

- [x] AT-K: purge 失敗は 200 ではなく 500 を返す（GitHub に再送させる）

  > ✅ Automated — `webhook.test.ts` › `reports a failed purge as retryable rather than acknowledging it`

- [x] AT-L: purge が途中で落ちたとき、ポインタが先に消えている（「図がある」と言い続ける状態を作らない）

  > ✅ Automated — `webhook.test.ts` › `fails towards invisibility when the purge dies part-way through`

- [x] AT-M: 扱わないイベントは 200 で ack する（再送地獄でエンドポイントを無効化させない）

  > ✅ Automated — `webhook.test.ts` › `acknowledges an event it does not handle`

- [x] AT-N: 署名検証は生バイトに対して行う（再シリアライズしたボディは検証を通らない）

  > ✅ Automated — `packages/nest/src/github/webhook-signature.test.ts` › `is sensitive to key order, so a re-serialised body does not verify`

- [x] AT-O: `GET /webhooks/github` は catch-all の 404 ではなく 405 を返す

  > ✅ Automated — `webhook.test.ts` › `is not shadowed by the /<owner>/<repo> route`、`packages/nest/src/router.test.ts` › `does not let a capture answer for a path a literal route owns`

### 手動確認（実デプロイでのみ検証可能）

GitHub App が未登録なので、以下は App を作ったあとに実施する。

- [ ] M-1: `wrangler secret put GITHUB_WEBHOOK_SECRET` 後、`/healthz` の `bindings.GITHUB_WEBHOOK_SECRET` が `true` になる
- [ ] M-2: GitHub App の設定画面から Ping を送ると 200 が返り、Deliveries に成功が記録される
- [ ] M-3: 自分の repo に App をインストール → `.krs` を手で投入 → App をアンインストールすると、`GET /<owner>/<repo>` が 404 に戻る
- [ ] M-4: GitHub の Deliveries 画面から同じ配信を再送しても 200 が返る
- [ ] M-5: secret を意図的に変更して配信すると 401 になり、Deliveries に失敗が記録される
- [ ] M-6: インストール対象 repo を 1 つ外すと、その repo だけが 404 に戻り、他の repo は引き続き返る
