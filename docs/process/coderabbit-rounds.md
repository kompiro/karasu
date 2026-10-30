# karasu — CodeRabbit のラウンド

> High の PR で CodeRabbit のラウンドを回すときに読む（PR ワークフローの手順 15、`/coderabbit-converge`）。
>
> `docs/process.md` と同じ規律で書く。「今どうするか」だけを書き、経緯は ADR / Issue に置く
> （[ADR-2351](../adr/2351-process-md-holds-instructions.md)）。

### High の PR は CodeRabbit のラウンドが収束してから人間がレビューする

**到達状態**: 人間がレビューを開いた時点で、CodeRabbit の最後のレビューに答え終わり、未解決の review thread が 0
（Critical / Major は対応済み、直さない Minor は理由を書いて閉じてある）、そして人間の判断が要る論点は PR 上で
質問済みになっている。

2 本目は **`--paginate` で全ページ数える**。`reviewThreads` を 1 ページだけ読むと、
古い未解決 thread が範囲外に落ちて `0` が返る。`--slurp` は `--jq` と併用できないので
`jq` に繋ぐ。

```
pnpm exec tsx scripts/coderabbit/await-review.ts <n> --once | jq -r .outcome
# => converged

gh api graphql --paginate --slurp -F n=<n> -f query='query($n: Int!, $endCursor: String) {
  repository(owner: "kompiro", name: "karasu") {
    pullRequest(number: $n) {
      reviewThreads(first: 100, after: $endCursor) {
        nodes { isResolved }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}' | jq '[.[].data.repository.pullRequest.reviewThreads.nodes[]
          | select(.isResolved == false)] | length'
# => 0
```

CodeRabbit は approve も changes-requested も出さず、どのレビューも COMMENTED になる。収束したかどうかは
未解決の thread と、review 本文にしかない指摘への答えで見る。CodeRabbit は required check ではなく、マージ判断は
人間が持つ（例外は Low の auto-merge）。Design の PR では、人間は CodeRabbit の 1 回のレビューを待たずに読み始めてよい。

**PR を出した側がラウンドを収束させてから人間に渡す。** 再レビューを頼むのは、Critical / Major を直したラウンドだけ
にする。Minor だけを直したラウンドは、修正で触れたファイルに `/engineering:code-review` を当てて終える。再レビューが
3 回に達しても Critical / Major が残れば、残りの指摘と取りうる進め方を添えて人間に渡す。人間は残りを読んだうえで
マージしてよい。人間の
レビューを CodeRabbit のラウンドと並走させない。並走させると収束途中の差分を人間が
読むことになり、次のラウンドで消える指摘に人間の時間を使う。
ラウンドは `/coderabbit-converge` で回す。CodeRabbit の応答を待つ・rate limit 明けに
再依頼する・指摘に対応して push する、を人間の取り次ぎなしで繰り返し、人間に渡せる
状態か人間の判断が要る状態になったら通知して止まる。

#### 人間に確認する指摘の判定

判断基準は 1 つ、**その指摘に従うと記録済みの決定が変わるかどうか**。記録済みの決定とは
Issue に書いたスコープ、`docs/adr/` の accepted な ADR、`docs/spec/`、`.claude/rules/`、
およびその PR で人間が明示した方針を指す。

| 指摘 | どうするか |
| --- | --- |
| 記録済みの決定を変えない（実装の誤り・記述の同期漏れ・誤検知・好みの範囲） | 対応可否を自分で決めて、直すか却下して解決する |
| 記録済みの決定を変える（スコープの拡縮、ADR / spec / rules の書き換え、別 ADR との衝突） | **直さずに人間へ確認する。** 指摘・該当する記録・取りうる選択肢を並べて聞く |

確認が要る論点が出ても、**それ以外の指摘は先に収束させる**。人間を待つあいだ手を止めない。
人間に渡すときは、残っている質問と、却下した指摘およびその理由をまとめて 1 回で伝える。

#### ラウンドの回し方

- 対象外は draft PR と `dependabot[bot]` / `renovate[bot]` の PR（依存更新は
  `/hane:dependabot` が別途トリアージ）。`ignore_usernames` は完全一致なので、
  他の bot を除外するには login を `.coderabbit.yaml` に足す
- ラウンドを回すのは High の PR だけ。Design の 1 回のレビューは回さず、届いた指摘を記録に足す
- 採用しない指摘は**返信で理由を書いてから閉じる**。Minor を直すかどうかは決めてよい（[review.md](review.md)「指摘の重大度と対応」）。
  従うべきか迷うものは、上の表に従って人間へ回す
- **閉じるのは読んだ thread だけ。** 判断基準はこの 1 つで、閉じ方はそれを守れる方を
  選ぶ。thread を名指しできるのは GraphQL の `resolveReviewThread` で、
  `@coderabbitai resolve` は開いている thread を**全部**閉じる（名指しできない）。
  **一覧と本文読みは分ける** — 一覧に本文を混ぜると、`comments` を何件で切っても
  その先を読まずに閉じられる形になる。一覧は件数だけ持たせ、本文は thread ごとに
  全ページ読む

  ```
  # 1. 未解決 thread の索引（id・場所・コメント件数だけ）
  gh api graphql --paginate --slurp -F n=<n> -f query='query($n: Int!, $endCursor: String) {
    repository(owner: "kompiro", name: "karasu") {
      pullRequest(number: $n) {
        reviewThreads(first: 100, after: $endCursor) {
          nodes { id isResolved path line comments { totalCount } }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }' | jq -r '.[].data.repository.pullRequest.reviewThreads.nodes[]
              | select(.isResolved == false)
              | "\(.id) \(.path):\(.line) comments=\(.comments.totalCount)"'

  # 2. その thread を全件読む（totalCount と出力行数が一致することを確かめる）
  gh api graphql --paginate --slurp -F id=<thread-id> -f query='query($id: ID!, $endCursor: String) {
    node(id: $id) {
      ... on PullRequestReviewThread {
        comments(first: 100, after: $endCursor) {
          nodes { author { login } body }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }' | jq -r '.[].data.node.comments.nodes[] | "[\(.author.login)] \(.body)"'

  # 3. 読んで対応を決めた thread だけを閉じる
  gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "<id>"}) { thread { isResolved } } }'
  ```

- **一括の `@coderabbitai resolve` を使うなら、投げる前に未解決 thread を全件読む。**
  投げてから処理されるまでに数分あり、**その間に届いたレビューの指摘も一緒に閉じられる**。
  投げたあとは、resolve コメントより後に届いたレビューがないか確かめる。あれば、その
  指摘は未読のまま閉じられている

  ```
  gh pr view <n> --json reviews \
    --jq '[.reviews[] | select(.author.login == "coderabbitai")] | last | .submittedAt'
  # resolve コメントの投稿時刻より後なら、その回の指摘を読み直す
  ```

- **`@coderabbitai resolve` は PR の top-level コメントとして投げる。** review thread
  への返信の中に書いても効かない（CodeRabbit が「Post it as a new top-level PR
  comment」と返して終わる）
- 返信が learnings になるのは `Learnings Added` が返ったときだけで、再発防止は
  次の 2 項で担保する
- 同じ規約違反を繰り返し指摘されるなら、`scripts/lint/` + lefthook の drift ガードに
  落とす合図として扱う
- 同じ**誤検知**を繰り返されるなら、`path_instructions` が規約の実態とずれている合図
  として扱う。返信で毎回閉じるのではなく、glob を実際の適用範囲まで絞るか、例外を
  instruction に書く
- **review 枠は開発者単位で他のリポジトリとも共有され、補充レートは直近 7 日の利用量が
  増えるほど下がる**（適応型の制限が掛かるプランでは最後は 1 回/時まで落ちる。段階はプランや契約ごとに違い、
  [rate limits](https://docs.coderabbit.ai/management/rate-limits) にある）。push では CodeRabbit は
  再レビューせず、再レビューは `@coderabbitai review` で頼んだときだけ走って枠を 1 回使う。main はラウンドの
  途中では取り込まず、収束した後にコンフリクトがあるときだけ取り込む。取り込みだけの push には再レビューを
  頼まない（`node scripts/review/tier.ts same-change --from <最後にレビューされたコミット>` が `same: true` の
  とき、PR の変更は変わっていない）。上限に当たると
  サマリーコメントに「Next included review available in N minutes」が出るが、
  **CodeRabbit は明けても自分では再レビューしない。** 告知時刻を過ぎてから
  `@coderabbitai review` を 1 回投げる。それより前に投げても「Review rate limited.」で
  弾かれ、枠の試行回数を増やすだけになる。1 ラウンドの修正はまとめて 1 回の push にする。
  状態の判定は `pnpm exec tsx scripts/coderabbit/await-review.ts <n> --once`
- 設定は `.coderabbit.yaml`（レビュー言語・除外パス・path ごとの規約）
