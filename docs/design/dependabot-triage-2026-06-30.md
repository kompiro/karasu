# Dependabot Triage (2026-06-30) — `actions/checkout` 7.0.0

- **日付**: 2026-06-30
- **ステータス**: 検討中
- **関連**:
  - PR [#1835](https://github.com/kompiro/karasu/pull/1835) — `chore(deps): bump actions/checkout from 6.0.3 to 7.0.0`
  - 関連 ADR: [ADR-20260329-01](../adr/20260329-01-dependabot.md)（Dependabot 採用）, [ADR-20260623-03](../adr/20260623-03-dependabot-batch-2026-06-23.md)（前回バッチ triage）

## 背景・課題

2026-06-30 時点で開いている Dependabot version update PR は 1 本のみ。サプライチェーン攻撃（メンテナ乗っ取り・postinstall 混入・タグ改ざん・typosquatting）のリスクを踏まえ、bump 種別を問わず upstream まで遡ってリスク分析する。

## 一覧表

| PR | 対象 | bump | 種別 | CI | リスク | 推奨 |
|----|------|------|------|----|--------|------|
| [#1835](https://github.com/kompiro/karasu/pull/1835) | `actions/checkout` 6.0.3 → 7.0.0 | major | direct（CI 専用 GitHub Action） | 全 check green（secret-gated job は skip） | **low** | **マージ推奨** |

## PR #1835 リスク分析

- **リリースノート / CHANGELOG**: v7.0.0 の変更は (1) `pull_request_target` / `workflow_run` での fork PR checkout をブロック（[#2454](https://github.com/actions/checkout/pull/2454)、セキュリティ強化）、(2) action 本体の ESM 化と依存更新（[#2463](https://github.com/actions/checkout/pull/2463)）、(3) `@actions/core` / `@actions/tool-cache` の bump と uuid 除去、(4) minor な npm 依存群の bump。major 化の主因は ESM 移行と fork PR ブロックの挙動変更。
- **本リポジトリへの破壊的影響**: **なし**。唯一の挙動変更である「`pull_request_target` / `workflow_run` での fork PR checkout ブロック」は、karasu の全ワークフローに該当トリガが存在しない（grep で `pull_request_target` / `workflow_run` は 0 件）。ESM 化は action 内部実装で利用側に影響しない。
- **pin 整合性**: 本リポジトリは全ワークフローで `actions/checkout` を**フル commit SHA pin**（`# v6.0.3` コメント付き）。PR は SHA を `df4cb1c…` → `9c091bb…`（17 ファイル・18 箇所）に更新する。upstream の tag `v7.0.0` を解決すると commit `9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0` に**完全一致**し、SHA とタグの不整合はない。
- **メンテナ・所有権の変化**: リポジトリは GitHub 公式の `actions` org。v7.0.0 リリース著者は `aiqiaoy`（当該リリースで複数 PR を担当した GitHub 側コントリビュータ）。org・配布主体の移管や改名はなし。
- **lifecycle スクリプト**: GitHub Action のため postinstall / prepare 等は利用側で実行されない。
- **依存ツリーの変化**: action のバンドル内部の依存更新のみで、karasu の依存ツリーには影響しない（GitHub Action は `node_modules` を持ち込まない）。
- **公開からの経過時間**: 2026-06-18 公開（約 12 日）。本リポジトリの cooldown（全 semver レベル 7 日）を満たす。
- **既知 advisory**: 該当なし。

リスクレベル **low**。

## 現時点の方針

**PR #1835 をマージ推奨** — 理由:

- CI 専用の GitHub Action で、ランタイム成果物（core / app / cli / lsp / vscode）には一切影響しない。
- major 化の主因（fork PR ブロック・ESM 化）はいずれも karasu に破壊的影響を与えない。該当トリガを使っていない。
- 全 required check が green。secret-gated job（Playwright / ExTester / Cloudflare）は bot PR ポリシー通り skip。
- フル SHA pin を維持し、upstream の annotated/commit tag が pin 先 SHA に完全一致。タグ改ざんによる差し替えリスクを受けない。
- 公開から 12 日経過し cooldown を満たす。

### ADR 昇格

ユーザーの採否判断後、本 Design Doc を `docs/adr/<番号>-dependabot-triage-2026-06-30.md` へ昇格し、同 PR で本ファイルを削除する。

## 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（CI 専用）。
- ドキュメント更新: なし。
- テスト・examples への影響: なし。
