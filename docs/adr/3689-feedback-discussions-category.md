---
id: ADR-3689
title: フィードバックは GitHub Discussions の Feedback カテゴリで受け、アプリはガイドの最後のステップからだけリンクする
status: accepted
date: 2026-11-11
topic: app-ui
related_to: [ADR-3601, ADR-3600, ADR-3599]
scope:
  packages: [app, i18n]
assumptions:
  - "file: .github/DISCUSSION_TEMPLATE/feedback.yml"
  - 'grep: packages/app/src/utils/feedback-discussions.ts :: FEEDBACK_CATEGORY_SLUG = "feedback"'
  - "symbol: packages/app/src/components/first-run/TourPanel.tsx :: FEEDBACK_DISCUSSION_URL"
  - 'grep: packages/i18n/src/first-run.ts :: "firstRun\.tour\.feedback"'
---

# ADR-3689: フィードバックは GitHub Discussions の Feedback カテゴリで受け、アプリはガイドの最後のステップからだけリンクする

- **日付**: 2026-11-11
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3689](https://github.com/kompiro/karasu/issues/3689)（Phase 3 準備 Epic [#3687](https://github.com/kompiro/karasu/issues/3687)、PRD [#3573](https://github.com/kompiro/karasu/issues/3573) §12「Interview questions」）。実装 PR [#3758](https://github.com/kompiro/karasu/pull/3758)
  - 関連 ADR: [ADR-3601](3601-first-run-second-sample.md)（2 つ目の題材）、[ADR-3600](3600-first-run-understand-evolve-tours.md)（ガイドをデータとして持つ）、[ADR-3599](3599-first-run-step-completion.md)（ステップの ✓）
  - TPL: [TPL-2019](../test-perspectives/TPL-2019-i18n-key-naming-max-4-segments.md)、[TPL-1399](../test-perspectives/TPL-1399-control-a11y-contract-survives-migration.md)、[TPL-3437](../test-perspectives/TPL-3437-tap-target-needs-its-own-pressability-cue.md)
  - AT: [first-run-experience.md](../acceptance/first-run-experience.md)（AT-AR）
  - コード: `.github/DISCUSSION_TEMPLATE/feedback.yml`、`packages/app/src/utils/feedback-discussions.ts`、`packages/app/src/components/first-run/TourPanel.tsx`、`packages/i18n/src/first-run.ts`、`docs/guide/team-trial-session{,.ja}.md`

## 背景

アプリには計測が無く、入れるかどうかも決まっていない（PRD §12）。そのため初回体験の価値を確かめる主な手段は、訪問者と試用セッションの
参加者から聞く声になる。kompiro は、その声を受ける場所を GitHub Discussions にすると決めた（2026-11-08）。

決める必要があったのは 3 点である。どのカテゴリで受けるか、どんな形式で聞くか、アプリからリンクするか。GitHub にはカテゴリを作る API が
無いので、カテゴリは kompiro が repository の設定で作る。

## 決定

**新しいカテゴリ「Feedback」（slug `feedback`、形式は Open-ended discussion）で受け、`.github/DISCUSSION_TEMPLATE/feedback.yml` の
フォームで PRD §12 の質問を聞く。アプリはどのガイドも最後のステップにだけ、このカテゴリで新しい投稿を始めるリンクを出す。** 3 点とも
kompiro が判断した（2026-11-11）。カテゴリは kompiro がマージ前に作り、フォームが表示されることをマージ後に確かめた（[#3757](https://github.com/kompiro/karasu/issues/3757)）。

### フォーム

- 冒頭の注意書きと必須のチェックボックスで、公開するつもりのないモデルの共有リンクを貼らないよう求める。共有リンクにはモデルそのものが
  埋め込まれているので、Discussions を読む人なら誰でもそのモデルを開ける
- どう試したか（一人でツアー、チームで試用セッション、自分のモデル、その他）と、どこでつまずいたかを聞く（どちらも任意）
- PRD §12 の 5 つの質問は任意にする
- チェックボックスのほかに必須にするのは「チームで使いたいと思った、または使わない具体的な理由」だけにする。PRD §12 が最も重視するのがこの理由である

### リンク

- URL `https://github.com/kompiro/karasu/discussions/new?category=feedback` は `utils/feedback-discussions.ts` の 1 か所だけが持つ
- GitHub は、slug と同じ名前のファイルが `.github/DISCUSSION_TEMPLATE/` にあるときだけフォームを出す。食い違ってもカテゴリは開くので、
  壊れたことに気づけない。そこで、URL の `category=` とフォームのファイル名が一致することをテストで確かめる
- アプリのリンクは新しいタブで開く（`target="_blank"`、`rel="noopener noreferrer"`）
- 試用セッションの台本（`docs/guide/team-trial-session{,.ja}.md`）の締めも、同じ URL を指す

## 理由

- フィードバックには「正解」が無いので、回答を 1 つ選ぶ Q&A 形式は合わない
- 既存のカテゴリを使うと、フォームがそのカテゴリのすべての投稿に出てしまう。専用のカテゴリなら、フォームを試用の声のためだけに作れる
- どのガイドを選んでも、最後まで進んだ訪問者は必ず最後のステップを通る。そこは訪問者がひととおり体験し終えた場所で、聞くのにちょうどよい。
  ほかの場所にも出すと、作業中の利用者の邪魔になる
- 質問をほとんど任意にするのは、答える手間を小さくして声を集めやすくするためである。それでも、PRD が最も知りたい理由だけは必須なので、どの投稿にも必ず書かれる

## 却下した案

- **既存の Ideas カテゴリを使う**: 設定は要らない。しかし、試用の報告と機能の提案が混ざり、Ideas のすべての投稿にフォームが出る
- **既存の General カテゴリを使う**: 同じく設定は要らないが、General のすべての投稿にフォームが出る
- **Q&A 形式のカテゴリにする**: 回答を 1 つ選ぶ形式は、フィードバックの性質に合わない
- **アプリからはリンクしない**: アプリの変更は要らない。しかし、台本を使わずに一人で試した訪問者には、声を届ける入口が無くなる

## 影響

- 最後のステップのパネルが 1 行高くなる。パネルの配置とはみ出しの e2e（AT-M / AT-N / AT-AH / AT-AP）は、en / ja とも通っている
- カテゴリの slug を変えるときは、フォームのファイル名と `FEEDBACK_CATEGORY_SLUG` を一緒に変える。食い違えばテストが落ちる
- フィードバックの分析と、気づきを記録する場所は、この決定の外である（#3690）
