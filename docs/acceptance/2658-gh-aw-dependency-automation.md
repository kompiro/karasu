# AT: Dependabot トリアージと security alert sweep をエージェントに下ごしらえさせる

- **日付**: 2026-08-31
- **関連 Issue**: [#2658](https://github.com/kompiro/karasu/issues/2658)（automate Dependabot triage and security-alert sweeps with gh-aw）
- **関連 TPL**: [TPL-2658](../test-perspectives/TPL-2658-agent-write-scope-is-declared-not-prompted.md)（書き込み範囲は宣言で検証する）
- **対象ファイル**:
  - `.github/workflows/dependabot-triage.md`（週次。open な Dependabot PR を upstream まで遡って所見コメントを書く）
  - `.github/workflows/security-alert-sweep.md`（dispatch のみ。alert を掃いてトラッキング Issue を起票する）
  - `.github/workflows/*.lock.yml`（`gh aw compile` の生成物。実行されるのはこちら）
  - `scripts/ci/agentic-workflow-safety.test.ts`（書き込み範囲とコンパイル済みかのガード）
  - `scripts/ci/workflow-runner-policy.test.ts`（生成ジョブのランナーラベル）

> エージェントがマージしないことを保証しているのは prompt の「マージしません」ではなく、
> frontmatter の safe outputs に `merge-pull-request` が無いという事実である。前者は助言で、
> 後者だけが実行系の境界になる。したがって受け入れ条件も宣言に対して書く。

## 受け入れ条件

- [x] AT-A: 宣言された safe outputs が allowlist（コメント・Issue 起票・不足報告）の内側にあり、マージ・push・close・dispatch を含まない

  > ✅ Automated — `scripts/ci/agentic-workflow-safety.test.ts` › `agentic workflow write scope` › `declares only safe outputs that leave the decision with a human`

- [x] AT-B: 推論を賄う `copilot-requests: write` を除き、宣言された permission がすべて read である

  > ✅ Automated — `scripts/ci/agentic-workflow-safety.test.ts` › `agentic workflow write scope` › `asks for read permissions only, apart from paying for its own inference`

- [x] AT-C: frontmatter の宣言が `.lock.yml` にコンパイル済みである（`gh aw compile` 忘れの検出）

  > ✅ Automated — `scripts/ci/agentic-workflow-safety.test.ts` › `agentic workflow write scope` › `compiles every declared safe output into its lock file`

- [x] AT-D: 生成された `.lock.yml` のジョブが ADR-1890 のランナーポリシーの内側にある

  > ✅ Automated — `scripts/ci/workflow-runner-policy.test.ts` › `GitHub Actions runner policy (ADR-1890)` › `uses only the sanctioned runner labels`

- [ ] AT-E（manual）: `Dependabot weekly triage` を `workflow_dispatch` で実行すると、open な Dependabot PR それぞれに upstream 追跡の所見コメントが付き、バッチのサマリ Issue が 1 件起票される

  > 🧑 Manual — https://github.com/kompiro/karasu/actions で workflow を dispatch し、実行後に `gh pr list --author "app/dependabot" --state open` の各 PR を見る。判定には実際の Actions 実行とエージェントの出力が要る。マージ・close が起きないことは AT-A の宣言検査が受け持つので、ここでは観測しない

- [ ] AT-F（manual）: `Dependabot security alert sweep` を `workflow_dispatch` で実行すると alert 一覧を取得できる（`403` が返るなら `Dependabot alerts: read` を持つ GitHub App のトークンを `DEPENDABOT_ALERTS_TOKEN` に置いて再実行する）

  > 🧑 Manual — `GITHUB_TOKEN` + `vulnerability-alerts: read` で Dependabot alerts を読めるかは実行するまで確定しない。この項目がその検証を兼ねる

- [ ] AT-G（manual）: 実行 1 回あたりの credit 消費を確認し、`max-ai-credits` の上限を置くかを判断する

  > 🧑 Manual — `gh aw logs` / `gh aw audit <run-id>` で消費を読む。W1 の upstream 追跡は fetch が多く、上限値は実測してからでないと決められない

## 手動確認

AT-E / AT-F / AT-G。いずれも GitHub Actions 上での実行が判定そのものに要るため自動テストで代替できない。実機確認は再実行される前提なのでチェックは常に未チェックのまま置く。
