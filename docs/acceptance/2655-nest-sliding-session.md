# AT: 使用中のセッションは期限が延び、延びない上限で必ず切れる

- **日付**: 2026-08-31
- **関連 Issue**: [#2655](https://github.com/kompiro/karasu/issues/2655)（slide the session while it is in use, with an absolute cap）／[#2591](https://github.com/kompiro/karasu/issues/2591)（不一致が見つかった文書）／親 [#2578](https://github.com/kompiro/karasu/issues/2578)
- **関連 ADR**: [ADR-2592](../adr/2592-nest-as-a-gallery.md)（決定 5: 保持は日数ではなく条件、セッションだけが期限を持つ）
- **関連 TPL**: [TPL-2655](../test-perspectives/TPL-2655-sliding-expiry-needs-an-unrenewable-cap.md)（延びる期限には延びない上限）、[TPL-2587](../test-perspectives/TPL-2587-author-managed-content-has-no-ttl.md)（資格情報は期限を持つ側）、[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)（同じ事実を述べる 3 文書は drift する）
- **対象ファイル**:
  - `packages/nest/src/store/sessions.ts`（3 定数・読み取り時の上限判定・間引いた延長）
  - `packages/nest/src/store/gallery-store.ts`（`authenticate` が書き込み経路になる。延長は await し、`ctx.waitUntil` には預けない）
  - `packages/nest/src/auth/session.ts`（cookie の `Max-Age` は idle 窓ではなく上限）
  - `docs/policy/nest-data-handling.md` / `nest-privacy.md` / `nest-terms.md`（3 文書とも上限を述べる）

> **この変更が覆したのは、コードコメントに書かれていた決定である。** `sessions.ts` は
> sliding expiry を明示的に却下しており、理由は「認証のたびに KV へ書くのは多すぎる」と
> 「無期限に自分を更新する資格情報こそ上限が止めたいもの」の 2 つだった。どちらも実在
> する反論で、どちらも消えていない — 間引いた延長が前者に、絶対上限が後者に答えている。
> **上限を外すと、却下されていた設計に戻る。**

## 受け入れ条件

- [x] AT-A: 使い続けているセッションが、発行から 30 日で切れない

  > ✅ Automated — `packages/nest/src/store/sessions.test.ts` › `slides while it is in use, so it does not expire 30 days after issue`

- [x] AT-B: 使われなかったセッションは idle 窓（30 日）で切れる

  > ✅ Automated — `packages/nest/src/store/sessions.test.ts` › `expires when nobody uses it, unlike everything else the gallery stores`

- [x] AT-C: 絶対上限を過ぎたセッションは、直前に使っていても拒否される

  > ✅ Automated — `packages/nest/src/store/sessions.test.ts` › `refuses a session past the absolute cap however recently it was used`
  >
  > KV が強制できる期限は idle 窓に使っているので、この判定はストア側の TTL では作れない。
  > テストはレコードを KV へ直接書いて、**延長経路を通らずに現れた**上限超過のレコードを
  > 作っている。上限の残りが KV の TTL 下限（60 秒）を割るときに書き込まないことも
  > `stops refreshing once the cap leaves less room than KV accepts` が別に持つ。

- [x] AT-D: 閾値の内側で認証を繰り返しても、書き込みが増えない

  > ✅ Automated — `packages/nest/src/store/sessions.test.ts` › `does not write again inside the refresh threshold` ／ `packages/nest/src/store/gallery-store.test.ts` › `refreshes a stale session, and leaves a fresh one alone`
  >
  > 元の決定が sliding を却下した理由そのものなので、ストアで見る（Issue の指定）。

- [x] AT-E: この変更より前に書かれたレコード（`refreshedAt` を持たない）が認証を通る

  > ✅ Automated — `packages/nest/src/store/sessions.test.ts` › `reads a record written before refreshedAt existed, treating issuedAt as it`

- [x] AT-F: 延長の書き込みが失敗しても、認証は成功する

  > ✅ Automated — `packages/nest/src/store/gallery-store.test.ts` › `authenticates even when the refresh write fails`
  >
  > 判定できない時刻（`Invalid Date`）が渡された場合に上限が消えるのではなく
  > セッションが拒否されることも `refuses the session rather than dropping the cap when now is not a time` が持つ。

- [x] AT-G: cookie の期限が、延長後のセッションに届く長さになっている

  > ✅ Automated — `packages/nest/src/auth/session.test.ts` › `carries the absolute cap, not the idle window, so the session can slide`
  >
  > ストアだけ延ばしても、cookie の `Max-Age` が idle 窓のままならブラウザが発行 30 日で
  > cookie を捨て、AT-A が成立しない。

- [x] AT-H: 3 つの文書が新しい挙動を述べており、コードの定数と一致している

  > ✅ Automated — `scripts/lint/nest-retention-policy-sync.test.ts` › `expires a session, which is the one credential here` ／ `does not promise a session that renews itself indefinitely`
  >
  > 後者は #2591 で「発行時から固定」を守っていたガードを**書き換えたもの**である。
  > コードコメントに anchor されているため実装を変えた瞬間に落ち、その失敗が「同じ PR で
  > 文書を直せ」という合図として働いた。守る対象を窓から上限へ移してある。

- [x] AT-I: 固定日付の fixture が上限に近づいて、あとから落ちるテストが無い

  > ✅ Automated — `packages/nest/src/routes/console.test.ts` ／ `gallery.test.ts` ／ `submit.test.ts` ／ `packages/nest/src/store/gallery-purge-coverage.test.ts`（セッションの発行が `new Date()`）、`packages/nest/src/store/sessions.test.ts`（`harness` が KV の fake clock と `now` を揃えて進める）
  >
  > 上限を実時刻で判定する以上、過去の固定日付で発行したセッションは**書いた日は通り、
  > あとで落ちる**。この 4 suite は実際にその状態にあった（[TPL-2655](../test-perspectives/TPL-2655-sliding-expiry-needs-an-unrenewable-cap.md)）。
  > 4 本目（`gallery-purge-coverage.test.ts`）は最初の 3 本を直した後もレビューまで
  > 残っていた — 「固定日付を探す」という作業自体が漏れる種類のものである証拠として
  > ここに残す。

- [x] AT-J: 延長がサインアウト・アカウント削除を巻き戻さない

  > ✅ Automated — `packages/nest/src/store/sessions.test.ts` › `does not bring back a session that was revoked mid-flight` ／ `does not bring back a session the account purge swept` ／ `packages/nest/src/store/gallery-store.test.ts` › `finishes the refresh before returning, so a later deletion wins`
  >
  > **これがこの変更で最も危ない部分である。** `put` は鍵を更新するのと同じ手軽さで
  > 鍵を作るので、削除の後に着地した延長は、削除されたはずのセッションを 30 日の窓付きで
  > 復活させる。`consoleDeleteAccount` は viewer を解決してから purge するため、
  > 延長を `ctx.waitUntil` に預けると同一リクエスト内で競合する。延長は `authenticate`
  > 内で await し、書き込み前にレコードの存在を読み直す。

## 手動確認

N/A — 自動テストですべて覆っている。
