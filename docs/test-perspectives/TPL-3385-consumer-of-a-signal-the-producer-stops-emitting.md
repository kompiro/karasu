---
id: TPL-3385
title: "外部サービスの出力の形が変わっても、その出力を待つ側の判定が気づけるようにする"
status: active
date: 2026-10-29
applicable_to:
  - "外部サービス（bot・CI・レビューサービス）の設定を変え、そのサービスが出す review・状態・コメントの形が変わる変更"
  - "外部サービスの出力を待ってループを進める・終える判定で、「答えがあった」を特定の出力の有無で決めている構成"
  - "同じ出来事を外部サービスが複数の場所（review object・要約コメント・thread）に書き、判定がそのうち 1 か所だけを読む構成"
  - "外部サービスが自動では応答しない操作（取り込みだけの push など）の後も、その応答を待つ判定"
known_consumers:
  - coderabbit-converge
discovered_from:
  - issue: "#3385"
  - issue: "#3657"
  - root_cause_file: "scripts/coderabbit/review-state.ts"
related_to:
  - TPL-2909
topic: project
scope:
  packages: []
  concerns:
    - ci
---

# TPL-3385: 外部サービスの出力の形が変わっても、その出力を待つ側の判定が気づけるようにする

## 観点

外部サービスの設定を変えると、そのサービスが出す出力の形が変わる。止めた出力をほかの処理が「答え」として
待っていた場合、その処理はエラーにならず、来ない答えを待ち続ける。待つ側のテストは古い出力の形の fixture で
書かれているので、設定を変えた PR の CI は通る。

設定変更の PR では、その出力を読む処理を探し、設定変更後に実際に出る形を fixture にしたテストを足す。
出力の形は推測せず、変更後に実際に出たもの（PR のコメントや API の応答）から取る。

こちらの設定を変えなくても、サービス側の更新で出力の形は変わる。そのときは変更の PR が無いので、fixture だけでは
防げない。判定が待ち続けている PR を見つけたら、「相手が反応しなかった」と読む前に、実際の出力と判定の読む場所を
突き合わせる。

## 想定される失敗モード

- CodeRabbit に approve させない設定（#3365）にした後、指摘ゼロの回は review object を残さず要約コメントを
  書き換えるだけになった。`await-review.ts` は review だけを答えとして読んでいたので、収束した回を
  `timeout`（CodeRabbit の無反応）と報告した（#3385。#3384 で観測）
- 待ち続けた結果を「相手が反応しなかった」と読み、事実と違う説明を人に伝える（#3384 では「CodeRabbit が
  レビューする前にマージされた」と伝えた）
- 失敗は時間切れとしてしか現れないので、テストでも CI でも検出されない
- CodeRabbit が「No actionable comments were generated」を `recent_review` 欄の外の `recent_review_status` 欄へ
  移した。こちらに変更が無いので fixture のテストは通り続け、指摘ゼロの回がまた `waiting` になった（#3657。#3628 で観測）
- `auto_incremental_review: false` により、main を取り込むだけの push にはレビューが来ない。判定が HEAD ちょうどへの
  答えだけを読むと、前のコミットへのレビューが済んでいても来ない答えを待つ。人が見ても「Review skipped」と
  check の `skipped` だけが目に入り、未レビューと誤読する（#3657）

## チェックリスト

- [ ] 設定変更で止まる、または形が変わる出力を、どの処理が読んでいるか grep したか [judgment]
- [ ] 変更後に実際に出た形（指摘ゼロの回・指摘ありの回の両方）を fixture にしたテストがあるか [judgment]
- [ ] 判定が「答えがあった」を 1 か所の出力だけで決めていないか。同じ出来事が別の場所にも書かれるなら、
      どれを読むかを決めて理由を書いたか [judgment]
- [ ] 答えの出力が別の commit や古い時刻のものであれば答えとして数えないことを、テストで確かめたか
- [ ] サービスが自動で応答しない操作の後でも、判定が前の答えを読めるか。読んでよい範囲（PR の変更が同じコミットなど）を
      機械の判定で決め、範囲の外の答えは数えないことをテストで確かめたか [judgment]

## 既知の対処パターン

- `scripts/coderabbit/review-state.ts` の `cleanSummaryOfHead` は、要約コメントの `recent_review` 欄が
  「No actionable comments were generated」（#3657 以降は `recent_review_status` 欄）で、`recent_review` 欄の "Commits" 行が
  HEAD で終わる範囲を挙げているときだけ、HEAD への答えとして数える。古い commit を挙げた要約や `since` より前の書き換えは
  数えない。欄で限定するのは、コメントの残りが PR の要約で、同じ文を引用しうるため
- 同じく `commitsWithSameChange` は、main の取り込みだけが後に続き PR の変更が変わっていないコミットを HEAD と同じに
  扱う。判定は本文の表現ではなく git で行う（ローカルレビューの記録と同じ問い。TPL-3286）

## 関連テスト

- `scripts/coderabbit/review-state.test.ts`：指摘ゼロの要約を新旧両方の形で読むこと、walkthrough に引用された文を答えと読まないこと、古いコミットを挙げた要約を数えないこと、main の取り込みだけが後に続くコミットへの答えを HEAD への答えとして読むこと（`classify` / `commitsWithSameChange`）
