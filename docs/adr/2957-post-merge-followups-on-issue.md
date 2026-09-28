---
id: ADR-2957
title: マージ後にしか確認できない項目は PR のチェックリストから分け、元の Issue に追記して追跡する
status: accepted
date: 2026-09-27
topic: build
related_to: [ADR-2898]
assumptions:
  - "file: .github/workflows/post-merge-followups.yml"
  - "symbol: scripts/pr/post-merge-followups.mts :: checkBody"
  - "symbol: scripts/pr/post-merge-followups.mts :: appendFollowups"
  - "symbol: scripts/pr/post-merge-followups.mts :: checkIssueStates"
  - "grep: .github/PULL_REQUEST_TEMPLATE.md :: ## Post-merge follow-ups"
---

# ADR-2957: マージ後にしか確認できない項目は PR のチェックリストから分け、元の Issue に追記して追跡する

- **日付**: 2026-09-27
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2957](https://github.com/kompiro/karasu/issues/2957)
  - [ADR-2898](2898-draft-first-code-review.md)（PR ワークフローの順序。本 ADR はその手順 13 の対象を絞る）
  - `.github/PULL_REQUEST_TEMPLATE.md`、`.github/workflows/post-merge-followups.yml`、`scripts/pr/post-merge-followups.mts`
  - `docs/process.md`「マージ後にしか確認できない項目」
  - `kompiro/hane` の `ship` / `start-dev`（PR 本文を書く skill）

## 背景

PR テンプレートの「Manual Verification Checklist」には、レビュー時に確認できる項目と、マージ後にしか観察・実行できない項目（「次の npm release で…」「次の ADR-only PR で…」「マージ後にバックフィル」）が混ざっていた。#2955、#2951、#2943、#2916 がその例である。

後者はレビューのチェックリストとして意味を持たない。マージの時点では未チェックのまま残り、その後は誰も読まないマージ済み PR の本文に埋もれる。#2943 のバックフィルなど一部は、repo ではなくエージェントのローカルメモリでしか追跡されていなかった。

## 決定

PR テンプレートに「Post-merge follow-ups」節を新設してマージ後の項目をそこへ分け、その PR は元の Issue を `Refs #N` で紐付ける。マージ時に workflow が項目を Issue 本文へ追記し、Issue は項目を消化してから人間が close する。

- 振り分けの判断基準は 1 つで、「その PR の preview かローカルの checkout で確認できるか」とする
- PR が open のあいだは、項目があるのに `## Purpose` に `Refs #N` が無い、参照先が API 上で open な Issue でない（閉じている・PR・存在しない）、または closing keyword で Issue を閉じる本文なら、workflow の Check を失敗させる。closing keyword は GitHub が読む 3 つの参照形式（`#N`、`owner/repo#N`、Issue の URL）をすべて検出する
- 追記は PR ごとの marker comment で冪等にする。fork からの PR は token が Issue に書けないので、マージした人が手で写す

## 理由

- 変更の文脈は元の Issue にすでにある。確認結果もそこに残せば、1 つの変更の履歴が 1 か所にまとまる
- Issue は `status: in-review` のまま open で残る。`/hane:pick-issue` は `in-review` を除外するので、確認待ちの Issue が次の着手候補に紛れ込まない
- `Closes #N` のままだとマージと同時に Issue が閉じ、追記先が閉じた Issue になる。紐付け方の取り違えは人もエージェントも起こすので、PR 時点の Check で機械的に止める（#2943 は同じ理由で、手で `Refs #2939` にしていた）

## 却下した案

- **PR ごとに追跡用の Issue を別に起こす**: 1 つの変更の履歴が 2 つの Issue に分かれる。元の Issue を閉じてから別 Issue を探しに行く手間も増える
- **テンプレートの節を分けるだけで、置き場は作らない**: マージ後に PR 本文から見えなくなる点は変わらない
- **`Closes #N` のまま、マージ後に workflow が Issue を reopen する**: GitHub による自動 close と workflow の実行順が保証されず、reopen し損ねる競合がある。close と reopen の通知も無駄に出る
