# CI を高速化する GitHub Actions ランナーの選定 — 個人アカウント repo での制約

- **日付**: 2026-07-12
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1890](https://github.com/kompiro/karasu/issues/1890)（当初は「Blacksmith を導入する」だったが、調査により方針を再定義）
  - PR: [#1893](https://github.com/kompiro/karasu/pull/1893)
  - 関連 ADR: なし（CI ランナー / プロバイダ選定に関する既存 ADR は存在しない）
  - コード: `.github/workflows/*.yml`（全 25 ジョブが `runs-on: ubuntu-latest`）

## 背景・課題

CI（GitHub Actions）の実行時間短縮とコスト削減を目的に、当初 Issue #1890 では
[Blacksmith](https://blacksmith.sh) の導入を提案していた。Blacksmith は
`runs-on:` を 1 行差し替えるだけで GitHub ホストランナーを高速な gen4 ランナーに
置き換えられる managed SaaS で、pnpm store や Playwright ブラウザの
colocated キャッシュも備える。

しかし着手前の調査で、**Blacksmith は GitHub Organization 専用であり、
個人アカウント配下の repository では利用できない**ことが判明した。karasu の
リポジトリ `kompiro/karasu` は個人アカウント repo であり、ユーザーは
**個人アカウントのまま**高速化したいという要望を持つ。したがって当初案の
Blacksmith は前提から成立しない。

本 Design Doc は Issue #1890 を「Blacksmith 導入」から
**「個人アカウント repo で使える高速 CI ランナーの選定」**へ再定義し、
候補の比較・検証優先の導入計画・段階的ロールアウトを整理する。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| ランナー | `.github/workflows/` の全 25 ジョブが `runs-on: ubuntu-latest`（GitHub ホスト）。self-hosted / 第三者ランナーは未使用 |
| CI クリティカルパス | `ci.yml`（lint / typecheck / build / `test:coverage` / build）と `e2e.yml`（Playwright）。いずれも CPU/IO バウンド |
| キャッシュ | `e2e.yml` が `actions/cache` で Playwright ブラウザをキャッシュ。pnpm store は `setup-node` の `cache: pnpm` |
| action ピン方針 | すべての `uses:` を commit SHA でピン留め（第三者 action も同様に維持する） |

## 制約・前提

- **repo は個人アカウント所有**（`kompiro/karasu`）。Organization への移管は
  URL・権限・他ツール連携に波及する大きな判断であり、本設計では out of scope
  とする（採らない前提で候補を絞る）。
- **drop-in であること**を優先する。理想は `runs-on:` の 1 行差し替えで移行でき、
  ワークフローの構造を変えないこと。
- **コストは個人負担**。GitHub ホストランナーより安いか、少なくとも同等で
  速いことを求める。
- action の **SHA ピン方針**は第三者ランナー提供の action（`useblacksmith/*`,
  `ubicloud/*` 等）にも適用する。
- 追加のインフラ運用（自前クラウドの構築・保守）は個人 OSS の高速化目的には
  重いため、可能なら避ける。

## 検討した選択肢

### 案1: Ubicloud Managed Runners（第一候補）

managed SaaS。GitHub App（Ubicloud Managed Runners）をインストールし、
`runs-on: ubuntu-latest` を `runs-on: ubicloud-standard-2`（〜`-8` など）に
差し替えるだけで移行できる。GitHub ホストランナー比 **〜7〜10x 安い**とされ、
より大きいサイズ（`ubicloud-standard-8`）でも価格優位を保ったまま高速化できる。

**メリット**

- drop-in（`runs-on:` 1 行）。ワークフロー構造を変えない
- 圧倒的な価格優位。大きいサイズに上げても GitHub ホストより安いことが多い
- OSS（Ubicloud 自体が open source）で、bare metal（Hetzner / Leaseweb）上に構築

**デメリット**

- **個人アカウント repo で使えるかは公式ドキュメントに明記がなく未確認**
  （GitHub App 自体は個人アカウントにもインストール可能なので使える可能性は高いが、
  課金・オンボーディングが org 前提の恐れがある → 検証が必要）
- ベンチマークでは Namespace 等より単スレッド性能で劣る場合がある

### 案2: BuildJet（fallback）

同じく managed SaaS（GitHub App）。`runs-on: buildjet-4vcpu-ubuntu-2204` などに
差し替える。4 vCPU が GitHub ホストランナーと同コストで、比較の基準になる。

**メリット**

- drop-in。Hetzner の gaming CPU で単スレッド性能が高い
- 4 vCPU が GitHub ホストと同価格 → 移行の損益分岐が分かりやすい

**デメリット**

- 個人アカウント repo 可否は同じく未確認（要検証）
- 価格優位は Ubicloud ほど大きくない

### 案3: self-hosted 系（RunsOn / Cirun / 素の self-hosted）（最終手段）

自分のクラウド（RunsOn なら AWS）に runner をデプロイする方式。repo レベルの
self-hosted runner は **個人アカウントでも登録可能**なので、可用性は確実。

**メリット**

- 個人 repo で確実に動く（GitHub の self-hosted runner は個人アカウント対応）
- インフラを完全制御できる。RunsOn は非商用無料

**デメリット**

- 自前クラウドの費用・運用（セキュリティ・パッチ・スケール）が乗る
- public repo で fork PR からの self-hosted runner 実行はセキュリティリスク
  （untrusted code が自前インフラで走る）。設定を誤ると危険
- 個人 OSS の「CI を速くしたい」という目的に対して運用負荷が過大

### 案4: GitHub larger runners（不採用）

GitHub 純正の大型ランナー。**Team / Enterprise（= org）プラン限定**で、
個人アカウントでは選べない。前提から外れるため不採用。

### 案5: 現状維持（何もしない）

`ubuntu-latest` のまま。コストゼロ・運用ゼロだが高速化は得られない。
下記の検証で個人 repo 可否がすべて NG だった場合の fallback。

## 比較

| 観点 | 案1 Ubicloud | 案2 BuildJet | 案3 self-hosted | 案4 GitHub larger | 案5 現状維持 |
| --- | --- | --- | --- | --- | --- |
| 個人 repo で使えるか | 🔶 未確認（可能性高） | 🔶 未確認 | ✅ 確実 | ❌ org 限定 | ✅ |
| 移行の手間 | ◎ `runs-on` 1 行 | ◎ `runs-on` 1 行 | △ インフラ構築 | － | ◎ 変更なし |
| コスト | ◎ GH比 〜7-10x 安 | ○ 4vcpu 同等 | △ 自前クラウド費 | × org プラン費 | ○ 現状 |
| 運用負荷 | ◎ SaaS | ◎ SaaS | × 自前運用 | ◎ | ◎ |
| 速度 | ○〜◎ | ○〜◎ | 構成次第 | ◎ | 基準 |
| セキュリティ（fork PR） | ◎ 隔離 | ◎ 隔離 | △ 要注意 | ◎ | ◎ |

## 現時点の方針

**案1 Ubicloud を採用し、まず試用（trial）する。** 比較の結果、drop-in で
移行でき（`runs-on:` 1 行）、GitHub ホスト比 〜7〜10x という価格優位が個人負担の
コスト制約に最も合致するため、Ubicloud を第一候補ではなく採用案として確定する。

ただし「個人アカウント repo で使えるか」は公式ドキュメントで未確定なので、
本格移行の前に **GitHub App を実際にインストールして `kompiro/karasu` が
dashboard に現れるか**をゼロコストで確認し、そのまま `ci.yml` で試用パイロットに
入る。これが最短の可否判定であり、試用の第一歩を兼ねる。

試用結果に応じて分岐する:

1. Ubicloud が個人 repo で使え、パイロット計測も妥当 → そのまま段階移行し、
   ADR 昇格で採用を確定する。
2. Ubicloud が個人 repo で **使えない**、または計測が期待外れ → 案2 BuildJet を
   同様に試用（fallback）。
3. 両方 NG → 案3 self-hosted を検討するか、案5 現状維持に倒す
   （個人 OSS では self-hosted の運用負荷が見合わない可能性が高い）。

### 実装の指針

1. **可否検証（人間作業・ゼロコスト）**: Ubicloud の GitHub App を個人アカウントに
   インストールし、`kompiro/karasu` が対象として選べるか確認する。NG なら
   BuildJet で同じ検証。ここで採用プロバイダを確定する。
2. **パイロット**: 最も頻度の高い `ci.yml` の 1 ジョブだけ `runs-on` を差し替え
   （例: `ubicloud-standard-4`）、数 PR にわたって wall-clock と課金分を
   GitHub ホスト baseline と比較・記録する。
3. **段階ロールアウト**: パイロットが妥当なら、ホットパス（`e2e.yml`,
   `e2e-nightly.yml`, `vscode-e2e.yml`, `preview.yml`, `pages.yml`,
   `deploy.yml`, `release*.yml`）へ広げる。軽量な check / skip 系ワークフローは
   ジョブが短くランナー変更の旨味が薄いため、`ubuntu-latest` 据え置きか
   最小サイズに留めるかを都度判断する。
4. **キャッシュ最適化（任意）**: 採用プロバイダが専用キャッシュ action を提供する
   場合（例 Ubicloud の magic cache）、`e2e.yml` の `actions/cache`（Playwright
   ブラウザ）と pnpm store の置き換えを検討する。第三者 action も SHA ピンを維持。
5. **ランナーサイズ**: 軽量 check は 2 vCPU、build / test / e2e は 4+ vCPU を
   目安に、パイロット計測で調整する。
6. AT: 本件は CI インフラ設定変更であり、`docs/acceptance/` の受け入れテスト
   （app / CLI の振る舞い検証）にはなじまない。検証は「パイロットの
   before/after 計測結果」と「CI が緑であること」で代える。
7. **ADR 昇格**: プロバイダ確定・パイロット計測後、CI プロバイダ選定という
   durable な決定を `docs/adr/YYYYMMDD-NN-<name>.md` として昇格し、本 Design Doc
   は同 PR で削除する。「個人 repo では Blacksmith/Depot が org 限定で使えず、
   Ubicloud（or 確定したプロバイダ）を選んだ」という制約と根拠を残す。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（CI 内部の変更。プロダクト挙動・成果物に影響しない）。
- ドキュメント更新: なし（`docs/spec/` / `docs/concepts*.md` に該当なし）。
  採用確定時に ADR を追加。
- テスト・examples への影響: なし。
- リスク: 第三者ランナーは供給側の障害・可用性が CI 可用性に直結する。
  nightly（`e2e-nightly.yml`）が最終セーフティネットとして残る。paid SaaS の
  課金は個人負担になる点に留意。

## 決めないこと（意図的な非決定）

- **プロバイダ**は Ubicloud に確定した（上記「現時点の方針」）。ただし個人 repo での
  利用可否は GitHub App インストールで確認するまで実証されておらず、NG だった場合の
  fallback として BuildJet → self-hosted → 現状維持の順で倒す方針も併せて確定する。
- Organization への repo 移管は **意図的に検討対象外**とする（個人アカウント維持が
  ユーザーの要望のため）。将来 Blacksmith / Depot / GitHub larger runners を
  使いたくなった場合に初めて再検討する論点。
- キャッシュ最適化（専用 cache action の採用）はパイロット後の任意ステップとし、
  本設計では方針提示に留める。
- ランナーサイズの最終値はパイロット計測で決める（本設計では 2 vCPU / 4+ vCPU の
  目安のみ）。
