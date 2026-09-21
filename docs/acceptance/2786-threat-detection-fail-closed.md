# AT: threat detection が結論を出せない回は run ごと失敗させる

- **日付**: 2026-09-21
- **関連 Issue**: [#2786](https://github.com/kompiro/karasu/issues/2786)（threat detection returns parse_error on every run, so safe outputs ship unchecked）
- **設計 (ADR)**: [ADR-2786](../adr/2786-threat-detection-fail-closed.md)
- **関連 TPL**: [TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md)（安全網の判定不能は通過ではなく失敗）
- **対象ファイル**:
  - `.github/workflows/dependabot-triage.md` / `.github/workflows/security-alert-sweep.md`（宣言）
  - `.github/workflows/*.lock.yml`（`gh aw compile` の生成物。実行されるのはこちら）
  - `scripts/ci/agentic-workflow-safety.test.ts`（posture と再生成忘れのガード）

> 安全網が働いていることを保証しているのは、detection job が `success` を返したという事実ではない。
> 既定の `continue-on-error: true` の下では、結論を出せなかった回も `success` を返すためである。
> 保証しているのは「結論を出せなければ run が失敗する」という宣言のほうなので、受け入れ条件も宣言と
> その生成物に対して書く。

## 受け入れ条件

- [x] AT-A: detection が結論を出せない回に宣言済み safe outputs が公開されない。両 workflow が `safe-outputs.threat-detection.continue-on-error: false` を宣言し、生成された lock が `GH_AW_DETECTION_CONTINUE_ON_ERROR: "false"` を持ち（欠落も finding）、`Conclude threat detection` ステップに `continue-on-error` が付いておらず、`safe_outputs` job の条件が承認済みの式と完全一致する（部分一致にすると `|| true` を含む式を通すため）

  > ✅ Automated — `scripts/ci/agentic-workflow-safety.test.ts` › `agentic workflow write scope` › `fails the run when threat detection cannot conclude`
  >
  > 「公開されない」を成立させているのは detection job の失敗そのものではなく、`continue-on-error` の不在と
  > `safe_outputs` の gate の組である。実行を観測せずこの 2 つを検査するのは、宣言だけが実行系の境界だという
  > [TPL-2658](../test-perspectives/TPL-2658-agent-write-scope-is-declared-not-prompted.md) と同じ理由による。
  > なお gate されるのは `safe_outputs` だけで、gh-aw の `conclusion` job は `always()` で走り detection に
  > 依存しないため、missing-tool / incomplete / failure レポート由来の Issue は失敗した run でも起こりうる。
  > これは [ADR-2786](../adr/2786-threat-detection-fail-closed.md)「影響」に記録した残る露出である

- [x] AT-B: frontmatter で pin した detection のモデルが lock に焼かれている（`gh aw compile` 忘れの検出）

  > ✅ Automated — `scripts/ci/agentic-workflow-safety.test.ts` › `agentic workflow write scope` › `compiles the declared detection model into its lock file`

- [x] AT-C: `threat-detection` は safe output として数えられず、既存の safe output 検査（allowlist・コンパイル済み）を 誤って落としも通しもしない

  > ✅ Automated — `scripts/ci/agentic-workflow-safety.test.ts` › `agentic workflow write scope` › `declares only safe outputs that leave the decision with a human` および `compiles every declared safe output into its lock file`

- [ ] AT-D（manual）: `Dependabot weekly triage` を `workflow_dispatch` で実行すると detection job が結論を出し （`detection_conclusion` が success）、safe outputs が従来どおり公開される

  > 🧑 Manual — https://github.com/kompiro/karasu/actions で dispatch し、detection job のログで
  > `COPILOT_MODEL: copilot/claude-haiku-4.5` が alias 解決を経ずに起動していることと、
  > `THREAT_DETECTION_RESULT` が出ていることを見る。pin が効くかどうかは Actions 上でしか判定できない。
  > 結論が出ない場合は [ADR-2786](../adr/2786-threat-detection-fail-closed.md)「却下した案」の
  > `threat-detection: false` との比較をやり直す

- [ ] AT-E（manual）: `Dependabot security alert sweep` でも pin が効き、detection が結論を出す

  > 🧑 Manual — W2 を dispatch し、AT-D と同じものを detection job のログで見る。W2 は
  > [ADR-2658](../adr/2658-gh-aw-dependency-automation.md) のとおり alert 自体を読めないため、ここで見るのは
  > detection が起動して結論を出すことだけで、sweep の成否は別問題

## 手動確認

AT-D / AT-E。どちらも「pin した model が catalog で解決して detection engine が起動するか」を問うもので、
判定に Actions 上の実行そのものが要る。実機確認は再実行される前提なのでチェックは常に未チェックのまま置く。

fail-closed の機構（detection が結論を出せない回に宣言済み safe outputs が公開されないこと）は AT-A が
自動で判定しているので、同じ条件を手動項目に写していない。
