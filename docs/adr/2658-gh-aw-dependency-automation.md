---
id: ADR-2658
title: 依存更新トリアージの下ごしらえを gh-aw の scheduled workflow に任せる
status: accepted
date: 2026-09-10
topic: build
related_to:
  - ADR-128
  - ADR-784
  - ADR-903
  - ADR-1890
  - ADR-2419
  - ADR-2693
  - ADR-2753
scope:
  concerns: [ci, dependencies, security]
assumptions:
  - "file: .github/workflows/dependabot-triage.md"
  - "file: .github/workflows/security-alert-sweep.md"
  - "file: scripts/ci/agentic-workflow-safety.test.ts"
  - "grep: .github/workflows/security-alert-sweep.md :: #\\s+- cron:"
---

# ADR-2658: 依存更新トリアージの下ごしらえを gh-aw の scheduled workflow に任せる

- **日付**: 2026-09-10
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2658](https://github.com/kompiro/karasu/issues/2658)（引き金）、実装 PR [#2661](https://github.com/kompiro/karasu/pull/2661)
  - 実行後に残った Issue: [#2690](https://github.com/kompiro/karasu/issues/2690)（W2 が alert を読めない）、
    [#2786](https://github.com/kompiro/karasu/issues/2786)（threat detection の `parse_error`）、
    [#2762](https://github.com/kompiro/karasu/issues/2762)（lock の再生成）
  - [ADR-128](128-dependabot.md)（Dependabot 採用）、[ADR-784](784-update-dependencies-20260421.md)（cooldown 7 日）、
    [ADR-903](903-skip-secret-gated-jobs-on-bot-prs.md)（secret 必須ジョブは bot 作者の PR で skip）、
    [ADR-1890](1890-ci-runner-ubicloud.md)（ランナーポリシー）、
    [ADR-2419](2419-poc-report-directory.md)（レポートは gitignore された `reports/`）
  - 実行の記録: [ADR-2693](2693-dependabot-security-2026-09-03.md)（sweep を手で回した回）、
    [ADR-2753](2753-dependabot-triage-2026-09-07.md)（W1 と同日のバッチ）
  - TPL: [TPL-2658](../test-perspectives/TPL-2658-agent-write-scope-is-declared-not-prompted.md)（書き込み範囲は宣言で検証する）
  - AT: [`docs/acceptance/2658-gh-aw-dependency-automation.md`](../acceptance/2658-gh-aw-dependency-automation.md)
  - コード: `.github/workflows/dependabot-triage.md`、`.github/workflows/security-alert-sweep.md`、
    `scripts/ci/agentic-workflow-safety.test.ts`、`.claude/rules/dependabot.md`

## 背景

依存更新と security alert のトリアージ手順は `hane:dependabot` / `hane:security-alert` skill が持っている。
どちらも対話起動なので、人が月曜バッチや新しい advisory に気づいてセッションを始めるまで何も動かない。
手順のうち機械的な部分、すなわち PR と alert の収集、direct と transitive の判別、各 bump の upstream 追跡は
仕様が固まっていて無人で回せる。人が持つ必要があるのはマージ判断と ADR 記録だけである。

[gh-aw](https://github.com/github/gh-aw) は frontmatter と自然言語の本文からなる Markdown を `.lock.yml` に
コンパイルし、宣言した権限・egress firewall・検証済みの safe outputs のもとでエージェントを走らせる。
2026-08-31 の設計で 4 案を比較して schedule 案を採り、#2661 で 2 本を入れた。
その後 W2 を 2026-09-03 に、W1 を 2026-09-07 に実行したところ結果が分かれたため、実測を踏まえて昇格する。

## 決定

**Dependabot PR の週次トリアージ (W1) は gh-aw の scheduled workflow に任せ、security alert sweep (W2) は
public リポジトリでは alert を読めないため cron を伏せたまま保留する。判定は両者とも人が行う。**

## 理由

- **W1 は実運用で成立した。** 2026-09-07 22:06 UTC の cron 実行が PR コメント 8 件と `[dep-triage]` Issue
  [#2771](https://github.com/kompiro/karasu/issues/2771) を作り、`@radix-ui/react-tabs` の publishing account 変更、
  jsdom v30 が上げる Node の下限、`@testing-library/react` 16.3.3 の `act()` 挙動変更を拾った。
  人が一次調査からやり直す必要のない水準である。
- **コストは制約にならなかった。** 同じ実行の消費は 46 AIC（`GH_AW_AGENT_AIC: 45.977`）。
  設計時に置くかどうか決めなかった `max-ai-credits` は、この実測なら当面置かずに済む。
- **境界を守っているのは prompt ではなく宣言である。** マージしない根拠は safe outputs に
  `merge-pull-request` が無いことであり、`scripts/ci/agentic-workflow-safety.test.ts` がそれを機械で検査する
  （TPL-2658）。実行結果も宣言どおりで、対象 PR は 1 件も merge も close もされていない。
- **W2 を止めているのはトークンではない。** 実行時に返ったのは `403` ではなく gh-aw の MCP gateway による除去で、
  `list_dependabot_alerts` が secrecy policy で空になった。gateway は情報流のラベルを持ち、Dependabot alert は
  public リポジトリでも `private:owner/repo` として扱われる。本リポジトリの safe output は public な Issue なので、
  private から public への流れが既定で遮断される。設計時に用意した「`403` なら `Dependabot alerts: read` を持つ
  GitHub App のトークンに切り替える」という手は、原因が違うため効かない。
- **遮断の解除は権限設定ではなく公開判断になる。** 解除手段の `tools.github.private-to-public-flows` は
  「未修正の脆弱性一覧を public Issue に書くことを許す」という宣言であり、cooldown 7 日の運用で得られる速さに
  見合わない。ADR-2693 のとおり、sweep を手で回しても同じ結論には到達できている。

## 却下した案

設計時に比較したもの:

- **webhook を `packages/nest` で受けて `repository_dispatch` に変換する**: 公開エンドポイントと署名検証の運用が
  増える。cooldown が 7 日ある以上、反応が「1 日以内」か「数分以内」かは判断を変えない。
- **`pull_request` イベントで PR ごとに起動する**: 起動 actor が `dependabot[bot]` になり secret が渡らない。
  回避策の `pull_request_target` は ADR-903 が採らないと決めた道である。
- **人がラベルを貼ったときだけ起動する**: 「人が気づいて起動する」という元の課題がそのまま残る。
  W1 の運用が定着したあとで補助として足せる。

実行後に加わったもの:

- **W2 のために `Dependabot alerts: read` を持つ GitHub App を用意する**: 遮断しているのが gateway の情報流制御で
  ある以上、資格情報を強くしても結果は変わらない。
- **`private-to-public-flows: allow` を宣言して W2 を通す**: 上記のとおり公開判断であり、本 ADR では採らない。
  #2690 で扱う。

## 運用上わかったこと

- **cron の時刻が人の運用と重なっている。** `0 22 * * 1`（火曜 07:00 JST）に対し、2026-09-07 は Dependabot が
  13:56 UTC と 21:47 UTC の 2 波を出し、人は第 1 波を当日中に手で処理し、cron は第 2 波だけを見た。
  受け渡しではなく並走になっている。数回のバッチを観測してから調整する。
- **threat detection が全実行で `parse_error` を返している。** 既定の `continue-on-error: true` により safe outputs は
  そのまま流れ、ジョブは success で終わる。安全網だけが黙って止まっている状態で、#2786 で追う。
- **生成物の版ずれは bot PR ではなく再生成で直す。** `.lock.yml` は `gh aw compile` の生成物であり、Dependabot は
  `uses:` 行だけを書き換えて manifest と `.github/aw/actions-lock.json` を据え置く（ADR-2753、再生成は #2762）。
  この運用は `.claude/rules/dependabot.md` に置いた。
- **safe output の temporary id が解決されないことがある。** #2771 の所見リンクが `#aw_...` のまま残った。
  #2762 の再生成後に再確認する。
