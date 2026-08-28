---
paths:
  - ".github/workflows/*.yml"
---

# Stacked PR の運用ルール

**到達状態**: レビュー中のスタックで、draft でない PR が最下層の 1 本だけ。
`gh pr list --json number,isDraft,baseRefName` を見て、base が `main` の 1 本以外が
すべて `isDraft: true` になっている。

このファイルには 2 つの入口がある:

- **workflow 編集時** — frontmatter の `paths:` にマッチして自動で読み込まれる
- **スタックを作る・レビューを進める・マージ後に sync するとき** — ファイル編集を
  伴わないので自動では読み込まれない。`gh stack` を打とうとしたら、その時点で
  本ファイルを明示的に読む

手順の正本は `docs/process.md`「Stacked PR の進め方」、決定の経緯は
[ADR-2643](../../docs/adr/2643-stacked-pr-workflow.md)。ここには機械が検出できない
（自分で守るしかない）ものだけを置く。

## スタックを進めるとき

**draft を外すのは `gh pr ready <番号>` で 1 本ずつ行う。** `gh stack submit --auto
--open` は新規 PR だけでなく既存 PR も ready にするので、スタック全体が一度に
レビュー対象になり到達状態が壊れる。新しいスタックを push するときも `--open` は
付けない（`submit --auto` は既定で draft を作る）。

`gh stack sync` はマージ直後にだけ打つ。sync は上位ブランチを force-push するので、
最下層で走っている required E2E を cancel する。レビュー指摘への修正 push と同じ
タイミングで sync しない。

マージ後の順序は `gh stack merge <PR番号> --yes --squash` → `gh stack sync --prune`
→ `gh pr ready <新しい最下層>`。ready を先に打つと、直後の force-push が走り出した
CI を cancel する。sync を先に置けば CodeRabbit も main 取り込み後の diff を読む。

マージは `gh pr merge` では通らない。PR 番号を渡した `gh stack merge` は、その PR
まで（スタック全体ではなく）をマージする。

## workflow を触るとき

draft PR で skip する job を増減したら、`scripts/ci/workflow-draft-gate.test.ts` の
`DRAFT_GATED_JOBS` と ADR-2643 を同じ PR で更新する。

**`if: github.event.pull_request.draft != true` を足す job には、同じ PR でその
workflow の `types:` に `ready_for_review` を足す。** job-level の `if:` で skip された
job は Required check に success を報告するので、片方だけだと「draft を外した瞬間に、
一度も走っていない green」になる（[TPL-2643](../../docs/test-perspectives/TPL-2643-skip-reports-success-without-running.md)）。

検証:

```
pnpm test:scripts   # workflow-draft-gate.test.ts が skip と trigger のズレを落とす
```
