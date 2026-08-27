# AT: karasu-nest が投稿者を GitHub で認証し、セッションを持つ

- **日付**: 2026-08-23
- **関連 Issue**: [#2586](https://github.com/kompiro/karasu/issues/2586)（GitHub login and a session）／親 [#2578](https://github.com/kompiro/karasu/issues/2578)
- **関連 ADR**: [ADR-2578](../adr/2578-nest-retires-server-side-reverse.md)（決定 5: state と secret は nest 側に置く）、[ADR-2262](../adr/2262-nest-intake-and-completion.md)（個人データの線）
- **関連 TPL**: [TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md)（新しい key prefix は purge から到達できる）、[TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)
- **対象ファイル**:
  - `docs/policy/nest-data-handling.md` / `scripts/lint/nest-retention-policy-sync.test.ts`（保持の記述と drift ガード）
  - `packages/nest/src/auth/oauth.ts`（authorize URL・code 交換・`GET /user`）
  - `packages/nest/src/auth/session.ts`（cookie の属性と読み取り）
  - `packages/nest/src/routes/auth.ts`（`/auth/login` `/auth/callback` `/auth/logout`）
  - `packages/nest/src/store/{gallery-keys,accounts,sessions,gallery-store}.ts`

> ギャラリーが認証するのは**投稿者本人**であって、repository に対する権限ではない。
> 投稿は repository に紐づかないので証明する対象が無い。ログインが与えるのは
> **凍結できるハンドル**であり、匿名投稿を却下したのはそれが無いと取り下げ請求に
> 応じる相手も荒らしを止める手段も存在しないため。

## 受け入れ条件

- [x] AT-A: `GET /auth/login` が GitHub の同意画面へ転送し、送った `state` を cookie に残す

  > ✅ Automated — `packages/nest/src/routes/auth.test.ts` › `redirects to GitHub and remembers the state it sent`

- [x] AT-B: scope を要求しない（識別子と login 名しか使わないため）

  > ✅ Automated — `packages/nest/src/auth/oauth.test.ts` › `asks for no scopes, because identity is all the gallery uses`

- [x] AT-C: callback が正しく完了するとアカウントが作られ、セッション cookie が発行される

  > ✅ Automated — `packages/nest/src/routes/auth.test.ts` › `signs the submitter in and issues a session`

- [x] AT-D: cookie と一致しない `state`、および `state` cookie が無い callback を拒否する

  > ✅ Automated — `packages/nest/src/routes/auth.test.ts` › `refuses a state that does not match the cookie` / `refuses a callback with no state cookie at all`

- [x] AT-E: 失敗した試行でも `state` cookie を消す（単回使用の値を再利用させない）

  > ✅ Automated — `packages/nest/src/routes/auth.test.ts` › `clears the state cookie even when the attempt failed`

- [x] AT-F: GitHub が 200 で返す `error` を失敗として扱い、プロバイダの散文をレスポンスに載せない

  > ✅ Automated — `packages/nest/src/auth/oauth.test.ts` › `treats a 200 carrying an error field as a failure` / `keeps the provider's prose out of the error`

- [x] AT-G: セッション cookie が `__Host-` prefix・`HttpOnly`・`Secure`・`SameSite=Lax`・`Path=/`・`Domain` 無しである

  > ✅ Automated — `packages/nest/src/auth/session.test.ts` › `carries the __Host- prefix, which browsers enforce` / `sets everything __Host- requires, and nothing that would break it` / `is SameSite=Lax, so a cross-site POST carries no session at all`

- [x] AT-H: `POST /auth/logout` がセッションを失効させ、別オリジンからの要求を拒否する

  > ✅ Automated — `packages/nest/src/routes/auth.test.ts` › `revokes the session and clears the cookie` / `refuses a request from another origin`

- [x] AT-I: アカウント id は数値（rename されない）で、`42` の purge が `420` に届かない

  > ✅ Automated — `packages/nest/src/store/gallery-keys.test.ts` › `ends the sweepable prefixes with a slash, so 42 cannot reach 420`、`packages/nest/src/store/accounts.test.ts` › `deletes only the account asked for, not the one whose id extends it`

- [x] AT-J: アカウント削除がギャラリーの全 prefix に届く（新しい prefix が増えたら落ちる）

  > ✅ Automated — `packages/nest/src/store/gallery-purge-coverage.test.ts` › `leaves nothing behind when an account is deleted` / `covers every prefix the gallery writes, so a new one is noticed`

- [x] AT-K: 期限切れ・失効済み・偽造の cookie がすべて「未ログイン」として同じに見える

  > ✅ Automated — `packages/nest/src/store/gallery-purge-coverage.test.ts` › `reads a forged cookie as not signed in rather than as an error`

- [x] AT-L: OAuth の資格情報が未設定のデプロイは 503 で binding 名を告げる（黙って劣化しない）

  > ✅ Automated — `packages/nest/src/routes/auth.test.ts` › `refuses to start when the deploy has no OAuth credentials`

- [x] AT-M: `GET /healthz` が新しい binding 3 つの設定有無を報告する（secret 忘れが診断できる）

  > ✅ Automated — `packages/nest/src/app.test.ts` › `serves /healthz`

- [x] AT-N: purge が eventually consistent な再列挙で二重計上せず、消えない prefix では黙って成功せず落ちる

  > ✅ Automated — `packages/nest/src/store/sweep.test.ts` › `counts a re-listed key once` / `fails loudly rather than looping when deletes do not stick`

- [x] AT-O: 新しく保持する 2 つ（アカウント記録・セッション）がデータ取扱文書に載り、実装と機械で突き合っている

  > ✅ Automated — `scripts/lint/nest-retention-policy-sync.test.ts` › `states that the account record has no expiry, and it has none` / `states the session's expiry, which is the one credential here` / `says the identifier is the only personal data, and asks for no scopes`

## 手動確認

- [ ] 🧑 実際の GitHub との往復でサインインが成立する。`https://<nest のホスト名>/auth/login` を開き、
      同意画面で承認したあと、ブラウザの開発者ツールで **`__Host-nest_session` cookie が
      付いていること**を確認する

  > 自動テストは `fetch` を差し替えているので、GitHub 側の登録（callback URL・
  > client id/secret）が実際に噛み合っているかは判定できない。判定そのものに実機が
  > 要る唯一の項目である。
  >
  > **着地先のページは確認対象にしない。** サインインの成立を示すのは cookie であって、
  > その後どこへ転送されるかではない。転送先（`/console`）は [#2589](https://github.com/kompiro/karasu/issues/2589)
  > が作るので、この Issue の時点では 404 になる — 404 を見て「サインインが壊れている」と
  > 読まないように、観測対象を cookie に限っている。
