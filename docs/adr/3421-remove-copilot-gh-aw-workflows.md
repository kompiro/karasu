---
id: ADR-3421
title: Copilot で推論する gh-aw の workflow を外し、個人の課金で動かせるまで戻さない
status: accepted
date: 2026-10-31
topic: build
scope:
  concerns: [ci, dependencies]
supersedes:
  - ADR-2658
  - ADR-2786
  - ADR-2839
related_to: [ADR-2753, ADR-2877, ADR-3412]
assumptions:
  - "file: scripts/ci/copilot-inference-policy.test.ts"
  - "grep: docs/release.md :: ### エージェントによる下ごしらえ"
---

# ADR-3421: Copilot で推論する gh-aw の workflow を外し、個人の課金で動かせるまで戻さない

- **日付**: 2026-10-31
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3421](https://github.com/kompiro/karasu/issues/3421)（削除と、戻すときの作業）
  - 置き換えた Issue: [#3415](https://github.com/kompiro/karasu/issues/3415)（gh-aw の生成物と `actions.lock` の食い違い）
  - supersede した ADR: [ADR-2658](2658-gh-aw-dependency-automation.md)（gh-aw の導入）、
    [ADR-2786](2786-threat-detection-fail-closed.md)（threat detection を fail closed にする）、
    [ADR-2839](2839-pause-dependabot-triage-schedule.md)（週次 cron の停止）
  - [ADR-3412](3412-workflow-actions-lockfile.md)（`actions.lock`。gh-aw の暫定運用の節はこの ADR で不要になった）

## 背景

ADR-2658 で、Dependabot PR の upstream 追跡と security alert の突き合わせを 2 本の gh-aw workflow
（`dependabot-triage` と `security-alert-sweep`）に任せた。どちらも `engine: copilot` で、
`copilot-requests: write` によって推論の利用料を `GITHUB_TOKEN` 経由で maintainer の Copilot seat に付ける。

この seat は個人の契約ではなく、雇用先の組織が用意したものである。週次の cron は ADR-2839 で止め、
security alert sweep には元から cron が無いが、dispatch すれば今も雇用先の seat で推論が走る。
個人の開発に会社の seat を使い続ける形は避けたい。

あわせて、ADR-3412 で `actions.lock` を入れてから、`gh aw compile` の出力と `gh actions-lock` の書き換えが
同じ `uses:` 行で食い違っていた（暫定の 2 段の再生成、#3415）。

## 決定

Copilot で推論する workflow をリポジトリに置かない。gh-aw の 2 本（`.md` と `.lock.yml`）、
`.github/aw/`、それらを検査する CI テスト（`gh-aw-lock-consistency.test.ts`・`agentic-workflow-safety.test.ts`）を外し、
`scripts/ci/copilot-inference-policy.test.ts` が workflow の `copilot-requests`・`write-all`・
`COPILOT_GITHUB_TOKEN` の語と `engine: copilot`、それに gh-aw の source（`.github/workflows/*.md`）を落とす。個人の課金で推論できるエンジンが使えるようになったら、#3421 で戻す。

## 理由

- **dispatch のみでも利用料は雇用先の seat に付く。** cron を止めた状態は「勝手には走らない」だけで、
  手で起動すれば同じ seat を使う。workflow が残っているかぎり、起動するかどうかの判断が毎回要る
- **外しても失う機能は小さい。** 週次の cron は ADR-2839 から止まっていて、所見の不足（#2838）と
  threat detection（#2786）も解けていなかった。トリアージは手元の `/hane:dependabot` と
  `/hane:security-alert` で回している
- **ガードをテストに置く。** workflow を足す PR は誰でも出せるので、宣言を検査するテストで止める。
  コメント行は数えない（実行に効かないので、無効にした設定を残しておける）。gh-aw の source は `engine:` を省くと copilot になり、行の照合では
  読めない書き方もあるので、source があること自体を落とす
- **#3415 の問いは戻すときに決める。** 生成物が無ければ `gh aw compile` と `gh actions-lock` は食い違わない。
  戻す時点の gh-aw と gh-actions-lock の機能で決めるほうが、今決めるより正確である

### 戻すとき

- 削除した commit の親から、この PR が外したものを戻す: 2 本の workflow・`.github/aw/`・2 本のテスト・
  `.gitattributes`（`*.lock.yml` を linguist-generated にする 1 行）・`workflow-runner-policy.test.ts` の
  生成ジョブにだけ許した `ubuntu-slim` の例外・`docs/release.md` と `.claude/rules/dependabot.md` の該当節。
  `tier.test.ts` の例に使ったテストのパスも戻してよい
- その時点の gh-aw で `gh aw compile` をやり直し、`gh actions-lock` で `actions.lock` を作り直す
- `copilot-inference-policy.test.ts` は、戻すエンジンの課金先に合わせて同じ PR で書き換える
- gh-aw の生成物と `actions.lock` の扱い（#3415 の問い）を決めて ADR に残す。この ADR は supersede される

## 却下した案

- **workflow を残し、dispatch しない運用にする。** 起動しないことを人の注意に頼る形で、
  cron を止めた ADR-2839 の状態と変わらない
- **`COPILOT_GITHUB_TOKEN` に個人の PAT を入れて動かす。** 個人で使える Copilot の契約が前提で、
  それが用意できるなら戻す条件そのものが満たされる。今の時点では選べない
- **別のエンジン（API キーで課金するもの）に替えて残す。** 個人の API キーと利用料の管理が新しく要り、
  threat detection や所見の不足など、gh-aw の側の課題も持ち越す。戻すときの選択肢として #3421 に残す
