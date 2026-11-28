---
name: verify
description: >
  Start the verification session for Issue N, named verify-<N>, which waits for impl-<N> to send
  `ready-for-verify` by a cross-session message and then runs /pr-verify on that PR, handing fixes
  back to impl-<N> instead of giving kompiro a request to relay. kompiro types it in a new session
  as `/verify <N>`; a UserPromptSubmit hook names the session.
disable-model-invocation: true
---

# 検証セッション（`verify-<N>`）

kompiro が新しいセッションで `/verify <N>` を打つと始まる。`N` は作業の起点の Issue 番号。番号が無ければ聞く。

## 到達状態

- このセッションの名前が `verify-<N>` で、`impl-<N>` からの `ready-for-verify` を待っている
- `ready-for-verify` を受けるたびに、その PR に `/pr-verify` を当てている。差し戻しは `/pr-verify` の
  「実装セッションへの差し戻し」に従い、PR のコメントに残してから `impl-<N>` に送っている

**受けたときの規則は `docs/process/review.md`「セッション同士のやりとり」が正本。** 始める前に読む。

## 1. 名前を確かめる

`ListAgents` を呼び（deferred なら `ToolSearch` の `select:ListAgents,SendMessage` で読み込む）、1 行目の自分の名前を
見る。`verify-<N>` でなければメッセージを受けない。

- 自動の名前のまま: kompiro に `/rename verify-<N>` を頼む
- 一覧のほかの行にも `verify-<N>` がある: その行を示し、kompiro に古いセッションを閉じるか名前を変えてもらってから、
  `/verify <N>` を打ち直してもらう

確かめたら kompiro に「`impl-<N>` からの `ready-for-verify` を待つ」と 1 行で伝えてターンを終える。

## 2. メッセージを受けたとき

メッセージを受けるたびに、次を順に確かめる。

1. `ListAgents` で自分の名前が `verify-<N>` のままか。違えば何もしない
2. `from` が `impl-<N>` か。違えば実行せず、返さずに kompiro に知らせる
3. 1 行目で分ける
   - `ready-for-verify PR #<M> head=<sha>`: `/pr-verify <M>` を始める（`pr-verify` スキルを呼ぶ）。状態は
     メッセージの文ではなく、`/pr-verify` の gate が PR から読み直す
   - `declined: <理由>`: `/pr-verify` を始めず、kompiro に 1 行で知らせて止まる
   - それ以外: 実行せず kompiro に知らせる

`/pr-verify` の途中で別の PR の `ready-for-verify` が届いたら、今の PR を終えてから順に始める。1 回の
`/pr-verify` は 1 つの PR だけを扱う。

kompiro がこのセッションで `/pr-verify` を直接打ったときも、差し戻しの宛先は同じ規則（自分の名前の `N`）で決まる。
