---
id: ADR-3257
title: app の E2E suite の step 境界を 25 分、job 予算を 45 分に上げる
status: accepted
date: 2026-10-17
topic: build
supersedes:
  - ADR-2807
related_to:
  - ADR-2805
  - ADR-1890
  - ADR-2687
scope:
  packages:
    - e2e
    - vscode-e2e
  concerns:
    - ci
assumptions:
  - "file: scripts/ci/workflow-timeout-policy.test.ts"
  - "symbol: scripts/ci/workflow-timeout-policy.test.ts :: OBSERVED_SETUP_MINUTES"
  - "grep: .github/workflows/e2e.yml :: timeout-minutes: 45"
  - "grep: .github/workflows/e2e-nightly.yml :: timeout-minutes: 45"
  - "grep: .github/workflows/vscode-e2e.yml :: timeout-minutes: 30"
  - "grep: .github/workflows/e2e-nightly.yml :: TEST_OUTCOME"
---

# ADR-3257: app の E2E suite の step 境界を 25 分、job 予算を 45 分に上げる

- **日付**: 2026-10-17
- **ステータス**: 決定済み
- **きっかけ**: [#3257](https://github.com/kompiro/karasu/issues/3257)。[#3222](https://github.com/kompiro/karasu/pull/3222) の Playwright が、1 件も落ちていないのに step 境界で打ち切られた
- **関連**:
  - [ADR-2807](2807-suite-budget-clears-its-setup.md): 本 ADR が supersede する。不変条件・setup の共有許容・nightly の報告規則はそのまま引き継ぎ、app の E2E の値だけを変える
  - [ADR-2805](2805-suite-timeout-bounds-the-test-step.md): 境界を test step に置くという最初の決定
  - [ADR-2687](2687-adr-body-is-immutable.md): ADR 本文は着地後に編集しない。値の変更が新 ADR になるのはこの規約による
  - [ADR-1890](1890-ci-runner-ubicloud.md): これらの job が載っている Ubicloud ランナー
  - [TPL-2805](../test-perspectives/TPL-2805-budget-bounds-the-work-it-names.md)
  - コード: `.github/workflows/e2e.yml`, `.github/workflows/e2e-nightly.yml`, `scripts/ci/workflow-timeout-policy.test.ts`

## 背景

ADR-2807 は `Run E2E tests` の step 境界を 15 分に置いた。この境界は「suite が
ハングした」を意味する値で、余裕の見積もりではない。当時の suite は 7.0〜10.0 分と
測られていた。

その後、app の E2E coverage program（[#3039](https://github.com/kompiro/karasu/issues/3039)）が
S1・S5・S6・S7 で spec を足し、suite は 270 件になった。`e2e.yml` の
`Run E2E tests` の所要時間（step 開始から終了まで）は次のとおり:

| 日付       | 通った run                                                                                | 備考                                                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-15 | 487〜705s                                                                                 |                                                                                                                                                  |
| 2026-10-16 | 512〜839s                                                                                 | 最大 839s は 15 分の境界まで残り約 1 分                                                                                                          |
| 2026-10-17 | 756s（270 件、[39041912730](https://github.com/kompiro/karasu/actions/runs/39041912730)） |                                                                                                                                                  |
| 2026-10-17 | —                                                                                         | 281 件、268 件 pass・0 件 fail の時点で 900s の境界に達して打ち切り（[39042134299](https://github.com/kompiro/karasu/actions/runs/39042134299)） |

最後の run では赤い Required check の意味が「suite がハングした」と一致しない。
ADR-2805/2807 が消そうとした、1 件も落ちていないのに打ち切られる形が、今度は
step 境界の側で起きている。#3039 には残りのスライスがあり、suite はまだ伸びる。

## 決定

**app の E2E（`e2e.yml#e2e` と `e2e-nightly.yml#e2e`）の `Run E2E tests` の境界を
25 分、job 予算を 45 分にする。** それ以外は ADR-2807 の決定をそのまま引き継ぐ。

- 不変条件は変えない: **job 予算 ≧ step 境界 + `OBSERVED_SETUP_MINUTES`（18 分）+
  `TEARDOWN_MINUTES`（2 分）**。45 ≧ 25 + 18 + 2。
- setup の許容は全 job 共通の 1 つの値のまま（18 分。run 34600028141 の 1030s）。
- nightly の tracking Issue は、job の result ではなく suite の判定
  （`steps.run-tests.outcome`）で動かすまま。
- `scripts/ci/workflow-timeout-policy.test.ts` が YAML から読んだ値で不変条件を検査する
  点も変えない。

| job                                 | test step                        | step 境界            | job 予算             |
| ----------------------------------- | -------------------------------- | -------------------- | -------------------- |
| `e2e.yml#e2e`                       | `Run E2E tests`                  | **25 分**（15 から） | **45 分**（35 から） |
| `e2e-nightly.yml#e2e`               | `Run E2E tests`                  | **25 分**（15 から） | **45 分**（35 から） |
| `vscode-e2e.yml#vscode-e2e`         | `Run extension host smoke tests` | 10 分                | 30 分                |
| `vscode-e2e.yml#vscode-webview-e2e` | `Run WebView E2E (ExTester)`     | 15 分                | 35 分                |

nightly も同じ値に揃えるのは、PR 側と同じ suite に加えて `serve` project
（[#3049](https://github.com/kompiro/karasu/issues/3049)）を走らせるからである。
PR 側より短い境界を置く理由がない。

## 理由

- **境界がハングだけを意味するようになる**: 通った run の最大 839s（14.0 分）に
  対して 1500s は約 1.8 倍で、遅いランナーを引いた日や #3039 の残りのスライスで
  通る run が切られない。一方で、全 spec が timeout まで粘る退行は 25 分で切れる。
  1 件 15 秒の timeout（`playwright.config.ts`）で 281 件すべてが粘れば 70 分を超えるので、
  25 分でもその形は境界に当たる。
- **不変条件を数字で満たす**: step 境界を上げた分だけ job 予算を上げるので、
  遅い mirror の日も step 境界が先に発火する。
- **suite の短縮とは別の問題として扱える**: 下の却下した案のとおり、suite を速くする
  手段はそれぞれ別の判断を要する。その判断が出るまで、Required check の赤が
  意味を失った状態を続けない。

## 却下した案

### 15 分を据え置き、spec の追加分を suite の短縮で吸収する

#3039 の Design Doc は当初この方針（「test step 15 分の予算は据え置く。追加分は
この中に収める」）だった。しかし `workers: 2` は [#3041](https://github.com/kompiro/karasu/issues/3041)
で 6 回測って不採用になり、再計測は [#3236](https://github.com/kompiro/karasu/issues/3236) と
[#3237](https://github.com/kompiro/karasu/issues/3237) の解消待ちである。短縮の手段が
決まるまで据え置くと、そのあいだ通る suite が赤になり続ける。

### suite を 2 job に shard する

1 job あたりの時間は半分になるが、Required check `Playwright` を複数 job からどう
集約するか、`e2e-skip.yml` の対の stub をどう揃えるか、ランナー費用が増えることの
3 点を決める必要がある。境界の意味を取り戻すという今回の目的には大きすぎるので、
必要になったら別 Issue で Design Doc から始める。

### 境界を 20 分にする

通った run の最大 14.0 分に対して余裕が 6 分しかなく、#3039 の残りのスライスで
また同じ見直しが要る。値を何度も変えると、そのたびに ADR を supersede することになる。

### 境界を job 予算にまとめて step 境界をなくす

ADR-2805 で却下した形に戻る。遅い mirror の日に、1 件も落ちていない suite が
job 予算で打ち切られる。

## 積み残し

- **suite の短縮は手つかず**。`workers: 2` の再計測（#3236 / #3237 の後）か shard が
  候補。通った run が 20 分（境界の 8 割）を超えたら、本 ADR の値ではなく suite の
  短縮を先に検討する。
- ADR-2807 の積み残し（`ci.yml#check` に境界が無い、`scripts/ci/` に workflow YAML
  パーサが 3 つある、cache-miss 経路の観測が薄い、`apt-get` の分散）は変わらず残る。
