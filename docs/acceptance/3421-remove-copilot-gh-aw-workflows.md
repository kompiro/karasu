# AT: Copilot で推論する workflow をリポジトリに置かない

- **日付**: 2026-10-31
- **関連 Issue**: [#3421](https://github.com/kompiro/karasu/issues/3421)（remove the Copilot-engine gh-aw workflows until a personally billed engine is available）
- **設計 (ADR)**: [ADR-3421](../adr/3421-remove-copilot-gh-aw-workflows.md)
- **対象ファイル**:
  - `.github/workflows/`、`.github/actions/`（検査の対象）
  - `scripts/ci/copilot-inference-policy.test.ts`（ガード）
  - `.github/workflows/actions.lock`（削除した workflow が載っていないこと）

> 雇用先の組織が用意した Copilot seat に推論の利用料が付かないことを保証しているのは、workflow を
> 起動しないという運用ではなく、推論を Copilot に向ける宣言がどの workflow にも無いという事実である。
> したがって受け入れ条件も宣言に対して書く。

## 受け入れ条件

- [x] AT-A: どの workflow にも、コメント行以外に `copilot-requests`・`write-all`・`COPILOT_GITHUB_TOKEN` の語と `engine: copilot` が無い（語として照合するので、YAML の書き方を問わない）
  > ✅ Automated — `scripts/ci/copilot-inference-policy.test.ts` › `Copilot inference policy (ADR-3421)` › `has no workflow that bills inference to a Copilot seat`
- [x] AT-B: gh-aw の source（`.github/workflows/*.md`）が無い（`engine:` を省いた source も copilot で動くため、source があること自体を落とす）
  > ✅ Automated — `scripts/ci/copilot-inference-policy.test.ts` › `Copilot inference policy (ADR-3421)` › `has no gh-aw workflow source`
- [x] AT-C: 検査が空振りしていない（`.github/workflows/` の `.yml` を 1 つ以上読んでいる）
  > ✅ Automated — `scripts/ci/copilot-inference-policy.test.ts` › `Copilot inference policy (ADR-3421)` › `scans the workflow directory`
- [x] AT-D: `actions.lock` が削除後の workflow の集合と一致している
  > ✅ Automated — `.github/workflows/verify-lockfile.yml` › `gh actions-lock --verify`（required check `verify`）

## 手動確認

N/A — 自動テストですべて覆っている
