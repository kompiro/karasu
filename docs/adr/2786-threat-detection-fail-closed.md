---
id: ADR-2786
title: 安全網が結論を出せない回は run ごと失敗させ、detection のモデルを pin する
status: accepted
date: 2026-09-21
topic: build
refines:
  - ADR-2658
related_to:
  - ADR-2839
  - ADR-2687
scope:
  concerns: [ci, security]
assumptions:
  - "file: .github/workflows/dependabot-triage.md"
  - "file: .github/workflows/security-alert-sweep.md"
  - "file: scripts/ci/agentic-workflow-safety.test.ts"
  - "grep: .github/workflows/dependabot-triage.md :: continue-on-error: false"
  - "grep: .github/workflows/security-alert-sweep.md :: continue-on-error: false"
---

# ADR-2786: 安全網が結論を出せない回は run ごと失敗させ、detection のモデルを pin する

- **日付**: 2026-09-21
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2786](https://github.com/kompiro/karasu/issues/2786)（threat detection が結論を出さない）
  - gh-aw の 2 本を入れた ADR: [ADR-2658](2658-gh-aw-dependency-automation.md)
  - W1 の cron を止めた ADR: [ADR-2839](2839-pause-dependabot-triage-schedule.md)
  - lock の再生成: [#2762](https://github.com/kompiro/karasu/issues/2762) / PR [#2787](https://github.com/kompiro/karasu/pull/2787)
  - upstream の同型事例: [github/gh-aw#52782](https://github.com/github/gh-aw/issues/52782)
  - TPL: [TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md)
  - AT: [`docs/acceptance/2786-threat-detection-fail-closed.md`](../acceptance/2786-threat-detection-fail-closed.md)
  - コード: `.github/workflows/dependabot-triage.md`、`.github/workflows/security-alert-sweep.md`、
    `scripts/ci/agentic-workflow-safety.test.ts`

## 背景

[ADR-2658](2658-gh-aw-dependency-automation.md) で入れた 2 本の gh-aw workflow は、safe outputs を公開する前に
threat detection（prompt injection・secret leak・悪意ある patch の検査）を通す。この安全網は導入以降の全実行で
一度も結論を出していない。

- 2026-09-03 と 2026-09-07 の実行は `parse_error`。detection モデルが sentinel 行を出さなかった。
- [#2762](https://github.com/kompiro/karasu/issues/2762) で lock を gh-aw v0.88.7 へ再生成した後、2026-09-14 と 2026-09-15 の実行は
  `engine_error` に変わった。copilot harness が `detection` alias を model catalog に対して解決できず、
  未解決の alias で Copilot を起動することを拒否している。同じ run の agent job は `auto` を解決できているので、
  catalog に届いていないのは detection job だけである。

いずれの回も、既定の `continue-on-error: true` によって detection job は `success` で終わった。`safe_outputs` job は
`needs.detection.result == 'success'` を条件にしているため、検査を通らない出力がそのまま公開された。
2026-09-07 は PR コメント 8 件と Issue [#2771](https://github.com/kompiro/karasu/issues/2771)、2026-09-15 は PR コメント 10 件と
Issue [#2837](https://github.com/kompiro/karasu/issues/2837) である。run のサマリはいずれも `success` と表示される。

**安全網が黙って止まっているこの状態は、安全網を切ってある状態より悪い。** 切ってあることは読めば分かるが、
黙って止まっていることは #2689 のコメントか job ログを開くまで分からず、緑のサマリは検査が通った回と区別がつかない。

## 決定

**detection が結論を出せなかった回は run ごと失敗させ（`safe-outputs.threat-detection.continue-on-error: false`）、
併せて detection が使うモデルを `copilot/claude-haiku-4.5` に pin して alias 解決を迂回する。**

前者は posture の決定で、後者は原因側への手当てである。両方を W1（`dependabot-triage.md`）と
W2（`security-alert-sweep.md`）の双方に入れ、`gh aw compile` で lock へ焼く。

## 理由

- **fail-open が守っているものが無い。** 安全網が結論を出せない回に得られるのは「検査を通っていない出力」であって、
  「検査を通った出力」ではない。前者に価値があるのは、それが検査済みだと誤解されない場合だけで、緑のサマリは
  まさにその誤解を作る。とりわけ W1 は、自分が管理していないパッケージの release notes・changelog・upstream リポジトリを
  読むのが仕事であり、prompt injection の面は仮定の話ではない。
- **止めるコストが実質ゼロである。** W1 の cron は [ADR-2839](2839-pause-dependabot-triage-schedule.md) で止まっており、W2 も
  dispatch 専用である。無人で回っている定期実行は 1 本も無いので、fail-closed 化で壊れる自動化は無い。
  失敗するのは人が dispatch した回だけで、その人は失敗を即座に見る。
- **pin を入れないと fail-closed が「常に失敗する workflow」になる。** posture だけを決めると、次の dispatch は
  何も公開せずに失敗して終わる。それでも fail-open よりは正しいが、安全網が働く状態には近づかない。
  pin は失敗している一点（alias 解決）だけを外す最小の手当てで、3 行消せば alias に戻せる。
- **宣言は機械で検査できる。** `scripts/ci/agentic-workflow-safety.test.ts` が、frontmatter の
  `continue-on-error: false`、lock の `GH_AW_DETECTION_CONTINUE_ON_ERROR: "false"`、
  `Conclude threat detection` ステップに `continue-on-error` が付いていないこと、
  frontmatter でモデルが pin され、それが detection job の lock に焼かれていることを検査する。
  いずれも detection job の中だけを読む（agent job は同名のキーを持つため）。posture を黙って戻すと CI が落ちる
  （[TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md)、[TPL-2658](../test-perspectives/TPL-2658-agent-write-scope-is-declared-not-prompted.md) と同じ立て付け）。

## 却下した案

- **fail-open のまま upstream の修正を待つ**: 待っている間、検査を通らない出力が dispatch のたびに公開され続ける。
  upstream の [#52782](https://github.com/github/gh-aw/issues/52782) は closed だが同型の症状が v0.88.7 で再発しており、いつ直るかは読めない。
- **`threat-detection: false` で安全網を明示的に無効化する**: 「黙って止まっている」状態は解消されるが、
  W1 が読む対象は prompt injection の面そのものなので、検査を捨てる判断にはならない。なお pin が効かないと分かった場合、
  この案と fail-closed の比較はやり直す価値がある。
- **posture だけ決めて pin は別 PR にする**: 決定としては独立しているが、pin の無い fail-closed は
  「次の dispatch で何も出ない」ことしか確かめられず、fail-closed が正しく働いた（検査を通って出力が公開された）ことを
  観測できない。posture の機構自体は実行を待たずに検査できる（AT-A）ので、残る未知は pin が効くかどうかだけであり、
  それを 1 回の dispatch で見るために同じ PR に入れる。
- **detection のモデルを alias ではなく `gh aw` の repository variable で指定する**: 指定先は同じ catalog なので、
  alias 解決が失敗する経路は変わらない。

## 影響

- W1 / W2 の dispatch で detection が結論を出せない場合、run は failure で終わり、`safe_outputs` job が skip される。
  宣言した safe outputs（PR コメントと `[dep-triage]` / `[security-alert]` Issue）は 1 件も公開されない。
- **残る露出**: gh-aw が生成する `conclusion` job は `always()` で走り、`if:` に detection の項を持たない。
  この job は `issues: write` を持ち、エージェント自身の missing-tool / incomplete / failure レポートから
  Issue を起こしうる。つまり「detection が検査していないエージェント由来のテキスト」が Issue になる経路は
  完全には閉じていない。閉じない理由は 2 つある — この経路が運ぶのはエージェントの所見ではなく
  「何ができなかったか」の報告に限られること、そして fail-closed で失敗した run を人が知る手段が
  まさにこの job であることである。塞ぐと失敗がまた見えなくなる。
  `scripts/ci/agentic-workflow-safety.test.ts` はこの区別をコメントとして持ち、gate しているのが
  `safe_outputs` だけであることを明示する。
- detection job の `COPILOT_MODEL` が `detection` から `copilot/claude-haiku-4.5` になる。pin が効くかどうかは
  Actions 上の dispatch でしか判定できないため、AT の手動項目として残す。
- ADR-2658 の本文は書き換えない（[ADR-2687](2687-adr-body-is-immutable.md)）。本 ADR が上書きするのは安全網の failure posture だけで、
  判定は人が行う・書き込み範囲は宣言で縛るという残りの決定は変わらないため、`supersedes` ではなく `refines` で結ぶ。
