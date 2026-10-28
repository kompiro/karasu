---
id: ADR-2922
title: 毎月の最終日曜に Release — Prepare を自動で走らせ、VS Code 拡張も同じトレインで公開する
status: accepted
date: 2026-10-25
topic: build
depends_on:
  - ADR-2939
related_to:
  - ADR-1370
  - ADR-1315
  - ADR-1316
  - ADR-1758
  - ADR-1820
  - ADR-2786
scope:
  packages: [cli, core, vscode]
  concerns: [ci, deployment]
assumptions:
  - "file: scripts/release/train.mts"
  - "symbol: scripts/release/train.mts :: shouldDepart"
  - "symbol: scripts/release/train.mts :: marketplaceStatus"
  - "grep: .github/workflows/release-prepare.yml :: cron: \"0 0 \\* \\* 0\""
  - "grep: .github/workflows/vscode-release.yml :: workflow_call"
  - "grep: .github/workflows/release.yml :: uses: ./.github/workflows/vscode-release.yml"
  - "grep: .github/workflows/release.yml :: close-train"
---

# ADR-2922: 毎月の最終日曜に Release — Prepare を自動で走らせ、VS Code 拡張も同じトレインで公開する

- **日付**: 2026-10-25
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2922](https://github.com/kompiro/karasu/issues/2922)
  - Design Doc PR: [#2923](https://github.com/kompiro/karasu/pull/2923)、実装 PR: [#2962](https://github.com/kompiro/karasu/pull/2962)
  - 初回の定期トレイン: Issue [#3348](https://github.com/kompiro/karasu/issues/3348)、リリース PR [#3349](https://github.com/kompiro/karasu/pull/3349)、Release `release-2026-10-25`
  - [ADR-2939](2939-release-record-tags-and-github-release.md)（パッケージのタグと `release-YYYY-MM-DD` の GitHub Release。本 ADR はこの記録の上に載る）
  - [ADR-1370](1370-release-flow-actions-driven.md)（Prepare → release PR → マージで publish。人が CHANGELOG を読んでマージする関門は維持する）
  - [ADR-1316](1316-vscode-marketplace-publish.md)（Marketplace publish。**本 ADR はその決定 2「`workflow_dispatch` の手動トリガ」を改訂する**。決定 1・3・4 は有効のまま）
  - [ADR-1758](1758-vscode-changeset-versioning.md)（拡張を changesets の版管理に載せる。**本 ADR はその決定 3「Marketplace publish は手動のまま」と、却下した案「CHANGELOG 変更で Marketplace publish を自動発火」の却下理由を改訂する**。決定 1・2・4・5 は有効のまま）
  - [ADR-1820](1820-notation-promotion-gate.md)（promotion gate。確認の場はリリース PR のマージ前のまま）
  - 関連 TPL: [TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md)（判定できない状態を通過扱いにしない）
  - 分離した Issue: [#2940](https://github.com/kompiro/karasu/issues/2940)（拡張の週次 pre-release）、[#3350](https://github.com/kompiro/karasu/issues/3350)（リリース PR を CodeRabbit のレビューから外す）

## 背景

リリースは、メンテナが Release — Prepare を思い出して起動したときにだけ出ていた。2026-06-25 の次のリリースは 2026-09-27 で、その間に changeset が約 150 件たまり、1 回のリリースに 3 か月分の変更が載った（#2921）。CHANGELOG を読んでからマージする関門（ADR-1370）も、この分量では形だけになる。加えて VS Code 拡張は別の手動起動（`vscode-release.yml`）が要り、npm を出したあとに拡張の公開を忘れる余地があった。

メンテナの決定は次の 3 点（#2922）。

1. 毎月の最終日曜に発車する。個人プロジェクトなので、週末に出して問題対応が遅れても構わない。
2. 準備までを自動にする。PR を開く・CHANGELOG を読む・マージするのは人。
3. VS Code 拡張も同じトレインに載せる。

3 は ADR-1316 決定 2 と ADR-1758 決定 3（拡張の公開は手動）を覆す。ADR-1758 は自動発火を「リリース PR マージのたびに重い公開が走るのは過剰」「拡張は独自 cadence」という理由で却下していた。月次トレインではマージが月 1 回になり、独自 cadence の方針はメンテナが今回やめると決めたので、どちらの前提も成り立たなくなった。

設計の前提として次の制約がある。

- main ruleset は PR 必須・squash のみ・直 push 不可で、自動化は main へ直接書けない。
- Actions の PR 作成は OFF のまま（#1370）。GITHUB_TOKEN で作った PR には必須チェックも走らない。
- GitHub の cron は「最終日曜」を書けない。day-of-month と day-of-week を両方指定すると OR で評価される（`0 0 22-31 * 0` は「22〜31 日」または「日曜」）。
- 版はパッケージごとに独立している（ADR-1315 / ADR-1758。lockstep の #2936 は採らなかった）ので、リリースで CLI の版が上がるとは限らない。

## 決定

**Release — Prepare を毎週日曜 00:00 UTC に起動して月の最終日曜だけ発車させ、`chore/release-YYYY-MM-DD` の push とトラッキング Issue の作成までを自動にする。人は Issue のリンクから PR を開き、CHANGELOG を読んでマージする。マージの run で npm に続けて VS Code 拡張を Marketplace に公開し、全部が成功したら Issue を閉じる。**

1. **発車の判定（A1）。** `cron: "0 0 * * 0"`（09:00 JST）で毎週起動し、「7 日後が翌月か」で最終日曜を判定する（`scripts/release/train.mts` の `shouldDepart`）。判定は出力にして、後続の全ステップをその出力で条件付ける。`exit 0` では 1 ステップしか止まらないため。`workflow_dispatch` は判定を飛ばして常に発車するので、臨時のリリースはいつでも出せる。
2. **人への引き渡し（B1）。** 発車したら `changeset version` を実行して `chore/release-YYYY-MM-DD`（実行日の UTC 日付）を push し、ラベル `release` のトラッキング Issue を立てる。Issue には PR を開く compare リンク、版が上がったパッケージの前後、チェックリスト（PR を開く・CHANGELOG を読む・promotion gate の確認・squash マージ）を載せる。pending changeset が無ければブランチも Issue も作らない。ブランチを日付で名付けるのは、版が独立していて CLI の版が上がらない月に前回の名前と衝突させないためで、ADR-2939 の Release のタグと同じ規則にそろえる。
3. **前のトレインが残っているとき（C1）。** 開いている `release` Issue か、head が `chore/release-*` の開いている PR があれば、新しいブランチを作らずにそこへコメントしてジョブを失敗させる（TPL-2786）。残っているトレインを黙って上書きしない。PR も見るのは、Issue を閉じても対になる PR は閉じないため。
4. **拡張の公開（D1）。** `vscode-release.yml` に `workflow_call` を足し、`release.yml` の npm 公開のあとで `vscode` ジョブから呼ぶ（`if: ${{ !cancelled() }}`。拡張は npm に依存しないので、npm が一部失敗しても止めない）。公開の前に Marketplace の状態を見る（`marketplaceStatus`）。その版が stable で既にあれば公開しない。pre-release にしか無ければ同じ版番号で stable を出せないので失敗させる。`vsce show` が失敗したら公開を飛ばさずに失敗させる（TPL-2786）。`workflow_dispatch` は手動のやり直し用に残す。
5. **Issue を閉じる（`close-train`）。** マージの run の最後に、HEAD コミットを生んだ PR の head ブランチ名で Issue を特定する。npm の公開と記録、拡張の公開と記録がすべて成功したら Release のリンクを付けて閉じ、どれかが失敗したら run のリンクをコメントして開いたまま残す。ブランチ名が一致する Issue が無い run（`workflow_dispatch` や別の CHANGELOG の push）では何もしない。

2026-10-25 の初回の定期トレインで、判定（10/4・10/11・10/18 は発車せず、10/25 に発車）、ブランチと Issue の作成、マージ後の npm と Marketplace の公開（OIDC は `workflow_call` 経由でも subject `ref:refs/heads/main` で通った）、Release の作成、Issue の自動 close までを実機で確認した。

## 理由

- **cron の制約の中で最終日曜を取りこぼさない。** 毎週起動して判定すれば、暦のずれを考えずに済み、判定が 1 行で読める。空振りの実行は月 3〜4 回、数秒で終わる。
- **マージ前の関門を残したまま、人の作業を最小にする。** PR を開いてマージする部分を人に残すので、Actions の PR 作成 OFF（#1370）と必須チェックの実行、CHANGELOG を読む関門（ADR-1370）と promotion gate の確認（ADR-1820）がそのまま成り立つ。
- **止まるべき状態を通過扱いにしない。** 前のトレインが残っている、Marketplace の状態が分からない、といった判定できない状態では失敗させる。放置すれば毎月失敗の通知が来るので気づける（TPL-2786）。
- **拡張の公開を npm の後段に置くことで、ADR-1758 の却下理由が消える。** 月 1 回のマージなので重い公開が頻繁に走ることはなく、npm と同じ run で順に走るので順序付けの問題も無い。公開済みの版は飛ばすので、拡張の版が上がらない月は何もしない。
- **Issue の開閉をトレインの状態にそろえる。** 「`release` Issue が開いている = トレインが終わっていない」を C1 の判定と close-train の両方で使うので、Re-run jobs で失敗を直したあとも次のトレインが止まったままにならない。

## 却下した案

- **日付範囲と曜日を併記した cron（A2）。** GitHub の cron は OR で評価するので、毎週日曜と 22〜31 日の毎日に発火してしまう。成立しない。
- **毎月 1 日などの固定日（A3）。** 実装は最も簡単だが、決定（最終日曜）と違う。
- **Actions に PR まで作らせる（B2）。** ADR-1370 が却下した `changesets/action` と同じく、#1370 で OFF にした設定を戻す必要がある。GITHUB_TOKEN の PR には必須チェックも走らない。
- **前月のブランチを force-push で作り直す（C2）。** 開いている PR の中身が知らないうちに変わり、読んだ CHANGELOG とマージする中身がずれうる。関門を弱める。
- **`workflow_run` で Release の完了後に拡張の公開を起動する（D2）。** run が分かれて成否が別画面になり、D1 より追いにくい。
- **`packages/vscode/CHANGELOG.md` の paths filter で `vscode-release.yml` を直接起動する（D3）。** ADR-1758 が却下した案そのもの。npm の公開と順序付けできず、npm が失敗しても拡張だけ出てしまう。

## 影響

- `release-prepare.yml` に `schedule` と発車判定・残りトレインの確認・Issue の作成を足した。`permissions` は `contents: write`・`issues: write`・`pull-requests: read`。
- `vscode-release.yml` に `workflow_call` と Marketplace の状態のガードを足した。
- `release.yml` に `vscode` ジョブと `close-train` ジョブを足した。
- 判定のロジックは `scripts/release/train.mts` の純粋関数に置き、`scripts/release/train.test.ts` で固定した。
- `docs/release.md` の「リリースの流れ」を月次トレインの手順に書き換え、`release` ラベルを作った。
- 実機で未確認のまま残るのは C1（トレインが残った状態で Prepare を起動するとコメントして失敗する）だけ。テストでは固定しているが、本番で起きるのはトレインを放置したときになる。
- 初回のトレインでは、リリース PR に CodeRabbit の自動レビューが走り、rate limit に当たった。リリース PR の中身は `changeset version` が作った版と CHANGELOG だけで、CHANGELOG の各項目は元の PR でレビュー済みのため、レビューから外す（#3350）。
