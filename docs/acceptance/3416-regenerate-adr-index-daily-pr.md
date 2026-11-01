---
type: tooling
---

# AT: ADR の生成物を毎日の PR で再生成する（#3416）

- **日付**: 2026-10-31
- **関連 Issue**: [#3416](https://github.com/kompiro/karasu/issues/3416)
- **Related TPLs**: [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)（人を通らないマージを許す判定は最終の差分で行い、読めない設定や再生成でない差分は記録の免除に当たらない）、[TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md)（生成器が動かない、再生成が止まった、を通過ではなく失敗にする）、[TPL-1725](../test-perspectives/TPL-1725-gated-test-suite-detection-gap.md)（生成器の版上げの PR でも `Validate` の本体を起動させる）
- **対象ファイル**:
  - `scripts/adr/generated.ts`（生成物のパスの集合と、差分の種類の判定）
  - `scripts/adr/check-generated.ts` / `scripts/adr/regenerate-at.ts`（`Validate` と pre-push の検査）
  - `scripts/adr/regenerate-pr-flow.ts` / `scripts/adr/regenerate-pr.ts`（`pnpm adr:regenerate-pr`）
  - `scripts/adr/check-freshness.ts` / `.github/workflows/adr-freshness.yml`（鮮度の見張り）
  - `scripts/review/tier.ts`（再生成 PR のローカルレビューの記録の免除）
  - `.github/workflows/adr-validate.yml` / `adr-validate-skip.yml` / `review-request.yml` / `lefthook.yml`

> ADR の PR は生成物（`docs/adr/effective.md`・`graph.md`・`graph/`）を運ばなくなり、無関係な ADR の PR 同士が生成物で衝突しなくなる。生成物は毎日の routine が `pnpm adr:regenerate-pr` で作る、生成物だけの PR が `main` に入れる。マージしてよいかは required check の `Validate` が差分で判定する。

## 受け入れ条件

### AC-1: `Validate` は 2 種類の PR だけを通す

- [x] AT-A: 生成物に触れない ADR の PR は通り、ADR と生成物を同じ PR で変えると落ちる

  > ✅ Automated — `scripts/adr/check-generated.repo.test.ts` › check-generated.ts on a real repository › passes an ADR PR that leaves the generated files alone ／ fails a PR that adds an ADR and regenerates in the same change ／ `scripts/adr/generated.test.ts` › classifyGeneratedDiff › an ADR PR that leaves the generated files alone is regular ／ generated files together with an ADR is mixed ／ deleting a generated file in an otherwise regular PR is mixed

- [x] AT-B: 生成物だけを変える PR は、head の入力から生成し直した結果とちょうど一致するときだけ通る。手で書き換えた生成物、`graph/` に足した余分なファイル、消した生成物は落ちる

  > ✅ Automated — `scripts/adr/check-generated.repo.test.ts` › check-generated.ts on a real repository › passes a regeneration PR that holds exactly the generator's output ／ fails a regeneration PR with a hand edit, an extra file or a deleted file ／ `scripts/adr/check-generated.test.ts` › compareTrees › names missing, extra and different files

- [x] AT-C: 再生成の PR を作った後に `main` へ別の ADR が入っても、`Validate` は PR の head で判定して通る

  > ✅ Automated — `scripts/adr/check-generated.repo.test.ts` › check-generated.ts on a real repository › judges a regeneration PR at its head after main has moved on

- [x] AT-D: ADR を `graph/` の下へ移す PR は、移動先だけの変更に見えずに落ちる（rename を検出しない差分で判定する）

  > ✅ Automated — `scripts/adr/check-generated.repo.test.ts` › check-generated.ts on a real repository › fails an ADR moved under the generated directory ／ `scripts/adr/generated.test.ts` › parseNameStatus › refuses a rename, which would hide the source path

- [x] AT-E: `paths.outputs` を変える PR は古い出力の削除だけを含めて通り、その後の再生成の PR が新しい出力先を作って通る。新しい出力先に同じ PR で書くと落ちる

  > ✅ Automated — `scripts/adr/check-generated.repo.test.ts` › check-generated.ts on a real repository › passes an outputs change that only deletes the old output, then its regeneration ／ `scripts/adr/generated.test.ts` › classifyGeneratedDiff › when the outputs move › writing the new output in the same PR is mixed ／ a generated-only diff across different outputs is not a regeneration

- [x] AT-F: 生成器が動かない head はどの PR でも落ちる。`package.json` / `pnpm-lock.yaml` だけの PR（`@kompiro/adr-tools` の版上げ）でも `Validate` の本体が走り、skip の workflow とは paths が揃っている

  > ✅ Automated — `scripts/adr/check-generated.test.ts` › checkGenerated › fails any PR whose head the generator cannot run on ／ `scripts/ci/adr-validate-paths-sync.test.ts` › adr-validate paths › is mirrored by the skip workflow's paths-ignore ／ covers the generator, its check and its config

### AC-2: `pnpm adr:regenerate-pr` が再生成の PR を作り、check を待ってマージする

- [x] AT-G: 生成物だけを変える PR を作り、段階のラベルをちょうど `risk: low` にし、required check と Review tier の成功を待って、push した head の SHA を固定してマージする。ruleset が required check を返さなければマージしない

  > ✅ Automated — `scripts/adr/regenerate-pr-flow.test.ts` › regeneratePr › opens a PR with an empty lease, labels it Low, and merges the pushed head ／ refuses to merge when the ruleset names no required checks ／ judgeChecks › passes when every name has only passing runs ／ waits for a name with no run or an unfinished run ／ drops a cancelled run that a later run of the same name replaced ／ ignores runs from apps other than GitHub Actions

- [x] AT-H: check が上限までに終わらなければ PR を残し、終了コード 3（待ちきれなかった）で終える。check が失敗した PR はマージしない。翌日の実行は最初にその PR をマージし、ブランチが消えるのを待ってから生成し直す。マージできなければ生成し直して head を入れ替え、マージする

  > ✅ Automated — `scripts/adr/regenerate-pr-flow.test.ts` › regeneratePr › leaves the PR open and exits 3 when the checks do not finish in time ／ does not merge when a check fails ／ merges yesterday's ready PR first, waits for its branch to go, then regenerates ／ regenerates over yesterday's PR when it cannot be merged ／ stops within the deadline

- [x] AT-I: 段階のラベルが `risk: low` 以外を含むか無いとマージしない。`review-request.yml` は同じ repo の `chore/adr-regenerate` から来た PR に `risk: high` を付けない（fork の同名ブランチには付ける）

  > ✅ Automated — `scripts/adr/regenerate-pr-flow.test.ts` › regeneratePr › does not merge when someone relabels the PR while it waits ／ labels › accepts exactly risk: low among the tier labels ／ `scripts/ci/review-request-regeneration-skip.test.ts` › review-request.yml regeneration skip › skips the branch the regeneration script pushes ／ skips it only when the head is this repository

- [x] AT-J: 差分が無い日は PR を作らず、開いている再生成の PR は閉じる。閉じた PR のブランチが残っていても、そのブランチの SHA を lease にして上書きし、新しい PR を作る

  > ✅ Automated — `scripts/adr/regenerate-pr-flow.test.ts` › regeneratePr › does nothing when main is current ／ closes the open PR when main is already current ／ pushes over a branch a closed PR left with that branch's SHA as the lease

- [x] AT-K: 見分け方の 4 つ（本文の印・head のブランチ名・head の repo・base）のどれかが合わない PR は更新もクローズもマージもしない。`paths.outputs` が変わった後は前日の PR を拾わない。専用の worktree が既にあれば何もせず失敗し、生成物の外を変える commit は push しない。push 直後に GitHub が古い head を返すあいだは待ち、別の commit のままなら失敗する

  > ✅ Automated — `scripts/adr/regenerate-pr-flow.test.ts` › findRegenerationPr › fails on a PR from our branch without the marker or with another base ／ ignores a fork's branch of the same name ／ regeneratePr › refuses to touch a hand-made PR on the branch ／ does not pick up yesterday's PR when the outputs changed on main ／ fails without touching an existing worktree ／ refuses a regenerated commit that is not a generated-only diff ／ waits while GitHub still reports the old head right after the push ／ fails when the head stays on another commit after the lag window

### AC-3: 再生成の PR はローカルレビューの記録なしで Review tier を通る

- [x] AT-L: 生成物だけを変える Low の PR は記録を求められない。ADR を含む、生成物に触れない、Low より上、設定が読めない、出力先が変わる PR では記録を求める。分類器の生成物のパスは `adr.config.json` と一致する

  > ✅ Automated — `scripts/review/tier.test.ts` › regenerationWaivesRecord › waives the record for a Low PR that changes only generated files ／ keeps the record for a PR that also changes an ADR ／ keeps the record for a PR that changes no generated file ／ keeps the record above Low ／ keeps the record when either config is missing or unreadable ／ keeps the record when the outputs differ between base and head ／ ADR_GENERATED_GLOBS › names the same paths as adr.config.json paths.outputs

### AC-4: 鮮度の見張りは、反映されていない変更が 50 時間を超えたときだけ失敗する

- [x] AT-M: `main` の生成物が今の入力どおりのとき、反映されていない ADR が 50 時間より新しいときは通り、50 時間を超えると失敗し、再生成がマージされればまた通る。生成器の版が窓の中で変わったときは判定を見送る

  > ✅ Automated — `scripts/adr/check-generated.repo.test.ts` › check-freshness.ts on a real repository › passes when main's index is current ／ passes while an unreflected ADR is younger than 50 hours ／ fails once an unreflected ADR is older than 50 hours ／ passes again after the regeneration merges ／ `scripts/adr/check-generated.test.ts` › judgeFreshness › skips the judgement when the generator changed in the window and nothing matches

## 手動確認

N/A — 自動テストですべて覆っている。routine からの実際の実行と、無関係な ADR の PR 2 本の同時マージは、マージ後にしか確かめられないので別の Issue で確かめる。
