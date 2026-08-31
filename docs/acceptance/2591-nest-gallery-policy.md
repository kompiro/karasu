# AT: 投稿を受け付ける面に必要な文書が揃っている

- **日付**: 2026-08-23
- **関連 Issue**: [#2591](https://github.com/kompiro/karasu/issues/2591)（policy documents a submission surface needs）／[#1996](https://github.com/kompiro/karasu/issues/1996)／親 [#2578](https://github.com/kompiro/karasu/issues/2578)
- **関連 ADR**: [ADR-2578](../adr/2578-nest-retires-server-side-reverse.md)、[ADR-1996](../adr/1996-karasu-nest-data-trust.md)、[ADR-2262](../adr/2262-nest-intake-and-completion.md)（個人データの線）
- **関連 TPL**: [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)（二重管理は drift する）、[TPL-2587](../test-perspectives/TPL-2587-author-managed-content-has-no-ttl.md)
- **対象ファイル**:
  - `docs/policy/nest-data-handling.md`（技術的事実。2 つの草案の材料）
  - `docs/policy/nest-privacy.md` / `docs/policy/nest-terms.md`（草案）
  - `scripts/lint/nest-retention-policy-sync.test.ts`（3 文書をコードに突き合わせる）

> **この AT が全部緑でも、ギャラリーを運用者以外に開いてよいことにはならない。**
> 草案は草案であって、法務レビューが残っている。緑なのは「文書が実装と一致している」
> ことであって、「公開してよい」ことではない — その区別を消さないためにこの注記を置く。

## 受け入れ条件

- [x] AT-A: 保持を日数ではなく条件で述べ、実装に TTL が無いことと一致している

  > ✅ Automated — `scripts/lint/nest-retention-policy-sync.test.ts` › `keeps a submission until its author deletes it, and says so` / `says in every draft that a submission is kept until its author deletes it`

- [x] AT-B: セッションだけは期限を持ち、その日数が実装と一致している

  > ✅ Automated — `scripts/lint/nest-retention-policy-sync.test.ts` › `expires a session, which is the one credential here`

- [x] AT-C: **メールアドレスを持たない**ことが草案側でも守られている（連絡先が生えない）

  > ✅ Automated — `scripts/lint/nest-retention-policy-sync.test.ts` › `names one contact point, and the same one, in every draft`

- [x] AT-D: **取り下げ**の申し立て窓口が GitHub Issue ただ 1 つで、全草案で同じである

  > ✅ Automated — `scripts/lint/nest-retention-policy-sync.test.ts` › `names one contact point, and the same one, in every draft`
  >
  > 「ただ 1 つ」は取り下げ請求についての話である。**発信者情報開示はこの窓口では受けられない**
  > （請求者と投稿者の双方の個人データが公開の場に出る）。その別経路は未決で、下の手動確認と
  > `docs/policy/nest-data-handling.md` の「未了」節が持つ。

- [x] AT-E: 草案が法務レビュー未了の表示を持ち、**docs-site の公開集合に入っていない**

  > ✅ Automated — `scripts/lint/nest-retention-policy-sync.test.ts` › `keeps every draft out of the published set until a human has read it`

- [x] AT-F: 「repository を読まない」「モデルプロバイダが居ない」が文書とコードの両方で成立する

  > ✅ Automated — `scripts/lint/nest-retention-policy-sync.test.ts` › `says the service does not read anyone's repository` / `does not claim a model provider is involved`

- [x] AT-G: 非公開の投稿を配信しないという記述が、実装の分岐と一致している

  > ✅ Automated — `scripts/lint/nest-retention-policy-sync.test.ts` › `says an unlisted submission is withheld, and withholds it`

- [x] AT-H: 投稿のサイズ上限の記述が実装の定数と一致している

  > ✅ Automated — `scripts/lint/nest-retention-policy-sync.test.ts` › `states the size limits a submitter is actually held to`

- [x] AT-I: 削除経路に配線された prefix が文書の表と一致している

  > ✅ Automated — `scripts/lint/nest-retention-policy-sync.test.ts` › `names each prefix the purge is wired for (not that the list is complete)`

- [x] AT-J: 文書間のリンクが解決する

  > ✅ Automated — `packages/docs-site` の `check-links`（`pnpm --filter @karasu-tools/docs-site run check-links`）

## 手動確認

- [ ] 🧑 草案 2 件に資格のある人間のレビューを受ける。特に `nest-terms.md` 第 3 節
      （投稿物の権利帰属 — 運営者に与える許諾の範囲）と第 4 節（責任の制限）

  > 自動テストが判定できるのは「文書が実装と一致しているか」までで、**その文面で
  > 守れるかは法的な判断**であり、機械にも私にも判定できない。両文書の「未了」節が
  > 残作業の正である。

### 未了（この AT の項目ではない）

法務レビューと同じ性質の、**起草と判断であって実機判定ではない**残作業。一覧の正本は
`docs/policy/nest-data-handling.md` の「未了」節で、チェックボックスをここへ写さない
（再実行される実機確認と、一度終われば終わる作業が同じ見た目で並ぶため）。

このスライスで **1 件増えた**。**発信者情報開示の手続き**である。ギャラリーは公開できる
ものだけを扱うので、投稿は原則として第三者から見える。したがって「権利を侵害された」と
主張する第三者が現れる経路は、取り下げ請求だけではなく**誰が投稿したかの開示請求**も
ありうる。アプリケーションは IP を記録しない（Cloudflare 側のログは別に存在する）が、
GitHub の login は保持しており、これは IP より直接に個人へ結びつく。開示の前に投稿者へ意見照会する手順まで含めて、privacy policy
に何を書くかとして決める必要がある。上の AT-D が言うとおり、**この経路に GitHub Issue の
窓口は使えない**。
