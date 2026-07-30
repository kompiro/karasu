---
id: ADR-1890
title: CI ランナーは Ubicloud を採用し、secret を握る publish / deploy ジョブは GitHub ホストに残す
status: accepted
date: 2026-07-30
topic: build
related_to:
  - ADR-953
scope:
  packages: []
  concerns:
    - ci
    - security
assumptions:
  - "grep: .github/workflows/ci.yml :: runs-on: ubicloud-standard-4-ubuntu-2404"
  - "grep: .github/workflows/e2e.yml :: runs-on: ubicloud-standard-4-ubuntu-2404"
  - "grep: .github/workflows/e2e-nightly.yml :: runs-on: ubicloud-standard-4-ubuntu-2404"
  - "grep: .github/workflows/vscode-e2e.yml :: runs-on: ubicloud-standard-4-ubuntu-2404"
  - "grep: .github/workflows/vscode-screenshots.yml :: runs-on: ubicloud-standard-4-ubuntu-2404"
  - "file: scripts/ci/workflow-runner-policy.test.ts"
  - "grep: .github/workflows/release.yml :: runs-on: ubuntu-latest"
---

# ADR-1890: CI ランナーは Ubicloud を採用し、secret を握る publish / deploy ジョブは GitHub ホストに残す

- **日付**: 2026-07-30
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1890](https://github.com/kompiro/karasu/issues/1890)（当初は「Blacksmith を導入する」。調査で方針を再定義）
  - パイロット PR [#1904](https://github.com/kompiro/karasu/pull/1904)（`ci.yml` / `e2e.yml`）
  - 昇格元 Design Doc: `docs/design/faster-ci-runner-personal-repo.md`（本 ADR で削除）
  - 関連 ADR: [ADR-953](953-ci-docs-only-paired-stub-workflow.md)（paired stub workflow）
  - コード: `.github/workflows/*.yml`, `scripts/ci/workflow-runner-policy.test.ts`

## 背景

CI の wall-clock 短縮とコスト削減を目的に、Issue #1890 は当初 [Blacksmith](https://blacksmith.sh)
の導入を提案していた。しかし調査で **Blacksmith は GitHub Organization 専用**であり、
`kompiro/karasu`（個人アカウント repo）では使えないことが判明した。GitHub の larger runners も
Team / Enterprise プラン限定で同じ理由により対象外。repo を Organization へ移すことは
URL・権限・連携への波及が大きく、意図的に検討対象外とした。

そこで「個人アカウント repo で使える高速 CI ランナーの選定」へ問題を定義し直し、
Ubicloud Managed Runners を候補として GitHub App をインストールしてパイロットした。
`ci.yml` の `Check` と `e2e.yml` の `Playwright` を `ubicloud-standard-4-ubuntu-2404` に
差し替えた PR #1904 は個人アカウント repo でそのまま動作し、「個人 repo で使えるか」という
唯一の未確認点が解消された。

計測（マージ後 1 週間、各ワークフロー直近 10 実行）:

| ジョブ | `ubuntu-latest`（baseline） | Ubicloud `standard-4` |
| --- | --- | --- |
| CI `Check` | 約 2m00s | 1m32s / 中央値 1m53s / 最大 2m23s |
| E2E `Playwright` | 約 8m30s | 5m58s / 中央値 6m44s / 最大 7m36s |

wall-clock は 20〜30% 短縮し、1 週間を通して安定していた。キュー待ちは 1 分未満。
`runs-on:` の 1 行差し替え以外の設定変更は不要だった。

## 決定

**CI ランナーは Ubicloud Managed Runners（`ubicloud-standard-4-ubuntu-2404`）を採用する。**
移行対象は「計算量が支配的な検証ジョブ」に限り、**secret を握る publish / deploy 系ジョブ、
API 呼び出しだけの軽量ジョブ、`-skip` stub は `ubuntu-latest` に残す**。

判定基準は 1 つ: **配信用の資格情報（npm OIDC / vsce PAT / Cloudflare API token /
GitHub Pages deployment）を扱うジョブか**。扱うなら GitHub ホスト、扱わないなら Ubicloud。

| ランナー | ジョブ |
| --- | --- |
| Ubicloud `standard-4` | `ci.yml#check`, `e2e.yml#e2e`, `e2e-nightly.yml#e2e`, `vscode-e2e.yml#vscode-e2e`, `vscode-e2e.yml#vscode-webview-e2e`, `vscode-screenshots.yml#capture` |
| `ubuntu-latest` | `deploy.yml`, `pages.yml`, `preview.yml`, `release.yml`, `release-prepare.yml`, `vscode-release.yml`, `azure-identity-bootstrap.yml`, `secret-scan.yml`, 軽量 check 系（`adr-validate` / `tpl-validate` / `tpl-review` / `reference-docs-check` / `at-check-coverage`）、`e2e-nightly.yml#notify`、および全 `-skip` stub |

この対応は `scripts/ci/workflow-runner-policy.test.ts` が機械的に固定する。Ubicloud 側の
ジョブ集合が表とずれる、あるいは第三のランナーラベルが混入すると `pnpm test:scripts` が落ちる。

## 理由

- **drop-in**: `runs-on:` 1 行で移行でき、ワークフロー構造・キャッシュ・action ピン方針を
  変えずに済んだ（パイロットで実証）。
- **速度**: ホットパス（CI / E2E）で 20〜30% の wall-clock 短縮が 1 週間安定して再現した。
  E2E は 8m30s → 6m 台で、PR のフィードバックループに効く。
- **コスト**: GitHub ホスト比で大幅に安い価格帯であり、個人負担という制約に合う。
  速いぶん課金分数自体も減る。
- **個人アカウント repo で使える**: Blacksmith / Depot / GitHub larger runners が org 限定で
  脱落する中、実証済みで唯一残った managed SaaS。self-hosted は個人 OSS には運用負荷が過大。
- **secret を GitHub ホストに残す理由**: publish / deploy 系は実行頻度が低く高速化の旨味が
  小さい一方、失敗すればリリースが止まる。長期資格情報と OIDC を第三者ランナー上で扱う
  攻撃面をあえて増やさない。速度が要るのは検証ジョブ、信頼性が要るのは配信ジョブ、と
  ランナーを分けるのが対価が釣り合う。
- **fork PR の安全性**: managed SaaS の ephemeral VM は self-hosted と違い、fork からの
  untrusted code が自前インフラで走るリスクを持ち込まない。

## 却下した案

- **Blacksmith（当初案）**: GitHub Organization 専用。個人アカウント repo では利用できず前提が崩れた。
- **GitHub larger runners**: Team / Enterprise（org）プラン限定で同様に対象外。
- **BuildJet**: drop-in で候補になり得たが、価格優位は Ubicloud ほど大きくない。Ubicloud が
  個人 repo で動くことが実証された時点で fallback のまま採用不要になった。
- **self-hosted 系（RunsOn / Cirun / 素の self-hosted）**: 個人アカウントでも確実に動くが、
  自前クラウドの費用・パッチ運用と、public repo の fork PR で untrusted code が自前インフラに
  乗るリスクを抱える。個人 OSS の高速化目的には割に合わない。
- **現状維持（全ジョブ `ubuntu-latest`）**: コスト・運用ゼロだが、実測で得られた 20〜30% の
  短縮を捨てることになる。
- **全 25 ジョブを Ubicloud へ統一**: 設定の一貫性は増すが、`-skip` stub は Required status を
  即時報告するだけの数秒ジョブでキュー待ちのほうが支配的になり、publish 系は上記の
  資格情報リスクを負う。一貫性より判定基準の明快さを採った。

## 積み残し

- **課金分数の実測比較**: Ubicloud dashboard の billing データと GitHub ホスト想定コストの
  突き合わせは未実施。採用判断は wall-clock 実測と公表価格差で行った。実請求が想定と乖離した
  場合は本 ADR を supersede して見直す。
- **専用キャッシュの最適化**: Ubicloud の cache backend への `actions/cache` 置き換えは
  未着手。効果が要るのは Playwright ブラウザと pnpm store で、必要になった時点で別 Issue に切る。
- **ランナーサイズ**: 全対象ジョブを `standard-4` で揃えた。ジョブ別の最適サイズ探索はしていない。
