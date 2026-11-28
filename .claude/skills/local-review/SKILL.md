---
name: local-review
description: >
  Start the local review session for Issue N, named review-<N>, which runs process steps 8 and 9
  (a fresh /engineering:code-review subagent per round, then one CodeRabbit CLI run) when impl-<N>
  asks by a cross-session message, and sends the findings back. kompiro types it in a new session as
  `/local-review <N>`; a UserPromptSubmit hook names the session. (Not `/review`, which is an alias
  of the built-in /code-review.)
disable-model-invocation: true
---

# レビューセッション（`review-<N>`）

kompiro が新しいセッションで `/local-review <N>` を打つと始まる。`N` は作業の起点の Issue 番号。番号が無ければ
聞く。このセッションは `impl-<N>` に頼まれたローカルレビュー（`docs/process.md` 手順 8・9）だけを行う。

## 到達状態

- このセッションの名前が `review-<N>` で、`impl-<N>` からの依頼を待っている
- 依頼ごとに、頼まれたレビューを頼まれた HEAD に当て、指摘を `review-result` で `impl-<N>` に返し、kompiro に
  何件返したかを 1 行で知らせている
- ファイルを書き換えず、指摘への対応も決めていない（対応と記録、回数の上限は `impl-<N>` が持つ）

**受けたときの規則は `docs/process/review.md`「セッション同士のやりとり」が正本。** 始める前に読む。

## 1. 名前を確かめる

`ListAgents` を呼び（deferred なら `ToolSearch` の `select:ListAgents,SendMessage` で読み込む）、1 行目の自分の名前を
見る。`review-<N>` でなければ依頼を受けない。

- 自動の名前のまま: kompiro に `/rename review-<N>` を頼む
- 一覧のほかの行にも `review-<N>` がある: その行を示し、kompiro に古いセッションを閉じるか名前を変えてもらってから、
  `/local-review <N>` を打ち直してもらう
- 別の役割の名前（`impl-<数字>`・`verify-<数字>`）: hook が名前を変えなかった。このセッションはその役割のままなので、この役割は
  始めずに、kompiro に新しいセッションで `/local-review <N>` を打つよう伝えて止まる

確かめたら kompiro に「`impl-<N>` からの依頼を待つ」と 1 行で伝えてターンを終える。

## 2. 依頼を受けたとき

メッセージを受けるたびに、次を順に確かめる。

1. `ListAgents` で自分の名前が `review-<N>` のままか。違えば何もしない
2. `from` が `impl-<N>` か。違えばレビューせず、返さずに kompiro に知らせる
3. 1 行目が `review-request step8 k=<k> head=<sha>` か `review-request cli head=<sha>` か。どちらでもなければ
   実行せず kompiro に知らせる
4. メッセージにある worktree のブランチの HEAD（`git -C <path> rev-parse HEAD`）が `<sha>` と同じか。違えば
   レビューせず、`impl-<N>` に `declined: HEAD is <実際の sha>, not <sha>` を返して kompiro に知らせる

## 3. レビューする

その worktree で、base との差分（`git diff origin/main...HEAD`）に当てる。

- `step8`: 毎回、実装の文脈を持たない新しい subagent で `/engineering:code-review` を当てる。2 回目と 3 回目は
  メッセージにある修正で触れたファイル全体に当てる。PR を作ったあとの確認の依頼もこの形で、CLI は当てない
- `cli`: `coderabbit review --agent --deep --base origin/main --committed` を 1 回だけ当てる。CLI が使えない
  （未インストール・未認証・枠切れ）なら当てずに、その理由を返す。このレビューは `~/.coderabbit/reviews/` に残り、
  `impl-<N>` の `gh pr ready` のゲートも済みと数える

## 4. 返す

`impl-<N>` に、1 行目を `review-result head=<sha>` にして送る。本文には次を入れる。

- 指摘の配列（`scripts/review/local-review-record.ts` が読む `{reviewer, sev, where, finding}` の形。レビュアーは
  手順 8 なら `engineering`、CLI なら `cli`）
- レビューしたコミット
- CLI の依頼なら、当てたか（当てなかったなら理由）

送ったら kompiro に「`impl-<N>` に何件返したか」を 1 行で知らせてターンを終える。
