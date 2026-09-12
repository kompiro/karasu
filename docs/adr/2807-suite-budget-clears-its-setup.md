---
id: ADR-2807
title: suite の job 予算は、共有の setup 観測最大を step 境界の上に載せて確保する
status: accepted
date: 2026-09-12
topic: build
supersedes:
  - ADR-2805
related_to:
  - ADR-1008
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
  - "grep: .github/workflows/e2e.yml :: timeout-minutes: 35"
  - "grep: .github/workflows/vscode-e2e.yml :: timeout-minutes: 30"
  - "grep: .github/workflows/e2e-nightly.yml :: TEST_OUTCOME"
---

# ADR-2807: suite の job 予算は、共有の setup 観測最大を step 境界の上に載せて確保する

- **日付**: 2026-09-12
- **ステータス**: 決定済み
- **きっかけ**: [#2807](https://github.com/kompiro/karasu/issues/2807)。[#2806](https://github.com/kompiro/karasu/pull/2806) のレビューで、ADR-2805 が定めた不変条件を ADR-2805 自身の値が満たしていないことが分かった
- **関連**:
  - [ADR-2805](2805-suite-timeout-bounds-the-test-step.md): 本 ADR が supersede する。step に境界を置くという決定はそのまま引き継ぐ
  - [ADR-2687](2687-adr-body-is-immutable.md): ADR 本文は着地後に編集しない。値の訂正が新 ADR になるのはこの規約による
  - [ADR-1008](1008-flaky-e2e-fixme-and-issue.md): flake 判定。打ち切られた job はこれに当たらない
  - [ADR-1890](1890-ci-runner-ubicloud.md): これらの job が載っている Ubicloud ランナー
  - [TPL-2805](../test-perspectives/TPL-2805-budget-bounds-the-work-it-names.md)
  - コード: `.github/workflows/e2e.yml`, `.github/workflows/e2e-nightly.yml`, `.github/workflows/vscode-e2e.yml`, `scripts/ci/workflow-timeout-policy.test.ts`

## 背景

ADR-2805 は「『suite がハングした』を意味する境界は test step に置き、job 予算は
setup を吸収する側に回す」と決め、不変条件を **job 予算 ≧ step 境界 + setup の
観測最大**と書いた。ところが同じ ADR が定めた値がその条件を満たしていなかった。

Actions API から attempt 単位で測り直した setup（job 開始 → test step 開始）:

| job | ADR-2805 の値 | setup 観測最大 | 必要量 |
| --- | --- | --- | --- |
| `e2e.yml#e2e` | job 30 / step 15 | 830s（[34606378392](https://github.com/kompiro/karasu/actions/runs/34606378392)） | 29 分 |
| `e2e-nightly.yml#e2e` | job 30 / step 15 | 55s | — |
| `vscode-e2e.yml#vscode-e2e` | job 20 / step 10 | **619s**（[34606326393](https://github.com/kompiro/karasu/actions/runs/34606326393)） | 21 分 |
| `vscode-e2e.yml#vscode-webview-e2e` | job 25 / step 15 | **1030s**（[34600028141](https://github.com/kompiro/karasu/actions/runs/34600028141)） | 33 分 |

`vscode-e2e` は 619 + 600 = 1219s で job 予算 1200s を超え、WebView は
1030 + 900 = 1930s で 1500s を超える。**その日の mirror をもう一度引けば、
ハングした test step は step 境界ではなく job 予算に先に殺される** — ADR-2805 が
消したはずの「1 件も落ちていないのに cancel された job」が、数字を大きくしただけで
戻ってくる。`e2e.yml` も 830 + 900 + 予備 = 1760s 前後で、1800s の予算に対して
残りは 1 分を切っていた。

guard 側にも同じずれがあった。`MIN_SETUP_MARGIN_MINUTES = 5` は不変条件ではなく
「差が 5 分以上」という弱い代用で、上の 20/10 を通すうえに、`e2e.yml` が 20/15 に
戻る退行 — #2805 そのものの形 — も通してしまう。

もう 1 つ、nightly の `notify` は `needs.e2e.result` が `success` でなければ
tracking Issue を開く。job 予算が setup で尽きたときの result は `cancelled` なので、
**1 件もテストが走っていないのに「Nightly E2E failing on main」が起票される**。
suite の判定を持つ `steps.run-tests.outcome` は job の `outputs` に宣言済みだったが、
どこからも読まれていなかった。

## 決定

**suite を走らせる job の予算は、`step 境界 + OBSERVED_SETUP_MINUTES` 以上とする。
`OBSERVED_SETUP_MINUTES` は 18 分で、出所は run 34600028141 の OS パッケージ
インストール 1013s。**

| job | test step | step 境界 | job 予算 |
| --- | --- | --- | --- |
| `e2e.yml#e2e` | `Run E2E tests` | 15 分 | 35 分 |
| `e2e-nightly.yml#e2e` | `Run E2E tests` | 15 分 | 35 分 |
| `vscode-e2e.yml#vscode-e2e` | `Run extension host smoke tests` | 10 分 | 30 分 |
| `vscode-e2e.yml#vscode-webview-e2e` | `Run WebView E2E (ExTester)` | 15 分 | 35 分 |

**この許容は job ごとの観測値ではなく、全 job 共通の 1 つの値にする。** これらは
同じランナークラスで同じ mirror から OS パッケージを引くので、遅い mirror は
共有のリスクである。速い mirror しか引いていない job は安全なのではなく、
標本が無いだけである（nightly の 55s がその例）。

あわせて 2 つ:

- **nightly の tracking Issue は、suite が判定に達したときだけ動かす。** `notify` は
  `needs.e2e.outputs.result`（= `steps.run-tests.outcome`）を読み、`failure` の
  ときだけ起票・更新する。job が setup 中に打ち切られた場合は Issue に触れず、
  run summary に notice を残す。
- **guard は不変条件そのものを固定する。** `scripts/ci/workflow-timeout-policy.test.ts`
  が `job ≧ step + OBSERVED_SETUP_MINUTES` を YAML から読んだ値で検査し、step 境界が
  消えた場合に空振りしないことと、`*e2e*.yml` が無登録で増えないことも見る。

## 理由

- **不変条件を数字で満たす**: 35 ≧ 15 + 18、30 ≧ 10 + 18。どの job でも step 境界が
  必ず先に発火するので、赤の意味が「suite がハングした」に一致する。
- **共有の許容にすると標本の薄さで判断を誤らない**: mirror は job ごとに選べない。
  per-job の観測値を使うと、たまたま速い日ばかり引いた job だけ予算が薄くなる。
- **guard が ADR の文と同じことを言う**: 5 分のマージンは「job kill と step kill が
  競合しない」ことしか担保しないが、#2805 の形は競合の手前で起きる。
- **nightly の赤が意味を保つ**: 「テストが落ちた」と書く Issue は、テストが走って
  落ちたときにだけ立つ。setup の打ち切りは run summary に残り、消えはしない。

## 却下した案

### job ごとに観測した setup を使う

一見きめ細かいが、`e2e-nightly` の観測最大は 55s で、同じ install を走らせる
`e2e.yml` の 830s と 15 倍違う。差は job の性質ではなく引いた mirror の運なので、
per-job の値は「サンプルが薄い job ほど予算が薄い」という逆の結果になる。

### ADR-2805 の本文を直して値だけ差し替える

[ADR-2687](2687-adr-body-is-immutable.md) が ADR 本文の編集を禁じている。同じ日の
訂正であっても例外にしない。値の履歴が追えることが、そもそも ADR を置く理由である。

### setup 自体に timeout を置いて予算を小さく保つ

観測済みの 1013s より短い値は正常な run を殺し、長い値は job 予算とほぼ同義になる。
ADR-2805 で却下した理由がそのまま当てはまる。

### `ci.yml#check` にも同じ形を広げる

`Check` は `timeout-minutes` を持たず、ハング時は既定の 360 分まで走る。同じ欠陥では
あるが、bound の値を決めるには unit テスト側の分布を測る必要があり、#2807 の
受け入れ条件とは別の判断になる。別 Issue に切る。

## 積み残し

- **`ci.yml#check` に境界が無い**。上記のとおり別 Issue。
- **`scripts/ci/` に 3 つ目の workflow YAML パーサが増えた**。`workflow-runner-policy`
  / `workflow-draft-gate` / `workflow-timeout-policy` が同じ `jobs:` 走査を各自で
  持っている。共通化は 3 本の guard を同時に触るので、この PR では行わない。
- **cache-miss 経路（`playwright install --with-deps`）の観測が薄い**。実測 23〜31s の
  サンプルしかなく、遅い mirror を引いた例をまだ見ていない。
