# AT: `karasu diff` が after のモデルの resolver warning を報告する

- **日付**: 2026-10-11
- **関連 Issue**: [#2879](https://github.com/kompiro/karasu/issues/2879)
- **対象ファイル**:
  - `packages/core/src/compile/compile-diff.ts`（`resolveBeforeAfter` / `collectAfterWarnings`）
  - `packages/core/src/resolver/model-warnings.ts`（`collectModelWarnings`。#3097 で `compile.ts` から移した）
  - `packages/cli/src/diff.ts`
  - `packages/cli/src/report-diagnostics.ts`（`reportWarnings`）
  - `packages/cli/src/compile-system-view.ts`（`diagLocFormatter` の `entryLabel`）
- **関連 ADR**: ADR-1020（`karasu diff` CLI）, ADR-1025（bundled all-views diff）

## 受け入れ条件

- [x] `compileSystemDiff` / `compileDeployDiff` / `compileOrgDiff` が after のモデルの warning を返し、before にしか無い warning を返さない。
  > ✅ Automated — `packages/core/src/compile/compile-diff-warnings.test.ts` › `compile%sDiff reports after's warning and not before's`

- [x] bundled diff（`buildAllViewsSvgDiffProject`）は 3 view を描いても、同じ warning を 1 回だけ返す。
  > ✅ Automated — `packages/core/src/compile/compile-diff-warnings.test.ts` › `the bundled diff reports each warning once, not once per view`

- [x] 各 view の diff の warning は、after を `compileProject` でその view にコンパイルしたときの warning と一致する（`resolveStyles()` が位置なしで言い直す style warning を除く）。
  > ✅ Automated — `packages/core/src/compile/compile-diff-warnings.test.ts` › `the %s diff reports what the per-view compile of after reports`

- [x] after が import した style sheet の warning は、その sheet のファイルを位置に持つ。before の style sheet は検証しない。
  > ✅ Automated — `packages/core/src/compile/compile-diff-warnings.test.ts` › `a warning from a sheet after imports keeps that sheet's file` / `does not validate before's style sheet`

- [x] before と after の診断がそれぞれ 1 回だけ出る。両側が同じ style sheet を import しても循環 import を報告せず、after の sheet が残る。
  > ✅ Automated — `packages/core/src/compile/compile-diff-warnings.test.ts` › `reports each side's diagnostics once` / `lets both sides import the same style sheet without a circular-import report`

- [x] `karasu diff` が既定（bundled）と `--view system | deploy | org` のすべてで after の warning を 1 回だけ出し、before の warning を出さない。after の entry で起きた warning は `Warning: <after>:<line>:<col>: ...` の形で出る（import 先のファイルで起きた warning は次の条件）。
  > ✅ Automated — `packages/cli/src/diff.test.ts` › `prints after's warning, and not before's, on %s`

- [x] after が import した style sheet の warning は、after の entry ではなくその sheet のファイル名で出る。
  > ✅ Automated — `packages/cli/src/diff.test.ts` › `names an imported style sheet's own file, not the after entry`

- [x] info の kind（`domain-dispersal` など）は `Info:` で出る。warning があっても終了コードは 0 のまま。
  > ✅ Automated — `packages/cli/src/diff.test.ts` › `prints an info-severity warning with an \`Info:\` prefix` / `does not fail the diff on warnings`

- [x] after を stdin（`-`）から読んだとき、entry の warning は一時ファイルのパスではなく `-` で出る。
  > ✅ Automated — `packages/cli/src/diff.e2e.test.ts` › `names a stdin after side \`-\` in its warnings`

## 手動確認

N/A — 自動テストですべて覆っている（git の external diff から呼んでも同じ CLI が同じ引数で走る）

## 補足

- `karasu diff` の**診断**（error / warning severity の Diagnostic）の表記は変えていない。ファイル名を出すかは before / after の 2 系統の示し方が未決のため、Design Doc の「決めないこと」に残している。
- 既定の `karasu render` が style-value warning を出さなかった食い違いは #3097 で解消した。
