---
id: ADR-20260502-02
title: ADR ツール用語彙の adr.config.json への外部化
status: accepted
date: 2026-05-02
topic: adr-tooling
depends_on: [ADR-20260424-01]
related_to: [ADR-20260423-01]
assumptions:
  - "file: adr.config.json"
  - "grep: package.json :: @kompiro/adr-tools"
---

# ADR-20260502-02: ADR ツール用語彙の adr.config.json への外部化

- **日付**: 2026-05-02
- **ステータス**: 決定済み
- **関連**:
  - Issue #1077（Phase 1）— 親 #1074（adr-tools 抽出）
  - Design Doc: `docs/design/adr-config-externalization.md`（PR #1079）→ 本 ADR で昇格
  - PR #1080（実装）
  - ADR-20260424-01（ADR knowledge graph、frontmatter スキーマの母体）
  - ADR-20260423-01（`adr-tooling` トピック導入、本 ADR 群の境界づけ）

## 背景

`scripts/adr/` 配下の ADR ツール（validator / extractor / regenerator / visualizer / assumption checker、計 ~2,580 LOC）は、将来別リポジトリへ抽出して `@kompiro/adr-tools` として npm publish する計画がある（Issue #1074）。

抽出のためには、karasu 固有の語彙が `scripts/adr/validator.ts` の module-level 定数（`VALID_TOPICS`、`VALID_CONCERNS`）と、`regenerator.ts` の出力パスリテラル（`effective.md`、`graph.md`、`graph/<topic>.md`）にハードコードされている状態を解く必要がある。

## 決定

ADR ツールの語彙と出力パスを repo root の `adr.config.json` に外部化し、CLI 起動時に必須読み込みとする。設定不在は明確なエラーで `pnpm adr:init` を案内する厳格モードを採用する。

## 理由

- **抽出後を見据えた純粋な library 体験**: defaults に karasu の語彙を焼き付けると、抽出後に他プロジェクトが採用するときに「とりあえず使う」と karasu の topic 名で警告が出続ける。厳格モードなら採用者が必ず自分の vocabulary を持つことを強制できる。
- **`eslint --init` / `tsc --init` の先例**: 設定必須化と init による雛形生成は、ユーザー体験として違和感がない確立されたパターン。
- **JSON 形式の選択**: editor 補完が JSON Schema で素直に効き、評価不要なので信頼境界が単純。コメント不要な設定なので YAML / TS 形式は採用しない。
- **必須引数化（`validateDirectory(dir, config)` / `buildGeneratedFiles(adrs, config)`）**: optional 引数で内部 fallback を持たせると「どこかで暗黙に defaults が混ざる」事故が起きるため、型レベルで強制する。
- **2 つの専用例外（`AdrConfigMissingError` / `AdrConfigInvalidError`）**: 不在と不正を区別し、CLI 側で人間向けエラーに変換する。
- **配列の空指定 `[]` は許容**: フリーテキスト topic を許可したい採用者向けに `topics: []` で controlled vocabulary 検査をスキップ可能。
- **JSON Schema は `additionalProperties: false`**: editor で未知フィールドを即座に検出。後方互換は Phase 2 で `version` フィールド導入時に扱う（loader 側で未知フィールドを silent ignore する forward-compat 約束はしない）。

## 却下した案

- **寛容モード（config 不在で built-in defaults を使用）**: Issue #1077 当初の AT 案だったが、defaults が karasu 固有値だと抽出後に必ず作り直す負債になる。ユーザーレビューで却下し厳格モードへ変更（design doc 論点 3）。
- **`adr.config.ts` / `.yaml` 形式**: TS は tsx 評価が必要で信頼境界が曖昧、YAML は frontmatter と分離する利点が薄い。JSON を採用（design doc 論点 1）。
- **cosmiconfig 風の上位探索**: Phase 1 では過剰。CWD 直下のみ + テスト用に引数で明示パスを受ける形にした。Phase 2 で必要になったら追加（design doc 論点 2）。
- **`VALID_TOPICS` の Phase 1 残置**: design doc では Phase 2 削除予定だったが、refactor 後に残った import がなく knip が dead code として検出したため PR #1080 内で前倒し削除した。

## Phase 2 への申し送り

- 組み込み defaults 撤廃の追加対応は不要（既に厳格モード）
- `version` フィールド導入と forward-compat ポリシー策定
- cosmiconfig 風の上位探索の必要性を再評価
- ajv による厳格バリデーション（loader 側）の導入検討
