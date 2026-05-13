---
id: ADR-20260513-04
title: portable な開発スキルは `kompiro/hane` plugin に切り出し、karasu からは plugin 経由で読み込む
status: accepted
date: 2026-05-13
topic: build
related_to:
  - ADR-20260513-01
  - ADR-20260413-01
scope:
  concerns:
    - ci
    - dependencies
assumptions:
  - "grep: .claude/settings.json :: hane"
  - "grep: CLAUDE.md :: kompiro/hane"
---

# ADR-20260513-04: portable な開発スキルは `kompiro/hane` plugin に切り出し、karasu からは plugin 経由で読み込む

- **日付**: 2026-05-13
- **ステータス**: 決定済み
- **関連**:
  - 親 Issue: [#1075](https://github.com/kompiro/karasu/issues/1075)（skills plugin 切り出しトラッキング）
  - 設計 PR: [#1092](https://github.com/kompiro/karasu/pull/1092)（旧 `docs/design/skills-plugin-portability-audit.md` — 本 ADR に集約して削除）
  - 子タスク: [#1084](https://github.com/kompiro/karasu/issues/1084)（本監査）, [#1086](https://github.com/kompiro/karasu/issues/1086)（decouple step）
  - 実装 PR: [#1118](https://github.com/kompiro/karasu/pull/1118)（decouple）, [#1126](https://github.com/kompiro/karasu/pull/1126)（Phase 1: karasu を `kompiro/hane` consumer に切替）, [#1130](https://github.com/kompiro/karasu/pull/1130)（Phase 2: portable skill を本 repo から除去）
  - 先行事例: [ADR-20260513-01](20260513-01-tpl-tools-extraction.md)（`@kompiro/tpl-tools` 外出し）
  - コード: `.claude/settings.json`（plugin 宣言）, `CLAUDE.md`（plugin 参照）

## 背景

`.claude/skills/` に蓄積した開発スキル群は、karasu に固有のもの（`svg-icon` / `update-examples`）と、`commit` / `ship` / `start-dev` / `design-doc` / `acceptance-test` / `qa` / `review-docs` / `sync-docs` のように他プロジェクトでも素直に使える汎用ワークフローが混在していた。後者を karasu repo に同居させ続けると、skill の改修と karasu の release cycle が結合し、別プロジェクトでの再利用も難しい。

そこで本監査では portable 候補 8 skill のプロジェクト固有な前提（パス・ブランチ慣習・monorepo レイアウト・自然言語・karasu 固有ドキュメント・ツール・`CLAUDE.md` 規約・docs 構造の存在）を洗い出し、plugin として外出しできる範囲と一般化の方針を確定した。

監査の結論を要約すると:

| 難易度 | skill |
|---|---|
| 🟢 低（ほぼそのまま） | `commit`, `qa`, `review-docs`, `design-doc` |
| 🟡 中（パス・ラベル系の optional 化） | `acceptance-test`, `start-dev`, `ship` |
| 🔴 高（karasu 語彙からの脱却） | `sync-docs` |

karasu 固有として plugin に含めないものは `svg-icon` / `update-examples` の 2 skill。

## 決定

portable な 8 skill を **`kompiro/hane` plugin** として独立リポジトリに切り出し、karasu からは Claude Code の plugin 機構で読み込む。karasu 本体には karasu 固有の `svg-icon` / `update-examples` のみを残す。

設計の柱:

- **Worktree path の統一**: `.claude/worktrees/<branch-name>` を全 skill で前提化する（前提検証は ADR-20260513-05 で扱う）
- **ラベル運用の optional 化**: `status: ready/blocked/implementing/...` のような karasu 固有のラベルセットは `CLAUDE.md` で宣言された range のみ操作する。未宣言なら no-op
- **言語ポリシーの設定化**: commit subject / PR description / Issue 本文の言語は `CLAUDE.md` 経由で宣言
- **package manager の自動検出**: lock file または `packageManager` フィールドから判定し、見つからなければ install ステップを skip
- **docs 構造の存在チェック**: `docs/design/` `docs/adr/` `docs/acceptance/` `docs/qa/` `docs/review/` を実行時にチェックし、無いものは skip
- **PR template fallback**: `.github/PULL_REQUEST_TEMPLATE.md` 不在時の汎用 body を plugin が持つ
- **ADR 昇格ワークフロー**: plugin に含めるが optional。`docs/adr/` と `YYYYMMDD-NN-<slug>.md` 命名・auto-merge 許可の有無で実行可否を決める。validator / lefthook / schema 等は `@kompiro/adr-tools` の管轄
- **karasu 固有要素の除去**: Cloudflare Pages preview URL (`*.karasu.pages.dev`)、`pnpm at:check-coverage`、`/workspaces/karasu` の絶対パス、ADR-20260413-01 や `.claude/rules/adr.md` への直接参照、`#916/#918/...` 等の karasu Issue 番号は plugin 本体から削除する

## 理由

- **責務分離**: portable skill は karasu の product code ではない汎用ワークフロー。`@kompiro/tpl-tools`（ADR-20260513-01）と同じ立て付けで独立 release cycle にすると、両者の改修が干渉しなくなる
- **再利用性**: 他プロジェクトが `commit` / `ship` / `start-dev` だけを採用して、ラベルや ADR は採用しない、といった部分採用ができる。各 skill が `CLAUDE.md` と repo の実態を検査して動作を切り替える設計にすることで、karasu 同等の体験を強制せずに済む
- **karasu 側の単純化**: karasu repo は `.claude/skills/svg-icon/` と `.claude/skills/update-examples/` だけを保有し、共通スキルは plugin インストールで自動的に更新を受け取れる。PR レビューで毎回汎用 skill の差分を見る必要がなくなる
- **既存 ADR との整合**: ラベル運用は ADR-20260413-01（preview workflow 無ラベルゲート）と整合し、ADR 昇格 auto-merge は `.claude/rules/adr.md` の運用に乗る。これらはどちらも karasu 側に残るため、plugin 側を optional 化することで karasu の運用は変えずに plugin だけ portable にできる
- **`sync-docs` のハードル**: `sync-docs` は karasu 固有の語彙（.krs 構文・スタイル）に踏み込むため、汎用化は `CLAUDE.md` のドキュメント表をパースして対象を決める形に拡張する。難易度は高いが、CLAUDE.md ベースの宣言的設計に統一する原則は他 skill とも揃う

## 却下した案

- **portable skill を karasu 内に残し続ける**: 改修が karasu の release cycle に縛られ、他プロジェクトでの再利用も困難。長期的にコストが嵩む。却下
- **`commit` / `ship` だけを切り出し、`sync-docs` などは karasu 固有のまま据え置く**: portable な範囲を中途半端にすると、karasu repo に汎用と固有が混在し続け、利用者側で線引きが分かりにくい。一括で plugin 化し、固有要素を明示的に除去する方が境界が明確。却下
- **共有レイヤを独自パッケージ（例: `@kompiro/claude-skill-utils`）として publish し、各 skill は karasu 内に残す**: パッケージ依存だけ追加されて運用上のメリットが薄い。skill 本体ごと plugin 化するほうが「使う／使わない」を repo 側で切り替えやすい。却下

## 影響範囲

- **karasu 側設定**: `.claude/settings.json` に `kompiro/hane` plugin を宣言。`CLAUDE.md` の開発ワークフロー節は plugin への参照に置き換え済み
- **CI / lefthook**: portable skill が呼ぶ汎用コマンド（`pnpm lint`, `pnpm test`, `gh pr ...`）は karasu 側で従来通り。skill 本体は plugin 配信に切り替わるだけ
- **karasu 固有 skill**: `svg-icon` / `update-examples` は `.claude/skills/` に留め、plugin 外で管理する
- **plugin 採用者**: `CLAUDE.md` で宣言されないラベル・docs 構造は no-op になるため、最小構成（git + GitHub repo）から段階的に採用できる
