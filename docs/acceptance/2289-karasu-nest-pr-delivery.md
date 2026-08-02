# AT: karasu-nest の生成物を pull request で届ける

- **日付**: 2026-08-02
- **関連 Issue**: [#2289](https://github.com/kompiro/karasu/issues/2289)（PR-back delivery）／親 [#1990](https://github.com/kompiro/karasu/issues/1990)／consent は [#1996](https://github.com/kompiro/karasu/issues/1996)／ratchet の計測は [#2228](https://github.com/kompiro/karasu/issues/2228)
- **関連 ADR**: [ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md) 決定 4・6、[ADR-2262](../adr/2262-karasu-nest-intake.md)（option C）、[ADR-1829](../adr/1829-adr-permalink-convention.md)（記録は repo にある）
- **対象ファイル**:
  - `packages/nest/src/deliver/pull-request.ts`（ブランチ・ファイル・PR 本文）
  - `packages/nest/src/github/client.ts`（write 系メソッド）
  - `packages/nest/src/generate/run.ts` / `workflow.ts`（配線と off-by-default スイッチ）

> PR-back が progress ページやメールに勝るのは**訂正が repo に残る**から。web ビューで境界を直した人は誰のためにも直していない。

## 受け入れ条件

- [x] AT-A: commit から決まるブランチに `docs/architecture.krs` を置き、default branch に対して PR を開く

  > ✅ Automated — `packages/nest/src/deliver/pull-request.test.ts` › `opens a pull request on a branch named for the commit`

- [x] AT-B: 同じ commit で再実行しても 2 本目の PR を開かない

  > ✅ Automated — `pull-request.test.ts` › `returns the existing pull request rather than opening a second`

- [x] AT-C: 前回の delivery が残したブランチを再利用する（PR が閉じられた／途中で死んだ場合）

  > ✅ Automated — `pull-request.test.ts` › `reuses a branch left behind by an earlier delivery`

- [x] AT-D: ブランチ作成の競合（422）は成功として扱い、それ以外の失敗は握り潰さない

  > ✅ Automated — `pull-request.test.ts` › `tolerates losing a race to create the branch` / `does not swallow a branch creation failure that is not a race`

- [x] AT-E: 既存ファイルがあるときは blob sha を添えて置き換える（409 で落ちない）

  > ✅ Automated — `pull-request.test.ts` › `replaces an existing file rather than failing on a 409`

- [x] AT-F: PR 本文が「これは下書きである」と明言し、訂正方法を示す

  > ✅ Automated — `pull-request.test.ts` › `says it is a draft and how to disagree with it`

- [x] AT-G: PR 本文が domain ごとの confidence を出す（どこから疑うべきかが分かる）

  > ✅ Automated — `pull-request.test.ts` › `reports confidence per domain, so a reader knows what to check first`

- [x] AT-H: summary に `|` が入っても本文の表が壊れない

  > ✅ Automated — `pull-request.test.ts` › `does not break its own table when a summary contains a pipe`

- [x] AT-I: PR 本文が「ソースは保存していない」「redaction が何件あったか」を述べる

  > ✅ Automated — `pull-request.test.ts` › `says what was read and that it was not kept` / `does not imply a redaction happened when none did`

- [x] AT-J: domain が 1 つも出なかった場合も表が成立する

  > ✅ Automated — `pull-request.test.ts` › `names no domain when the reverse identified none`

- [x] AT-K: 生成後に delivery が呼ばれ、直前に publish した内容と domain が渡る

  > ✅ Automated — `packages/nest/src/generate/run.test.ts` › `delivers the model it just published, with the domains it found`

- [x] AT-L: delivery が失敗しても生成物は残り、run は `done` のままである

  > ✅ Automated — `run.test.ts` › `keeps the model when the pull request cannot be opened`

- [x] AT-M: **既定では delivery しない**（`PR_DELIVERY=on` の deploy だけが有効化する）

  > ✅ Automated — `run.test.ts` › `does not deliver at all when no deliverer is wired`、`packages/nest/src/app.test.ts` › `serves /healthz`（`PR_DELIVERY: false` を報告）

- [x] AT-N: 非 ASCII を含む `.krs`（日本語ラベル等）が base64 化で壊れない

  > ✅ Automated — `packages/nest/src/github/client.test.ts` › `base64-encodes UTF-8 content so a Japanese label survives`

### 手動確認（実デプロイでのみ検証可能）

**この節は #1996 が入るまで実施しない。** PR-back は `contents:write` と `pull_requests:write` を要求し、これは ADR-1990 決定 6 が install consent に定めた `contents:read` より広い。同意の文面が無いまま他人の repo に書き込むことになる。

- [ ] M-1: `PR_DELIVERY` 未設定のデプロイでは生成しても PR が開かない（`/healthz` が `false` を報告する）
- [ ] M-2: GitHub App の権限に `contents:write` と `pull_requests:write` を足し、install prompt の文面が #1996 のものに更新されている
- [ ] M-3: 自分の repo で生成すると PR が 1 本開き、`docs/architecture.krs` が入っている
- [ ] M-4: PR 本文の confidence 表が、実際に `@draft` が付いたノードと符合する
- [ ] M-5: 同じ commit で再生成しても PR が 1 本のままである
- [ ] M-6: PR を閉じてから同じ commit で再生成すると、同じブランチに新しい PR が開く
- [ ] M-7: PR をマージしたあと、その repo の `docs/architecture.krs` を karasu の permalink 面から開ける（ratchet が閉じている）
- [ ] M-8: `contents:write` を外した状態で生成すると、モデルはキャッシュに残り `GET /<owner>/<repo>` で読めるが PR は開かない
