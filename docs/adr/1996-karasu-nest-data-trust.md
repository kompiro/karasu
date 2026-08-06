---
id: ADR-1996
title: karasu-nest のデータ信頼 — 技術側は実装で閉じ、契約と法務文書は未了として残す
status: accepted
date: 2026-08-03
topic: project
authors: [kompiro]
depends_on: [ADR-1990]
related_to: [ADR-1994, ADR-2262]
scope:
  packages: [nest]
  concerns: [security, deployment]
assumptions:
  - "file: docs/policy/nest-data-handling.md"
  - "file: scripts/lint/nest-retention-policy-sync.test.ts"
  - "file: packages/nest/src/store/nest-purge-coverage.test.ts"
  - "grep: packages/nest/src/deliver/pull-request.ts :: deliveryEnabled"
---

# ADR-1996: karasu-nest のデータ信頼 — 技術側は実装で閉じ、契約と法務文書は未了として残す

- **日付**: 2026-08-03
- **ステータス**: 決定済み
- **Issue**: [#1996](https://github.com/kompiro/karasu/issues/1996)（data-trust）／親 [#1990](https://github.com/kompiro/karasu/issues/1990)

## 背景

[ADR-1990](1990-karasu-nest-pivot-server-reverse.md) 決定 6 は、データ信頼アーキテクチャを karasu-nest の**成立条件**に置いた。nice-to-have ではなく、これが引けないならピボットしないという位置づけである。同 ADR は退避先も記録している: **public repo のみに縮小**する。

この決定 6 は 5 つの要素を挙げていた。install 時の同意、生ソース非保持、LLM の zero-retention、アンインストール＝purge、サブプロセッサ開示。**このうち技術で閉じられるのは 3 つ**で、残る 2 つ（zero-retention 契約、同意文面が指す先の法務文書）は文章と契約である。ADR-1990 自身が「技術ではなくここが solo 運用の重り」と書いていた部分がここに来た。

## 決定

**技術的に閉じられる部分は実装で閉じ、契約と法務文書は「未了」として名指しで残し、未了である限り他者の private repository に向けない。**

技術側（このスタックで完了）:

1. **生ソースは保存しない。** 1 回の生成の処理中だけメモリに存在し、ストアにもレスポンスにも出ない。redact を通さずにモデルへ渡すことは型で不可能にしてある（ログに出さないのは規約であって型ではない）
2. **egress の前に redact する。** 形の分かる資格情報はモデルに渡る前に置換され、件数が記録される
3. **アンインストールで消える。** 全 7 prefix が purge の射程にあり、`nest-purge-coverage.test.ts` が機械的に検証する（[TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md)）
4. **private repository のモデルは配信しない。** `GET /<owner>/<repo>` に認証は無く、持ちようもない（読者は URL しか持たずに来る）。したがって判断は「誰が訊いているか」ではなく「これは誰に見せてよい文書か」で、private repository の答えは no になる。応答は「未生成」と完全に同じ 404 で、存在の判別材料にしない
5. **書き込み権限は既定で無効。** PR-back（[#2289](https://github.com/kompiro/karasu/issues/2289)）は読み取り同意より広い権限を要求するので、`PR_DELIVERY=on` を明示しない限り動かない
6. **事実の記述と実装が乖離しない。** `docs/policy/nest-data-handling.md` の保持期間・ファイル上限・purge 対象は `scripts/lint/nest-retention-policy-sync.test.ts` がコード側の定数と突き合わせる

未了（人間がやる）:

7. Anthropic との zero-retention 契約（または現行規約で担保されることの確認）
8. privacy policy の起草と法務レビュー
9. ToS（責任制限を含む）の起草と法務レビュー
10. 企業向け DPA の要否判断
11. 公開先と問い合わせ窓口の決定

## 理由

**「未了」を文書の中に残すことを選んだ。** 選択肢は 3 つあった: 法務文書を書いたことにして公開する、public repo のみに縮小する、技術を仕上げて残りを名指しで残す。1 番目は、資格のない者が書いた責任制限が実際の紛争で機能しないという以前に、**利用者に対して嘘になる**。2 番目は退避先として有効だが、まだ退避すべき局面ではない — 詰まっているのは技術ではないので、技術を止める理由がない。

**「文書化」の作業が実装のバグを 1 つ見つけた。** 保存物を一覧にしていく過程で、生成済みモデルを返す `GET /<owner>/<repo>` に認証が無いこと、つまり **private repository のアーキテクチャが URL を知る誰にでも見えていた**ことが分かった。ドメイン名・コンポーネント名・依存関係は、その所有者が公開しないことを選んだソースから導かれている。同じ経路が private repository の存在オラクルにもなっていた — `POST .../generate` が「未インストール」と「見えない」を同じ 404 にして避けている、まさにその開示である。決定 4 はその修正で、**この ADR で最も価値があったのは文章ではなくこの発見だった**。事実を書き出すという作業自体が監査になる。

**技術的事実を先に確定させることが、法務作業を軽くする。** privacy policy を書く人が最初にやるのは「実際には何をどれだけ保存しているのか」の調査で、それが `docs/policy/nest-data-handling.md` に確定している。この文書は privacy policy **ではない**が、privacy policy の素材としては完成している。

**保持期間を機械検証にかけたのは、この種の文書が最も静かに嘘になるからである。** 定数は 5 つのファイルに散っており、文書は 6 番目にある。両者を繋ぐ型もテストも lint も無い。TTL を変えても何も落ちず、サービスは動き続け、**壊れるのは約束だけ**になる。これは TPL-2226（purge の射程に入らない新 prefix）と同じ形の失敗が一段上に出たもので、あちらがコード対コードなら、こちらはコード対「利用者に言ったこと」である。

**PR-back を既定で無効にしたのは、同意の順序を守るためである。** 機能は完成しているが、`contents:write` を要求する。同意文面が書き込みに言及していない状態でこれを有効にすると、得ていない同意で他者の repository に書くことになる。文面（案）は data-handling 文書にあり、実際に差し替わるのは未了 8・9 が片付いたときである。

**redact について「秘密は絶対に渡らない」と主張しないことを決めた。** 検出は形に基づくので万能ではない。主張できるのは「形が既知の資格情報は置換される」「件数は記録され、生成物の PR 本文にも出る」までで、それ以上を書けば文書のほうが虚偽になる。[TPL-2287](../test-perspectives/TPL-2287-detector-near-misses-are-the-spec.md) が検出器の限界を観点として持っている。

## 却下した案

**法務文書を LLM に書かせて公開する。** 責任制限条項は紛争時に効くかどうかが全てで、効かない文面は無いのと同じか、無いより悪い（守られていると誤認させる）。素材としての事実整理までが、資格の要らない範囲である。

**public repo のみに縮小して先に出す。** ADR-1990 の退避先だが、いま採る理由が無い。詰まっているのは法務であって技術ではなく、縮小してもその重りは軽くならない（public repo でも ToS と privacy policy は要る）。未了が長期化したときに再検討する。

**同意文面を「詳細はリンク先」だけにする。** リンクを読む人はほとんどいない。何を読んで何を保存するかは**画面に 4 行で**書き、詳細をリンクにする形にした。

**保持期間を文書に書かない（「必要な期間」等の曖昧表現）。** 曖昧に書けば機械検証もできず、利用者も判断できない。日数で書いて検証にかけるほうが、書く側の負担も小さい。

## 成立条件としての扱い

**ADR-1990 決定 6 は未了 7〜11 が片付くまで満たされていない。** したがって:

- karasu-nest のデプロイは `workflow_dispatch` 限定のままとする
- 自分以外の private repository に App をインストールしない
- `PR_DELIVERY` を設定しない

なお、未了が片付いても残る既知の制限が 1 つある: `POST /<owner>/<repo>/generate` に認証が無いので、第三者が他人の installation の月間 quota を消費できる。生成物は返らないので漏洩ではないが、認証を足すか許容として明文化するかは決めていない。

この 3 つが解けるのは、上の未了が空になったとき、または public repo のみへの縮小を別 ADR で決めたときである。**未了を抱えたまま「とりあえず動かす」ことをしないために、条件を実行可能な形（デプロイ設定・環境変数）で書いておく。**
