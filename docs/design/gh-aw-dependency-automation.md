# gh-aw で Dependabot トリアージと security alert sweep を自動化する

- **日付**: 2026-08-31
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2658](https://github.com/kompiro/karasu/issues/2658)
  - 関連 ADR: [ADR-903](../adr/903-skip-secret-gated-jobs-on-bot-prs.md)（secret 必須ジョブは bot PR で skip）、[ADR-128](../adr/128-dependabot.md)（Dependabot 採用）、[ADR-784](../adr/784-update-dependencies-20260421.md)（cooldown 7 日）、[ADR-1890](../adr/1890-ci-runner-ubicloud.md)（ランナーポリシー）、[ADR-2419](../adr/2419-poc-report-directory.md)（レポートは gitignore された `reports/`）
  - 関連 TPL: [TPL-2658](../test-perspectives/TPL-2658-agent-write-scope-is-declared-not-prompted.md)（同 PR で起こした proactive TPL）、[TPL-2643](../test-perspectives/TPL-2643-skip-reports-success-without-running.md)
  - コード: `.github/workflows/dependabot-triage.md`、`.github/workflows/security-alert-sweep.md`、`scripts/ci/agentic-workflow-safety.test.ts`
  - 運用ルール: `.claude/rules/dependabot.md`、`docs/release.md`

## 背景・課題

依存更新と security alert のトリアージ手順は `hane:dependabot` / `hane:security-alert` skill に既に書かれている。ただしどちらも対話起動で、月曜バッチや新規 advisory に人が気づいてセッションを始めないと何も進まない。

手順のうち機械的な部分（PR と alert の収集、direct / transitive の判別、各 bump の upstream 追跡）は仕様が確定していて、夜間に無人で回せる。人が持つべきなのはマージ判断と ADR 記録だけである。

[gh-aw](https://github.com/github/gh-aw)（GitHub Agentic Workflows）は、frontmatter と自然言語本文からなる Markdown を `.lock.yml` にコンパイルし、宣言した権限・egress firewall・検証済みの safe outputs のもとでコーディングエージェントを走らせる。この仕組みで上記の下ごしらえを自動化できるかを検討した。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 依存更新 PR の起票 | Dependabot が weekly / Monday、cooldown は全 semver レベル 7 日、PR 上限 8、`react` と `lsp` の 2 group |
| security update の起票 | GHSA 検知で即時。`schedule` も `cooldown` も参照しない |
| security alert の扱い | `hane:security-alert` skill が `gh api .../dependabot/alerts` を手動で叩く |
| bot PR の CI | secret 必須ジョブは `github.event.pull_request.user.type != 'Bot'` で skip（ADR-903） |
| 失敗モードの知識 | `.claude/rules/dependabot.md` に集約（`ERR_PNPM_OUTDATED_LOCKFILE` と `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` の判別、override floor が advisory の脆弱範囲に入る事例） |
| トリアージ結果の置き場 | ADR（判断ログが要るバッチのみ）。分析レポートは gitignore された `reports/`（ADR-2419） |

## 制約・前提

- **`dependabot_alert` は Actions のトリガーに無い。** webhook イベントとしては存在するが、workflow を起動できるイベント一覧には含まれない。alert を起点にした自動起動は原理的に書けない。
- **`GITHUB_TOKEN` で Dependabot alerts を読めるかが不確定。** 従来は `403 Resource not accessible by integration` が返り、`security-events: read` は code scanning しか覆わなかった。一方で workflow の `permissions:` には `vulnerability-alerts: read` が存在し、gh-aw もこれを要求する。実際に読めるかは実行して確かめるしかない。
- **Dependabot 作者のイベントには secret が渡らず、トークンも read-only。** ADR-903 で `pull_request_target` に倒さない方針が決まっているため、エージェントを PR イベントで起動する経路は使えない。
- **トリアージ結果を main にコミットできない。** 分析レポートは `reports/`（gitignore）に置く規約なので、CI から Design Doc を残す経路が無い。
- **生成物が既存のポリシーガードに載る。** `.lock.yml` は `.github/workflows/*.yml` を走査する `workflow-runner-policy` / `node-version-policy` / `workflow-draft-gate` の対象に入る。
- **out of scope**: 自動マージ、`.github/dependabot.yml` の変更、`hane:*` skill の置き換え。

## 検討した選択肢

### 案1: schedule で掃く

W1 を週次（月曜バッチの翌朝）、W2 を日次で回す。どちらも `main` 文脈で走るため secret もトークンも通常どおり渡り、bot ブランチを checkout しない。

**メリット**

- ADR-903 と衝突しない。bot PR の diff に secret を近づけない
- 追加のインフラが要らない
- バッチ単位で読めるので、PR 単位より人間の読み込みコストが低い

**デメリット**

- alert の発生から最大 1 日遅れる
- open PR が 0 件の週も起動する（noop で終わるが credit は少量消費する）

### 案2: webhook を nest で受けて `repository_dispatch` に変換する

`packages/nest`（Cloudflare Workers）に webhook 受けを足し、`dependabot_alert` を `repository_dispatch` として repo に投げ返す。

**メリット**

- alert 発生から数分で反応できる

**デメリット**

- 公開エンドポイントと署名検証、それを運用する責務が増える
- cooldown 7 日の運用で「1 日以内」と「数分以内」の差が意思決定を変えない
- nest の責務（ギャラリー）と無関係な機能が同居する

### 案3: `pull_request` で Dependabot PR ごとに起動する

**却下。** 起動 actor が `dependabot[bot]` になるため secret が渡らず、エンジンの資格情報を取得できない。回避策の `pull_request_target` は ADR-903 が明示的に採らないと決めた道であり、bot ブランチの diff に secret を近づける。

### 案4: 人間がラベルを貼ったときだけ 1 本解析する

`label_command:` を使う。run の actor はラベルを貼った人間なので secret も通常トークンも渡る。

**メリット**

- 必要なときだけ起動するのでコストが読める

**デメリット**

- 「人が気づいて起動する」という現状の課題がそのまま残る

## 比較

| 観点 | 案1 schedule | 案2 webhook 橋渡し | 案4 ラベル起動 |
| --- | --- | --- | --- |
| ADR-903 との整合 | 整合 | 整合 | 整合 |
| 追加インフラ | 無し | Workers のエンドポイント | 無し |
| 反応の速さ | 最大 1 日 | 数分 | 人が気づいたとき |
| 現状の課題（人の起動待ち）の解消 | する | する | しない |

## 現時点の方針

**案1 を採用する。** cooldown が 7 日ある以上、反応の速さは意思決定を変えない。案2 が持ち込む公開エンドポイントの運用コストに見合う効果が無い。案4 は補助として後から足せる（`label_command:` は 1 ファイル追加で済む）ため、最初の形には入れない。

W1（`dependabot-triage`）は週次 + `workflow_dispatch`、W2（`security-alert-sweep`）は `workflow_dispatch` のみで入れ、cron はコメントアウトしておく。W2 のトークンが alert を読めるかは実行するまで確定しないので、最初の dispatch 実行がその検証を兼ねる。403 が返るなら `Dependabot alerts: read` を持つ GitHub App のトークンを `DEPENDABOT_ALERTS_TOKEN` として渡す形に切り替える（切り替え手順は workflow 内のコメントに書いてある）。

engine は既定の `copilot` を使う。新しい repo secret が要らず、`ANTHROPIC_API_KEY` を CI に置く判断を先送りできる。唯一 write を要求するのが `copilot-requests` で、これは推論要求を account の Copilot サブスクリプションに請求する権限であり、リポジトリに対しては何も与えない（これが無いと engine が起動できず、代わりに PAT を secret で持つことになる）。engine の変更は frontmatter 1 行なので、コストや出力品質を見てから差し替えられる。

### 人間に残すもの

- **マージ判断**。safe outputs に `merge-pull-request` を含めない。判定語彙（採用 / 保留 / 却下）は `.claude/rules/dependabot.md` が人間のものと定めている
- **ADR 記録**。判断の記録なので判断した人が書く
- **出力の置き場**。CI からは Design Doc を残せないので、所見は PR コメントとトラッキング Issue に置く

この境界は prompt の文言ではなく宣言（safe outputs と permissions）で守る必要がある。prompt が「変更しません」と言い続けたまま宣言だけ広がった状態はレビューで安全に読めてしまうため、機械検査を同 PR で用意した（TPL-2658、`scripts/ci/agentic-workflow-safety.test.ts`）。

### 実装の指針

1. `.github/workflows/dependabot-triage.md` と `.github/workflows/security-alert-sweep.md` を書き、`gh aw compile` で `.lock.yml` を生成して両方コミットする。`gh aw compile` は `.gitattributes`（lock を generated 扱い）と `.github/aw/actions-lock.json`（action の SHA pin）も生成する
2. prompt 本文には `.claude/rules/dependabot.md` の失敗モードを埋め込む。`ERR_PNPM_*` の判別、override floor と advisory の脆弱範囲の突き合わせ、peer pin の同時移動
3. `scripts/ci/agentic-workflow-safety.test.ts` を足す。safe outputs の allowlist、permission が read のみ、宣言が lock にコンパイル済みであることを検査する
4. `scripts/ci/workflow-runner-policy.test.ts` に `ubuntu-slim` を足す。gh-aw の足回りジョブが使うラベルで、API しか叩かないため ADR-1890 では `ubuntu-latest` と同じ側にある。生成ファイルに限って許可し、手書き workflow が第 3 のラベルへ流れるのは引き続き止める
5. AT: `docs/acceptance/2658-gh-aw-dependency-automation.md`。自動項目は上記ガード、手動項目は 2 本の dispatch 実行（W1 が所見を書きマージしないこと、W2 がトークンで alert を読めること）
6. ADR 昇格: 最初の dispatch 実行でコストと出力品質を確認したのち昇格し、本 Design Doc は同 PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（CI 内部の変更で、公開パッケージに触れない）
- ドキュメント更新: `docs/release.md`「Dependabot 運用ルール」から本自動化へのポインタを置く
- テスト・examples への影響: `scripts/` のガード 2 本のみ。`pnpm run test:scripts` で閉じる

## 未解決の問い / 決めないこと

- `GITHUB_TOKEN` + `vulnerability-alerts: read` で Dependabot alerts を読めるか。最初の dispatch 実行で確定する
- 1 回あたりの credit 消費。W1 の upstream 追跡は fetch が多く、`max-ai-credits` の上限値は実測してから決める
- engine を `claude` に替えるか。出力品質とコストを比較してから判断する
- 案4（ラベル起動の on-demand）を足すか。W1 の運用が定着してから決める
