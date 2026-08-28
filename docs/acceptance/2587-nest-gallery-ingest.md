# AT: karasu-nest が投稿された .krs を検証して預かる

- **日付**: 2026-08-23
- **関連 Issue**: [#2587](https://github.com/kompiro/karasu/issues/2587)（accept, validate and store）／親 [#2578](https://github.com/kompiro/karasu/issues/2578)
- **関連 ADR**: [ADR-2578](../adr/2578-nest-retires-server-side-reverse.md)、[ADR-2077](../adr/2077-reverse-bc-granularity.md)（分解の粒度 — 投稿には適用しない）
- **関連 TPL**: [TPL-2587](../test-perspectives/TPL-2587-author-managed-content-has-no-ttl.md)（作者が管理するコンテンツに期限を置かない）、[TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md)、[TPL-2249](../test-perspectives/TPL-2249-resolution-stays-deterministic.md)
- **対象ファイル**:
  - `docs/policy/nest-data-handling.md` / `scripts/lint/nest-retention-policy-sync.test.ts`（保持の記述と drift ガード）
  - `packages/nest/src/gallery/validate.ts`（parse と structure-only の 2 つだけ）
  - `packages/nest/src/store/submissions.ts`（TTL なし）
  - `packages/nest/src/routes/submit.ts`（`POST /api/submissions`）

> 検証は **2 つだけ**。開けない文書はギャラリーに置く意味が無く、資格情報の形をしたものを
> 載せた投稿は公開せず拒む。**分解の質は投稿者のもの**である — それは投稿者自身の
> システムのモデルであって、サービスが保証する立場にない。

## 受け入れ条件

- [x] AT-A: サインイン済みの投稿者が `.krs` を投稿でき、共有できるアドレスが返る

  > ✅ Automated — `packages/nest/src/routes/submit.test.ts` › `stores a submission and answers with the address to share`

- [x] AT-B: 投稿は `owner/repo` ではなく独立した id 空間に入る（同じアドレスが 2 つのものを指さない）

  > ✅ Automated — `packages/nest/src/routes/submit.test.ts` › `gives the submission its own id space rather than reusing owner/repo`

- [x] AT-C: 未サインイン・偽造 cookie の投稿を拒否し、何も保存しない

  > ✅ Automated — `packages/nest/src/routes/submit.test.ts` › `refuses an anonymous submission` / `refuses a submission carried by a forged cookie`

- [x] AT-D: parse できない `.krs` を拒否し、エラー件数だけを返す（診断本文は返さない）

  > ✅ Automated — `packages/nest/src/routes/submit.test.ts` › `refuses a document that does not parse, and stores nothing`、`packages/nest/src/gallery/validate.test.ts` › `says how many errors there are, not what they are`

- [x] AT-E: 資格情報の形をした文字列を含む `.krs` を拒否し、一致した値をレスポンスに載せない

  > ✅ Automated — `packages/nest/src/gallery/validate.test.ts` › `refuses a document carrying something credential-shaped` / `names the rule that fired, never the value it matched`、`packages/nest/src/routes/submit.test.ts` › `refuses a document carrying something credential-shaped`

- [x] AT-F: 分解の粒度は検査しない（1 つの巨大 domain も通る）

  > ✅ Automated — `packages/nest/src/gallery/validate.test.ts` › `does not judge the decomposition, only that it opens`

- [x] AT-G: **投稿物に TTL を付けない**（作者が管理するコンテンツが黙って消えない）

  > ✅ Automated — `packages/nest/src/store/submissions.test.ts` › `stores no expiry, so author-managed content cannot vanish on its own`

- [x] AT-H: 差し替えても `submittedAt` は保たれ、削除済みの投稿は update で復活しない

  > ✅ Automated — `packages/nest/src/store/submissions.test.ts` › `keeps submittedAt when the document is replaced` / `will not resurrect a deleted submission through an update`

- [x] AT-I: 他人の投稿は読めず、一覧は自分のものだけを新しい順に返す

  > ✅ Automated — `packages/nest/src/store/submissions.test.ts` › `will not hand one account's submission to another` / `lists an account's submissions newest first, and nobody else's`

- [x] AT-J: サイズ上限がバイト単位で効く（マルチバイトのラベルで 3 倍通らない）

  > ✅ Automated — `packages/nest/src/gallery/validate.test.ts` › `measures the cap in bytes, so multibyte labels are not three times the size`、`packages/nest/src/routes/submit.test.ts` › `refuses a body larger than the cap before reading it`

- [x] AT-K: 投稿は本文で名乗ったアカウントではなく、サインイン中のアカウントに紐づく

  > ✅ Automated — `packages/nest/src/routes/submit.test.ts` › `files the submission under the signed-in account, not one named in the body`

- [x] AT-L: `sub/` prefix がアカウント削除から到達できる（新しい prefix が増えたら落ちる）

  > ✅ Automated — `packages/nest/src/store/gallery-purge-coverage.test.ts` › `leaves nothing behind when an account is deleted` / `counts what it deleted in every category`

- [x] AT-M: 構文は正しいが意味的な指摘のある文書（同じ author id の edge 2 本など）を受理する

  > ✅ Automated — `packages/nest/src/gallery/validate.test.ts` › `accepts a document whose only errors are semantic, not syntactic` / `still refuses a document with a real syntax error`

- [x] AT-N: **title も**資格情報スキャンの対象になる（保存・公開される値なので）

  > ✅ Automated — `packages/nest/src/gallery/validate.test.ts` › `scans the title, which is stored and published like the document`

- [x] AT-O: 拒否メッセージがどのフィールドの何行目かを示し、一致した値そのものは載せない

  > ✅ Automated — `packages/nest/src/gallery/validate.test.ts` › `says which field tripped, so the submitter knows where to look` / `gives a line number, because a rule id alone is not actionable` / `names a multi-line rule without inventing a line for it` / `never puts the matched value in the message, wherever it was found`

- [x] AT-P: 転送レベルの拒否（413 `payload_too_large`）と文書の拒否（400 `too_large`）が別のコードになる

  > ✅ Automated — `packages/nest/src/routes/submit.test.ts` › `separates the transport refusal from the document refusal` / `refuses an oversized body even when Content-Length is absent`

- [x] AT-Q: サイズ上限が書き込み側でも成立する（検証を通らない経路からも守られる）

  > ✅ Automated — `packages/nest/src/store/submissions.test.ts` › `refuses to write a document past the cap, whoever asked`

- [x] AT-R: 投稿物の保持がデータ取扱文書に載り、実装と機械で突き合っている

  > ✅ Automated — `scripts/lint/nest-retention-policy-sync.test.ts` › `states that a submission is kept until its author deletes it` / `states the submission size cap a submitter is held to`

## 手動確認

N/A — 自動テストですべて覆っている。
