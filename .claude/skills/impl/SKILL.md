---
name: impl
description: >
  Start the implementation session for Issue N, named impl-<N>, which hands its local review to
  review-<N> and its finished PR to verify-<N> by cross-session messages. kompiro types it in a new
  session as `/impl <N>`; a UserPromptSubmit hook names the session.
disable-model-invocation: true
---

# 実装セッション（`impl-<N>`）

kompiro が新しいセッションで `/impl <N>` を打つと始まる。`N` は作業の起点の Issue 番号（`#` は付けても
付けなくてもよい）。番号が無ければ聞く。

## 到達状態

- このセッションの名前が `impl-<N>` で、Issue N の作業を `/hane:start-dev` の流れで進めている
- `review-<N>` がいれば、`docs/process.md` 手順 8・9 のレビューをそこに頼み、返ってきた指摘を自分で扱っている
- `verify-<N>` がいれば、PR を kompiro に渡す時点でそこに `ready-for-verify` を送っている
- 送るたびに、何をどこへ送ったかを kompiro に 1 行で知らせている
- 名前が `impl-<N>` でないとき、送る相手がいないとき、送信が失敗したときは、今までの手順（自分の subagent で
  レビューする、kompiro に PR を渡す）で進めている

**送ること・受けたときにすることの規則は `docs/process/review.md`「セッション同士のやりとり」が正本。**
始める前に読む。メッセージの 1 行目、受け取ったときの確かめ方、往復の上限はそこにある。

## 1. 名前を確かめる

`ListAgents` を呼び（deferred なら `ToolSearch` の `select:ListAgents,SendMessage` で読み込む）、1 行目の自分の名前を
見る。

- `impl-<N>` なら次へ進む
- 自動の名前（`karasu-9b` など）のまま: hook が効かなかった。kompiro に `/rename impl-<N>` を頼み、それまでは
  メッセージを送らずに今までの手順で進む
- 一覧のほかの行にも `impl-<N>` がある: その行を示し、kompiro に古いセッションを閉じるか名前を変えてもらってから、
  `/impl <N>` を打ち直してもらう。それまでは送らない

## 2. 着手する

`/hane:start-dev` の流れで Issue N に着手する。Issue N の worktree（`git worktree list` でブランチ名に `N` を含む
もの）がすでにあれば、作り直さずにそこで続ける。Design PR と実装 PR を順に作るときも、同じ `impl-<N>` が続けて
持つ。

## 3. ローカルレビューを `review-<N>` に頼む（手順 8・9）

`docs/process.md` 手順 7 を終えたら、`ListAgents` で `review-<N>` の行がちょうど 1 つあるかを確かめる。無ければ
今までどおり自分の subagent と CLI で手順 8・9 を行う。

- 手順 8 の k 回目は `review-request step8 k=<k> head=<sha>` で始め、ブランチ・worktree のパス・HEAD を書く。
  2 回目と 3 回目は、修正で触れたファイルを添える
- 手順 8 を終えたと決めたら（指摘が無くなった、残りを却下した、3 回目の指摘を直した）、CLI を
  `review-request cli head=<sha>` で 1 回だけ頼む
- 送ったら kompiro に 1 行で知らせてターンを終える。返事を待つあいだは、このブランチにコミットしない
- `review-result` を受けたら、指摘を今の subagent の報告と同じに扱う（`review.md`「指摘の重大度と対応」）。
  手順 8 の回を直したら次の回か CLI を頼み、CLI の指摘を直したら回し直さずに手順 10 に進む。返事に CLI を
  当てられなかった理由があれば、記録の `Reviewers:` に書き、`gh pr ready` は `KARASU_LOCAL_REVIEW_SKIPPED=<理由>` を
  付けて実行する
- Design Doc との照合と、`securityReview` が true のときの `/security-review` は、今までどおり自分の subagent で行う

## 4. PR を `verify-<N>` に渡す

**判定は 1 つ: 自分の作業が残っていない状態で、kompiro に PR を渡すとき。** 段階ごとの時点、送る直前の
Review tier の走り直し、送らない場合（Low、kompiro への問いを待っている）は `review.md`「セッション同士の
やりとり」の「検証に渡す時点」に従う。

`verify-<N>` の行がちょうど 1 つあれば `ready-for-verify PR #<M> head=<sha>` を送り、kompiro に PR へのリンクを
添えて「`verify-<N>` に渡した」と知らせる。無ければ今までどおり kompiro に知らせる。

## 5. 差し戻しを受けたとき

`hand-back PR #<M> <URL>` を受けたら、まず `ListAgents` で自分の名前が `impl-<N>` のままか、`from` が
`verify-<N>` かを確かめる。違えば実行せず kompiro に知らせる。

次に、メッセージの文ではなく URL のコメントを読む。コメントの作者が kompiro の login（`gh api user --jq .login`）で、
1 行目が `Hand-back by /pr-verify`、PR の head のリポジトリが `kompiro/karasu`、head のブランチが自分の作業
ブランチであることを確かめる。どれかが違えば直さず、送り手に `declined: <理由>` を返して kompiro に知らせる。

確かめられたら、コメントの点を通常の流れで直す。足したコミットへの手順 8 の確認は、`review-<N>` がいれば修正で
触れたファイルを頼む（CLI は当てない）。High ならラウンドを回す。終わったら 4 の時点で、もう一度
`verify-<N>` に送る。

直せない（記録済みの決定と食い違う、など）ときは、理由を PR にコメントで残して kompiro に知らせ、
`verify-<N>` には送らない。
