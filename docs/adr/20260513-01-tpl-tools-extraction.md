---
id: ADR-20260513-01
title: TPL ツールを `@kompiro/tpl-tools` として外出しし、karasu からは外部 package 経由で参照する
status: accepted
date: 2026-05-13
topic: adr-tooling
related_to:
  - ADR-20260509-04
  - ADR-20260512-03
  - ADR-20260502-02
scope:
  concerns:
    - ci
    - dependencies
assumptions:
  - "file: docs/test-perspectives/README.md"
  - "grep: package.json :: \"@kompiro/tpl-tools\""
  - "grep: package.json :: tpl validate --config adr.config.json --packages-root packages"
  - "grep: .github/workflows/tpl-validate.yml :: pnpm run tpl:validate"
  - "grep: lefthook.yml :: tpl-validate"
---

# ADR-20260513-01: TPL ツールを `@kompiro/tpl-tools` として外出しし、karasu からは外部 package 経由で参照する

- **日付**: 2026-05-13
- **ステータス**: 決定済み
- **関連**:
  - 親 Issue: [#1357](https://github.com/kompiro/karasu/issues/1357)（tpl-tools 切り出しトラッキング）
  - 設計 PR: [#1358](https://github.com/kompiro/karasu/pull/1358)（旧 `docs/design/tpl-tools-extraction.md` — 本 ADR に集約して削除）
  - 子 Issue / PR: [#1360](https://github.com/kompiro/karasu/issues/1360)（Phase 1: 新リポジトリ作成・publish）, [#1361](https://github.com/kompiro/karasu/issues/1361)（Phase 2: karasu を consumer に切り替え）, 実装 PR [#1366](https://github.com/kompiro/karasu/pull/1366), [#1362](https://github.com/kompiro/karasu/issues/1362)（本 ADR の Phase 3）
  - 先行事例: [#1074](https://github.com/kompiro/karasu/issues/1074)（`@kompiro/adr-tools` の切り出し）
  - 関連 ADR: [ADR-20260509-04](20260509-04-test-perspective-library.md)（TPL 運用の決定）, [ADR-20260512-03](20260512-03-reference-data-single-source.md)（reference-data の single-source 設計）, [ADR-20260502-02](20260502-02-adr-config-externalization.md)（`topics` 語彙の `adr.config.json` 外出し）

## 背景

`scripts/tpl/` には Test Perspective Library（TPL — ADR-20260509-04）を扱うツール群が約 1,100 LOC 置かれていた:

| ファイル | 役割 |
|---|---|
| `validate.ts` / `cli.ts` | TPL frontmatter とファイル名規約・README インデックスの検証 |
| `related.ts` / `related-cli.ts` | `topic` / `scope.packages` でフィルタした関連 TPL 一覧の算出・整形 |
| `review-body.ts` | 週次 deprecation review Issue の本文生成 |
| `*.test.ts` | 上記の vitest |

これは karasu のプロダクトコードではなく「Markdown + frontmatter のドキュメント群を扱う汎用ツール」であり、`@kompiro/adr-tools`（#1074）と同様に独立した tooling トピックである。karasu repo に同居させ続けると、ツール側の改修と karasu の release cycle が必要以上に結合する。また `loadConfig` を `@kompiro/adr-tools` から import していたことで、本来 ADR と無関係に使える TPL ツールに ADR ツールへの暗黙依存が入り込んでいた。

## 決定

TPL ツール群を **`kompiro/tpl-tools` リポジトリ → `@kompiro/tpl-tools` パッケージ**として外出しし、karasu からは GitHub Packages 経由で install する外部 devDependency として参照する。

実装:

- **独立パッケージ** — `@kompiro/adr-tools` には同梱せず、別パッケージにする
- **adr-tools への依存を持たない** — `loadConfig` 相当は自前実装。共有していたのは数十行の helper だけで、publish 済みパッケージ同士を結合させるほどの正当性はない
- **`adr.config.json` をハードコードしない** — tpl-tools の CLI は reference-data 設定ファイルのパスを呼び出し側から受け取る（`tpl validate --config <path>`、既定なし＝指定がなければ `topics` 検証はスキップ）。karasu の wiring（`package.json` の `tpl:*` script / lefthook / CI）が `--config adr.config.json` を渡すことで [ADR-20260512-03](20260512-03-reference-data-single-source.md) の single-source 原則を karasu スコープで維持する
- **scope.packages 検証も opt-in** — `--packages-root <path>` 指定時のみ検証する（モノレポでない repo でも使えるように）

karasu 側の構成:

- `package.json`: devDependencies に `@kompiro/tpl-tools`、`tpl:*` script は `tpl <sub> --config adr.config.json [--packages-root packages]` を呼ぶ
- `lefthook.yml` の `tpl-validate` hook と `.github/workflows/tpl-validate.yml` は新 CLI を呼び出す（`scripts/tpl/**` の path filter / glob は除去）
- `js-yaml` / `@types/js-yaml` は `scripts/tpl/` が唯一の利用者だったため除去

## 理由

- **責務分離**: TPL ツールは「Markdown+frontmatter ドキュメント群を扱う汎用ツール」であり karasu の product code ではない。独立 repo に切り出すことで両者の release cycle を切り離せる。`adr-tools` と同じ取り扱い方針（ADR-20260502-02 系の延長）で一貫する
- **adr-tools と同梱しない理由**: TPL は ADR と語彙もライフサイクルも異なる（concept → proactive TPL → development → bug → retrospective TPL、`topic` / `scope.packages` / `status: active|deprecated`）。同梱すると adr-tools のスコープが「ADR ツール」から「kompiro の開発方法論ツール一式」に膨らみ、adr-tools のリリースが TPL 都合で動く。adr-tools は他プロジェクトで「ADR だけ」採用しうる汎用性も維持したい
- **`loadConfig` も自前にする理由**: 共有しているのは数十行の helper だけ。それで publish 済みパッケージ同士を依存させると、adr-tools のバージョンを上げないと tpl-tools が動かないという時間結合が生まれる。TPL 固有のキーを将来追加するときも ADR の設定形式に縛られる
- **`adr.config.json` をハードコードしない理由**: ADR を採用しないプロジェクトでも tpl-tools をそのまま使えるようにするため。karasu スコープでの single-source（ADR-20260512-03）は wiring 側が `--config` を渡すことで実現できる
- **YAGNI**: 将来 frontmatter-docs 系ツールが 3 つ目 4 つ目になったら共通基盤 `@kompiro/frontmatter-tools` 的なものを抜く判断もあるが、今は早すぎる

## 却下した案

- **`@kompiro/adr-tools` に同梱**: scope が膨らみ release cycle が結合する。却下
- **tpl-tools が `@kompiro/adr-tools` の `loadConfig` を再利用**: 時間結合とスキーマの引きずられが発生。却下（自前実装の差分は数十行で、redundancy のコストは結合のコストより小さい）
- **`topics` を中立な設定ファイル名（例: `reference-data.json`）に移す**: ADR-20260512-03 を破壊的変更で書き直す必要がある。今回のスコープ外。tpl-tools 切り出しはこの判断と独立に進められる。3 つ目以降のツールが現れたタイミングで再検討する

## 影響範囲

- **CI**: `tpl-validate` workflow は元々 informative-only なので required check への影響はない。`pnpm install` で `@kompiro/tpl-tools` を取得する必要があるため、package 側の "Manage Actions access" に `kompiro/karasu` を `Read` で追加した
- **lefthook**: pre-push hook の `tpl-validate` は同名 script を経由しているため hook 側の変更は最小
- **テスト**: TPL validator のテストは `kompiro/tpl-tools` に移動。karasu の `pnpm run test:scripts` からは TPL 分が消えるが、他 scripts のテストは残る
- **devcontainer / ローカル install**: `NODE_AUTH_TOKEN` に `read:packages` 権限が必要。fine-grained PAT を使う場合は Repository permissions の **Packages: Read-only** を有効化する（`docs/process.md` 「Sibling repo の clone」節に追記）

## 関連 TPL

このタスクはツール移設で `.krs` / app の振る舞いを変えないため、直接該当する TPL は無い。強いて挙げれば「設定の単一ソース」を扱う [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)（spec doc ⇄ reference-data sync）の精神に沿って、`topics` 語彙の参照を二重定義にしない設計を踏襲している。
