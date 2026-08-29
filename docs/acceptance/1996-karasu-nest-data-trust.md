# AT: karasu-nest のデータ信頼

- **日付**: 2026-08-03（[#2590](https://github.com/kompiro/karasu/issues/2590) の生成廃止に合わせて 2026-08-29 に改訂）
- **関連 Issue**: [#1996](https://github.com/kompiro/karasu/issues/1996)（data-trust）／[#2591](https://github.com/kompiro/karasu/issues/2591)（ギャラリーに必要な文書）／親 [#2578](https://github.com/kompiro/karasu/issues/2578)
- **関連 ADR**: [ADR-1996](../adr/1996-karasu-nest-data-trust.md)、[ADR-2578](../adr/2578-nest-retires-server-side-reverse.md) 決定 6（成立条件を引き継ぐ）
- **関連 TPL**: [TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md)、[TPL-2287](../test-perspectives/TPL-2287-detector-near-misses-are-the-spec.md)、[TPL-2587](../test-perspectives/TPL-2587-author-managed-content-has-no-ttl.md)
- **対象ファイル**:
  - `docs/policy/nest-data-handling.md`（技術的事実の記述と同意文面の案）
  - `scripts/lint/nest-retention-policy-sync.test.ts`（文書とコードの drift ガード）
  - `packages/nest/src/store/gallery-purge-coverage.test.ts`（削除の網羅。#2590 で削除単位が installation からアカウントに変わった）
  - `packages/nest/src/gallery/validate.ts`（資格情報の形をしたものを ingress で拒否する）

> **#2590 で対象が入れ替わった。** ADR-1990 決定 6 が守っていたのは「他人の private コード」で、
> 保持期間・モデルプロバイダ・アンインストール purge がその内訳だった。ADR-2578 決定 6 が守るのは
> 「投稿物と投稿者の識別子」であり、成立条件だという位置づけだけが引き継がれている。
> したがって旧 AT-A〜AT-N はこの記録から消え、下は現在のギャラリーに対する条件である。

> ADR-2578 決定 6 は成立条件であって follow-up ではない。この AT が全部緑でも、**下の
> 「人間がやること」が残っているかぎり条件は満たされていない。** 技術側の緑を「準備完了」と
> 読まないための注記をここに置く。

## 受け入れ条件

- [x] AT-A: **投稿物とアカウント記録に TTL が無い。** 文書がそれを条件（「投稿者が削除するまで」）として述べ、コードにも期限が無い

  > ✅ Automated — `scripts/lint/nest-retention-policy-sync.test.ts` › `keeps a submission until its author deletes it, and says so` / `keeps the account record on the same condition`、`packages/nest/src/store/accounts.test.ts` › `stores no expiry, so an account cannot outlive itself`

- [x] AT-B: 期限を持つのはセッションだけで、その日数が文書と一致する

  > ✅ Automated — `nest-retention-policy-sync.test.ts` › `expires a session, which is the one credential here`、`packages/nest/src/store/sessions.test.ts` › `expires, unlike everything else the gallery stores`

- [x] AT-C: 文書が述べるサイズ上限（投稿物・タイトル）が実装の定数と一致する

  > ✅ Automated — `nest-retention-policy-sync.test.ts` › `states the size limits a submitter is actually held to`

- [x] AT-D: 文書が挙げる各 KV 鍵が purge に配線されている（**一覧が網羅的であることは検証していない** — 新しい prefix が増えたことは機械的に検出できず、`gallery-purge-coverage.test.ts` の seeder 台帳を人が読んで塞ぐ。[TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md)）

  > ✅ Automated — `nest-retention-policy-sync.test.ts` › `names each prefix the purge is wired for (not that the list is complete)`、`packages/nest/src/store/gallery-purge-coverage.test.ts` › `covers every prefix the gallery writes, so a new one is noticed`

- [x] AT-E: アカウント削除で全カテゴリが消え、件数がカテゴリ別に報告される

  > ✅ Automated — `gallery-purge-coverage.test.ts` › `leaves nothing behind when an account is deleted` / `counts what it deleted in every category`

- [x] AT-F: purge が、id がたまたま前方一致する別アカウントを巻き込まない

  > ✅ Automated — `gallery-purge-coverage.test.ts` › `touches nothing belonging to an account whose id merely extends it`、`packages/nest/src/store/accounts.test.ts` › `deletes only the account asked for, not the one whose id extends it`

- [x] AT-G: 削除済みアカウントの生き残ったクッキーが、サインイン状態として読まれない

  > ✅ Automated — `gallery-purge-coverage.test.ts` › `reads a deleted account's surviving cookie as not signed in`

- [x] AT-H: **文書が「repository を読まない」「モデルプロバイダを使わない」と言っており、コードにもそれが無い**（片方だけ変わったら落ちる）

  > ✅ Automated — `nest-retention-policy-sync.test.ts` › `says the service does not read anyone's repository` / `does not claim a model provider is involved`

- [x] AT-I: unlisted の投稿は配信されず、文書もそう言っている。応答は「存在しない」と区別がつかない

  > ✅ Automated — `nest-retention-policy-sync.test.ts` › `says an unlisted submission is withheld, and withholds it`

- [x] AT-J: 資格情報の形をしたものは **ingress で拒否され、保存されない**。メッセージは規則名と位置を言い、一致した値そのものは言わない（**氏名やメールアドレスの規則は無い** — 文書もそう書いている）

  > ✅ Automated — `packages/nest/src/gallery/validate.test.ts` › `refuses a document carrying something credential-shaped` / `names the rule that fired, never the value it matched` / `never puts the matched value in the message, wherever it was found` / `scans the title, which is stored and published like the document`

### 人間がやること（自動化できない・してはいけない）

**この節が終わるまで ADR-2578 決定 6 は満たされていない。** 未了のまま、運用者以外に
ギャラリーを開かない。正本は `docs/policy/nest-data-handling.md` の「未了」節で、
[#2591](https://github.com/kompiro/karasu/issues/2591) が引き取る。ここはその写しである。

#2590 で **2 件が消滅した**: Anthropic との zero-retention 契約（モデルを呼ばない）と、
企業向け DPA の要否判断（他人のデータを処理しない）。あわせて、`PR_DELIVERY` と
`POST /<owner>/<repo>/generate` を前提にしていた旧 H-7・H-9、および ADR-1990 の退避先
（public repo のみへの縮小）を検討する旧 H-8 も、主語ごと消えた。

- [ ] H-1: privacy policy を起草し、**資格のある人間**のレビューを受ける（保持するのは GitHub 識別子と投稿物のみ。`docs/policy/nest-data-handling.md` は素材であって privacy policy ではない）
- [ ] H-2: ToS を起草し、責任制限に加えて**投稿物の権利帰属**についてレビューを受ける
- [ ] H-3: 公開先（docs-site 上の URL）を決め、サインイン画面からの導線を作る
- [ ] H-4: 問い合わせ窓口を決める。削除請求に加えて、**第三者からの取り下げ請求**を受ける先が要る
