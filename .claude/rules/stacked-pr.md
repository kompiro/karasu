---
paths:
  - ".github/workflows/*.yml"
---

# Stacked PR の運用ルール

**到達状態**: レビュー中のスタックで、draft でない PR が最下層の 1 本だけ。判定は
スタック内の PR に限って行う（`gh pr list` はスタック外の単独 PR も返すので使わない）。

```
gh stack view --json | jq -r '.branches[] | select(.pr.state == "OPEN") | .pr.number' \
  | xargs -I{} gh pr view {} --json number,isDraft,baseRefName \
      --jq '"\(.number) draft=\(.isDraft) base=\(.baseRefName)"'
```

`draft=false` が base `main` の 1 本だけになっている。

このファイルは workflow の編集で読み込まれ、workflow を編集するときの規則を持つ。
スタックを作る・進める手順の正本は [docs/process/stacked-pr.md](../../docs/process/stacked-pr.md)
（`gh stack` を打つ前に読む。`docs/process.md`「規約の所在」から引く）、決定の経緯は
[ADR-2643](../../docs/adr/2643-stacked-pr-workflow.md)。ここには機械が検出できない
（自分で守るしかない）ものだけを置く。

## workflow を触るとき

draft PR で skip する job を増減したら、`scripts/ci/workflow-draft-gate.test.ts` の
`DRAFT_GATED_JOBS`、ADR-2643、`docs/process/stacked-pr.md`「draft PR では分単位のジョブが
走らない」の job 一覧を同じ PR で更新する。テストは job 一覧の drift を落とすが、
散文側が古くなったことは落とせない。

**`if: github.event.pull_request.draft != true` を足す job には、同じ PR でその
workflow の `types:` に `ready_for_review` を足す。** job-level の `if:` で skip された
job は Required check に success を報告するので、片方だけだと「draft を外した瞬間に、
一度も走っていない green」になる（[TPL-2643](../../docs/test-perspectives/TPL-2643-skip-reports-success-without-running.md)）。

timeout の置き方は [.claude/rules/workflow-timeouts.md](workflow-timeouts.md) に分けてある。

検証:

```
pnpm test:scripts   # workflow-draft-gate.test.ts が skip と trigger のズレを落とす
```
