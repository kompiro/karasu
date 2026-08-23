# AT: 投稿者が自分の投稿をコンソールで管理できる

- **日付**: 2026-08-23
- **関連 Issue**: [#2589](https://github.com/kompiro/karasu/issues/2589)（a console where submitters manage their own models）／親 [#2578](https://github.com/kompiro/karasu/issues/2578)
- **関連 ADR**: [ADR-2578](../adr/2578-nest-retires-server-side-reverse.md)（決定 5: state は nest 側、コンソールは nest 自身が返す）
- **関連 TPL**: [TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md)（全 prefix が purge から到達できる）、[TPL-2587](../test-perspectives/TPL-2587-author-managed-content-has-no-ttl.md)
- **対象ファイル**:
  - `packages/nest/src/routes/console.ts`（一覧・非公開化・差し替え・削除・アカウント削除）
  - `packages/nest/src/gallery/html.ts`（素の form。JS もビルドも無い）

> コンソールが減らすのは**件数であって難易度ではない**。取り下げ請求は 2 系統あり、
> アカウントを持っているのは片方だけである。投稿者本人の「消したい」はボタン 1 つで
> 完結して人手のキューに入らないが、第三者からの申し立て（なりすまし・権利侵害）は
> 申立人がアカウント保持者でないので原理的に self-service できない。残るのは元々
> 少なく元々重い案件だけになり、それらに時間を割けるようになる。

## 受け入れ条件

- [x] AT-A: 一覧に自分の投稿だけが出る（他人のものは出ない）

  > ✅ Automated — `packages/nest/src/routes/console.test.ts` › `lists what the account owns` / `lists nobody else's`

- [x] AT-B: 未サインインの `GET` はサインインへ転送し、`POST` は 401 で答える（フォーム本文を捨てない）

  > ✅ Automated — `packages/nest/src/routes/console.test.ts` › `sends a signed-out visitor to sign in` / `answers 401 rather than redirecting a form POST`

- [x] AT-C: 素の form から `.krs` を投稿でき、ingest と同じ 2 つの検査が走る

  > ✅ Automated — `packages/nest/src/routes/console.test.ts` › `stores a submission from a plain form` / `runs the same two checks ingest runs`

- [x] AT-D: **非公開化が削除より前に置かれている**（可逆な操作が既定に見える）

  > ✅ Automated — `packages/nest/src/routes/console.test.ts` › `offers unlisting before deletion`

- [x] AT-E: 非公開化・再公開が削除なしに往復する

  > ✅ Automated — `packages/nest/src/routes/console.test.ts` › `unpublishes without deleting` / `publishes again, so the control is reversible`

- [x] AT-F: 差し替えで id が変わらず、parse できない差し替えは元を残す

  > ✅ Automated — `packages/nest/src/routes/console.test.ts` › `replaces the document and keeps the id` / `refuses a replacement that does not parse, keeping the old one`

- [x] AT-G: 個別削除は確認を挟み、確認ページが非公開化を可逆な代替として案内する

  > ✅ Automated — `packages/nest/src/routes/console.test.ts` › `asks first, and points at unlisting as the reversible option` / `deletes on the POST and leaves the rest alone`

- [x] AT-H: **アカウント削除が 1 操作**で、投稿・アカウント・セッションのすべてが消える

  > ✅ Automated — `packages/nest/src/routes/console.test.ts` › `is one operation over everything the account owns`、`packages/nest/src/store/gallery-purge-coverage.test.ts` › `leaves nothing behind when an account is deleted`

- [x] AT-I: アカウント削除の確認ページが「何件消えるか」を示す

  > ✅ Automated — `packages/nest/src/routes/console.test.ts` › `says how much is about to go`

- [x] AT-J: アカウント削除後に cookie が破棄される

  > ✅ Automated — `packages/nest/src/routes/console.test.ts` › `clears the cookie, so the browser stops sending a dead credential`

- [x] AT-K: 他人の投稿は閲覧も変更も削除もできない

  > ✅ Automated — `packages/nest/src/routes/console.test.ts` › `refuses to manage a submission the account does not own` / `will not let one account change another's submission`

- [x] AT-L: アカウント削除が他アカウントに波及しない

  > ✅ Automated — `packages/nest/src/routes/console.test.ts` › `leaves another account untouched`

- [x] AT-M: 別オリジンからの状態変更要求をすべて拒否し、何も変えない

  > ✅ Automated — `packages/nest/src/routes/console.test.ts` › `refuses a cross-origin form and changes nothing` / `refuses a cross-origin request and deletes nothing`

## 手動確認

N/A — 自動テストですべて覆っている。
