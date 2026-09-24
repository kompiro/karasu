---
id: ADR-2805
title: テスト suite の timeout はテストステップに置き、job 予算は setup を吸収する側に回す
status: superseded
superseded_by: ADR-2807
date: 2026-09-12
topic: build
related_to:
  - ADR-1008
  - ADR-1729
  - ADR-1866
  - ADR-1890
  - ADR-2643
  - ADR-2753
scope:
  packages:
    - e2e
    - vscode-e2e
  concerns:
    - ci
assumptions:
  - "file: scripts/ci/workflow-timeout-policy.test.ts"
  - "grep: .github/workflows/e2e.yml :: timeout-minutes: 15"
  - "grep: .github/workflows/e2e-nightly.yml :: timeout-minutes: 15"
  - "grep: .github/workflows/vscode-e2e.yml :: timeout-minutes: 10"
---

# ADR-2805: テスト suite の timeout はテストステップに置き、job 予算は setup を吸収する側に回す

- **日付**: 2026-09-12
- **ステータス**: Superseded by [ADR-2807](2807-suite-budget-clears-its-setup.md)（step に境界を置く決定はそのまま引き継がれ、予算の値と guard の不変条件だけが差し替わった）
- **きっかけ**: [#2805](https://github.com/kompiro/karasu/issues/2805)。[#2793](https://github.com/kompiro/karasu/pull/2793) の run [34606378392](https://github.com/kompiro/karasu/actions/runs/34606378392)（attempt 1）が、1 件もテストを落とさないまま 20m34s で cancel された
- **関連**:
  - [ADR-1008](1008-flaky-e2e-fixme-and-issue.md): flake の判定基準 1 は「同一テストが retry 込みの全 attempt を fail」。setup timeout はそれに当たらない
  - [ADR-1866](1866-e2e-required-status-check.md): `Playwright` は Required status check
  - [ADR-1890](1890-ci-runner-ubicloud.md): これらの job が載っている Ubicloud ランナー
  - [TPL-2805](../test-perspectives/TPL-2805-budget-bounds-the-work-it-names.md)
  - コード: `.github/workflows/e2e.yml`, `.github/workflows/e2e-nightly.yml`, `.github/workflows/vscode-e2e.yml`, `scripts/ci/workflow-timeout-policy.test.ts`

## 背景

E2E 系の job は `timeout-minutes` を job にだけ置いていた。その 1 本の予算が
**setup とテストの両方**を覆っている一方、setup の後半は OS パッケージの
インストール、つまり任意の mirror に対する境界のない `apt-get` である。
Playwright はブラウザバイナリをキャッシュしているが、それがリンクする OS
パッケージはキャッシュしていないので、cache hit の run でも
`playwright install-deps chromium` が毎回走る。

実測（2026-09-07〜09-11 の run、Actions API のステップ所要時間）:

| job | job 予算 | setup の apt | テストステップ |
| --- | --- | --- | --- |
| `e2e.yml#e2e` | 20 分 | 10s 〜 **808s** | 422〜572s |
| `e2e-nightly.yml#e2e` | 20 分 | 10〜31s | 434〜558s |
| `vscode-e2e.yml#vscode-e2e` | 15 分 | 9s 〜 **586s** | 13〜24s |
| `vscode-e2e.yml#vscode-webview-e2e` | 25 分 | 13〜171s | 33〜50s |

#2793 の run はこの形の典型で、`Install Playwright system deps` が 808s
（13m28s）かかり、残り 6m30s の予算に 7〜9 分の suite が入らず、150 ケースまで
正常に進んでいたテストが打ち切られた。**1 件も fail していないのに Required
check が赤くなる**ので、本物の失敗と見分けがつかない。#2793 では、どのテストも
落ちていないと確かめるのにレビュー 1 往復を要した。suite が伸びるほど、遅い
mirror を吸収する余地は縮んでいく。

`vscode-e2e` 側はさらに極端で、テストが数十秒なのに job 予算の大半が setup の
ために存在している。observed 586s は 15 分予算の 2/3 にあたる。

## 決定

**テスト suite を走らせる job では、「suite がハングした」を意味する境界を
テストステップの `timeout-minutes` に置き、job の `timeout-minutes` はその上に
setup 分の余地を足しただけの上位予算とする。**

| job | テストステップ | step 予算 | job 予算 |
| --- | --- | --- | --- |
| `e2e.yml#e2e` | `Run E2E tests` | 15 分 | 30 分 |
| `e2e-nightly.yml#e2e` | `Run E2E tests` | 15 分 | 30 分 |
| `vscode-e2e.yml#vscode-e2e` | `Run extension host smoke tests` | 10 分 | 20 分 |
| `vscode-e2e.yml#vscode-webview-e2e` | `Run WebView E2E (ExTester)` | 15 分 | 25 分 |

step 予算が実質の境界で、suite が伸びたときに見直すのはこの値。job 予算は
「step 予算 + setup」を満たしていればよく、**両者の差は最低 5 分**とする。
差が無いと job 側の kill が step 側の kill と競合し、setup の遅さが再び
「cancel された job」として報告される。

`scripts/ci/workflow-timeout-policy.test.ts` がこの表と差の下限を固定し、
これらの workflow に新しい job が無登録で入ることも落とす（`pnpm test:scripts`）。

## 理由

- **赤の意味が一致する**: テストステップの timeout が発火したときだけ「suite が
  ハングした」になる。setup の遅さは job 予算に吸収され、遅延にはなっても
  failure にはならない。ADR-1008 の flake 判定を setup timeout と取り違える
  余地が消える。
- **実測に裏打ちされた値**: step 15 分は観測最大 572s の約 1.6 倍。job 30 分は
  観測最大の install 808s に step 15 分と残りの setup を足しても収まる。
- **本物のハングの代価を増やしていない**: job 予算だけを上げると、ハングした
  suite が予算いっぱいまで課金される。step 境界を入れたので、ハング時に消える
  時間はむしろ短くなる（e2e なら 20 分 → 15 分 + setup 実測）。
- **他の性質を変えない**: ランナー（ADR-1890）・キャッシュ・draft gate
  （ADR-2643）・path filter（ADR-1729）に触れない 31 行の差分で済む。
- **4 job に一様に効く**: 境界の欠如は Playwright 固有ではなく、setup を伴う
  job 共通の形である。Electron/ExTester 側にも同じ処方が要る。

## 却下した案

### job の `timeout-minutes` を上げるだけ

最小の差分だが、遅い mirror を吸収するために**本物のハングの代価を増やす**形に
なる。境界は「setup + テスト」を測ったままなので、赤の意味も曖昧なまま残る。
#2805 が名指しで避けるべきとした案。

### Playwright のコンテナイメージ（`mcr.microsoft.com/playwright:v<version>-jammy`）で走らせる

OS パッケージがイメージに同梱されるので、境界を付ける代わりに**ステップ自体が
消える**のは魅力がある。却下の理由は 2 つ。イメージのタグを
`@playwright/test` の版と連動させる必要があり、Dependabot の追随対象が 1 つ
増える（現状は pin していない — [ADR-2753](2753-dependabot-triage-2026-09-07.md)）。
そして `vscode-e2e` の Electron / ExTester 側には効かないので、同じ欠陥が
2 job 残る。**setup 時間そのものの短縮は、境界を直すこととは別の関心事**であり、
必要になった時点で別 Issue に切る。

### apt パッケージをキャッシュする

install を速くしても、**境界が無いという性質は直らない**。cache miss の run では
同じ形の失敗が起きる。加えて hosted runner 上の apt キャッシュは壊れやすく、
理由を考えるべきキャッシュが 2 つに増える。

### setup ステップ自体に `timeout-minutes` を付ける

観測済みの 13m28s より短い値を置けば、正常に終わる run を殺す。長い値を置けば
job 予算とほぼ同義になる。いずれにせよ「遅い install は遅延であって失敗では
ない」という #2805 の受け入れ条件に反する。setup の上限は job 予算が持つ。

## 積み残し

- **setup 時間そのものの短縮**は本 ADR の対象外。境界を付け替えただけで、
  808s の install は 808s のままである。
- **差の下限 5 分**は観測値ではなく設計値。job 予算と step 予算がほぼ同じに
  なる劣化を落とすための floor であって、setup の実測分布から導いたものではない。
