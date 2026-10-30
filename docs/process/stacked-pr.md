# karasu — Stacked PR

> `gh stack` を打つ前に読む。workflow の draft 判定を編集するときの規則は `.claude/rules/stacked-pr.md`。
>
> `docs/process.md` と同じ規律で書く。「今どうするか」だけを書き、経緯は ADR / Issue に置く
> （[ADR-2351](../adr/2351-process-md-holds-instructions.md)）。

### Stacked PR の進め方

1 つの仕事を依存順のブランチ列に割り、各層を 1 PR にする運用（`gh stack`）。
コマンドの詳細は `/gh-stack` スキル、workflow の draft 判定を編集するときの規則は
[.claude/rules/stacked-pr.md](../../.claude/rules/stacked-pr.md)、決定の経緯は
[ADR-2643](../adr/2643-stacked-pr-workflow.md) を参照。

**レビュー対象はスタック最下層（base が `main`）の 1 本だけで、残りは draft のまま
置く。** 検証もレビューも最下層でだけ起きる。

**到達状態**: レビュー中のスタックで、draft でない PR が最下層の 1 本だけ。判定は
スタック内の PR に限って行う（`gh pr list` はスタック外の単独 PR も返すので使わない）。

```
gh stack view --json | jq -r '.branches[] | select(.pr.state == "OPEN") | .pr.number' \
  | xargs -I{} gh pr view {} --json number,isDraft,baseRefName \
      --jq '"\(.number) draft=\(.isDraft) base=\(.baseRefName)"'
```

`draft=false` が base `main` の 1 本だけになっている。

| # | すること |
| --- | --- |
| 0 | 最下層以外を draft にする（`gh pr ready <n> --undo`） |
| 1 | 最下層が draft のうちに、最下層のブランチで base（`main`）との差分（`git diff origin/main...HEAD`）に `/engineering:code-review` を当て、続けて同じ差分に CodeRabbit CLI を 1 回だけ当てる（`coderabbit review --agent --deep --base origin/main --committed`。CLI が使えない環境では飛ばし、3 の ready に `KARASU_LOCAL_REVIEW_SKIPPED=<理由>` を付ける） |
| 2 | `/engineering:code-review` と CLI の指摘を [review.md](review.md)「指摘の重大度と対応」に従って扱い、直したものを push して、段階のラベルとローカルレビューの記録を最下層の PR に付ける（記録済みの決定を変えるものだけ人に確認する）。draft への push は CodeRabbit の review 枠を使わない |
| 3 | 最下層の draft を外す（`gh pr ready <n>`）。分単位の CI と、High / Design なら CodeRabbit がここで動き出す |
| 4 | High なら `/coderabbit-converge` で CodeRabbit のラウンドを回す（判定基準は 2 と同じ） |
| 5 | Critical / Major の未対応が無くなるか、人の判断待ちで止まるまで 4 が繰り返す |
| 6 | ラウンドが収束したら（High 以外は 3 の後すぐ）、そのスライスで観測できることを人が確認し、マージ可否を決める |
| 7 | `gh stack merge <n> --yes --squash` → `gh stack sync --prune` → 新しい最下層で 1 に戻る |

- **`gh stack submit --auto --open` は使わない。** `--open` は新規 PR だけでなく
  既存 PR も ready にするので、スタック全体が一度にレビュー対象になりステップ 0 が
  壊れる。draft を外すのは常に `gh pr ready <番号>` で 1 本ずつ（`submit --auto` は既定で draft を作る）
- `gh stack sync` はマージ直後にだけ実行する。sync は上位ブランチを force-push し、
  走っている required E2E を cancel する。レビュー対応の push と混ぜない
- ステップ 7 → 1 → 3 の順序は sync が先、ready が後。逆にすると ready で走り出した CI を
  直後の force-push が cancel する。sync を先に置けば CodeRabbit も main 取り込み後の
  diff を読む
- マージは `gh stack merge <PR番号>`。`gh pr merge` はスタックでは通らない。PR 番号を
  渡すと、スタック全体ではなくその PR までがマージ対象になる
- Issue の status ラベルは、draft のあいだ `status: implementing`、draft を外したら
  `status: in-review`。親 Issue の `## Slice status` 表に draft / ready は書かない
  （[.claude/rules/program-slices.md](../../.claude/rules/program-slices.md) の二重管理禁止）
- 受け入れテストは、そのスライスが観測可能にしたものだけを対象にする。内部だけの
  スライスは AT なしでマージしてよい

#### draft PR では分単位のジョブが走らない

`Check` / `Playwright` / VS Code E2E / preview・docs preview のデプロイは、draft の
あいだ skip される（[ADR-2643](../adr/2643-stacked-pr-workflow.md)）。上位層は最下層に
降りてきて draft を外した時点で、初めて本番の CI を通る。秒で終わる validator
（ADR / TPL / reference docs / AT coverage）と gitleaks は draft でも走り続ける。

skip は workflow ごと止めるのではなく job の `if:` で行う。**job-level の `if:` で
skip されたジョブは Required check に success を報告する**ので、`types:` の
`ready_for_review` と必ず対で置く。片方だけだと、draft を外した瞬間に「一度も
走っていない green」でマージできてしまう。両者のズレは
`scripts/ci/workflow-draft-gate.test.ts` が落とす。
