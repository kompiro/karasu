---
type: tooling
---

# AT: 描画が変わる PR に before/after の画像を添付する（#3359）

- **日付**: 2026-10-29
- **関連 Issue**: [#3359](https://github.com/kompiro/karasu/issues/3359)
- **Related TPLs**: [TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md)（撮るかどうかはパスの一覧でなく全候補の SVG 比較で決める。パスの一覧は促すきっかけにだけ使う）、[TPL-2047](../test-perspectives/TPL-2047-doc-embedded-krs-is-parsed-not-prose.md)（`krs fragment` / `krs invalid` の fence は候補にしない）
- **対象ファイル**:
  - `scripts/pr-shots/shots.ts`（`pnpm pr:shots`）
  - `scripts/pr-shots/candidates.ts` / `scripts/pr-shots/compare.ts` / `scripts/pr-shots/render-side.ts` / `scripts/pr-shots/base-worktree.ts`
  - `scripts/pr-shots/reminder.sh`（`gh pr create` の後の PostToolUse フック）
  - `docs/process.md` / `.github/PULL_REQUEST_TEMPLATE.md` / `reports/README.md`

> 描画や UI が変わる PR では、差分のコードからは見た目の変化が分からない。エージェントは、merge-base と HEAD で同じ入力を描画して比べ、変わった組の画像を `gh pr edit --attach` で PR 本文に載せる。画像は repo にコミットせず、`reports/` に置く（ADR-2419）。

## 受け入れ条件

### AC-1: before と after の差が、そのブランチの変更だけで決まる

- [x] AT-A: before は merge-base の一時 worktree で描画される。worktree は実行ごとに別の場所に作られ（並行するセッションが互いの checkout を消さない）、正常に終わったときも失敗したときも消える。強制終了した実行が残したものは次の実行が消す

  > ✅ Automated — `scripts/pr-shots/base-worktree.test.ts` › base worktree › places the checkout under .claude/worktrees of the main checkout, per run ／ checks out the base, installs it, and removes it afterwards ／ removes the checkout when the work fails ／ removes what a killed run left behind, and keeps a live run's checkout ／ replaces a directory git no longer tracks

- [x] AT-B: 候補を選ぶ差分は merge-base から作業ツリーまでで、main が後から進めたコミットは入らない

  > ✅ Automated — `scripts/pr-shots/base-worktree.test.ts` › base worktree › resolves the merge base and the branch's own diff, main's later commits aside ／ counts uncommitted and untracked files, since HEAD's side renders the working tree

- [x] AT-C: 描画は決定的である（同じコードで 2 回描画すると、全 examples の全ビューで SVG が一致する）

  > ✅ Automated — `scripts/pr-shots/render-side.test.ts` › coreSide › renders every example entry identically twice

### AC-2: 撮るかどうかは SVG の比較で決まり、画像は 2 組までになる

- [x] AT-D: 候補は `--file` → 差分の受け入れテストの `krs` fence → `examples/` のエントリの順に並ぶ。`fragment` / `invalid` の fence と、同じディレクトリから import されているファイルは候補にならない

  > ✅ Automated — `scripts/pr-shots/candidates.test.ts` › collectCandidates › orders --file, then the diff's fences, then the examples ／ does not shoot a --file model a second time as an example ／ fenceCandidates › takes only the plain krs fences of the acceptance records in the diff ／ exampleEntries › keeps the files no sibling imports, whatever the import form

- [x] AT-E: SVG が変わった組だけを集め、画像にするのは最初の 2 組で、残りは名前で一覧にする

  > ✅ Automated — `scripts/pr-shots/compare.test.ts` › compareSides › collects the pairs whose SVG differs, in candidate then view order ／ renderBody › shows the shot pairs and lists the rest by name

- [x] AT-F: base で描画できない組は after だけになり、理由を添える。HEAD で描画できなくなった組は別に一覧にし、そのときは「No rendering change」と書かない（フックを黙らせない）。黙って誤った画像は出さない

  > ✅ Automated — `scripts/pr-shots/compare.test.ts` › compareSides › keeps a pair the base cannot render, as after-only ／ reports a pair that rendered at the base but fails at HEAD ／ renderBody with failures at HEAD › does not claim no change when pairs that drew at the base fail on the branch ／ `scripts/pr-shots/render-side.test.ts` › coreSide › fails, rather than drawing, a model with error diagnostics ／ reports a core that throws as a failure

- [x] AT-G: 描く中身の無いビュー（deploy や organization を持たないモデルの deploy / org ビュー）は比較の対象にならない

  > ✅ Automated — `scripts/pr-shots/compare.test.ts` › compareSides › ignores a view with nothing to draw on either side ／ `scripts/pr-shots/render-side.test.ts` › coreSide › marks deploy and org views without a deploy or organization block as empty

- [x] AT-H: 変わった組が 0 のときは、確かめた件数を添えた「No rendering change」の 1 行を出す

  > ✅ Automated — `scripts/pr-shots/compare.test.ts` › renderBody › states that nothing changed, with what was checked

### AC-3: 依頼されなくても撮るよう促され、描画に関わらない PR には促さない

- [x] AT-I: `gh pr create` の出力にある PR の差分が、`packages/core/src/` か `packages/app/src/` のテスト以外のファイル、または `examples/` に触れていて、`## Before / after` 節が空のときに、フックが `pnpm pr:shots` を促す（テンプレートのコメントだけの節は空とみなす）

  > ✅ Automated — `scripts/pr-shots/reminder.test.ts` › pr-shots reminder hook › reminds when core rendering code changed and the section is still the template ／ reminds when an example changed ／ reminds when app UI source changed ／ reminds when the section is missing altogether ／ still reminds when the only image is outside the section ／ reminds on PostToolUseFailure, when a later command in the call failed ／ falls back to the PR's file list when GitHub refuses the diff of a large PR ／ does not count an attached file that is not an image

- [x] AT-J: テスト・docs・ほかのパッケージだけの PR、節に添付画像か「No rendering change」の行がある PR、`gh pr create` を実行していない Bash の呼び出しでは、フックは何も出さない

  > ✅ Automated — `scripts/pr-shots/reminder.test.ts` › pr-shots reminder hook › stays silent when the PR changes only tests ／ stays silent when the PR changes only docs ／ stays silent when the PR changes only another package ／ stays silent when the section carries an attached image ／ stays silent when pr:shots found no rendering change ／ stays silent and never calls gh for commands without pr create ／ stays silent when the output carries no PR URL (a grep, a heredoc)

### 手動確認

- [ ] M-1: 描画が変わる実際の PR で `pnpm pr:shots` を実行し、出力された `gh pr edit <n> --body-file … --attach …` を実行すると、PR 本文の `## Before / after` 節に before と after の画像が GitHub 上で表示される。repo には画像がコミットされない
