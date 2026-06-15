# AT-1568: アノテーションパラメータ（移行 intent フィールド）

組み込みライフサイクルアノテーションに `@name(key: "value")` パラメータを持たせる言語層機能の受け入れ基準。設計は [ADR-20260615-02](../adr/20260615-02-migration-intent-fields.md)。値解釈・表示の消費者は [#1595](https://github.com/kompiro/karasu/issues/1595) で後続。

## 受け入れ条件（自動）

### parser — `packages/core/src/parser/parser.test.ts`

- [x] `@deprecated(until: "2026-Q3")` / `@migration_target(from: Legacy)` を解析し、名前リスト（`annotations`）は不変、params は `annotationParams[name][key]` に保持される

  > ✅ Automated — `parser.test.ts` › `parses recognized annotation params (until / from) and keeps the name list (#1568)`

- [x] 日付としてパースできない `until` 値（例: `"sometime next year"`）も警告なしで opaque に保持される（graceful degradation）

  > ✅ Automated — `parser.test.ts` › `accepts an opaque (non-date) until value without a warning (graceful degradation)`

- [x] 未対応パラメータ（他アノテーション・未認識キー）は `annotation-param-unsupported`（warning）で破棄され、`annotationParams` は付かない

  > ✅ Automated — `parser.test.ts` › `warns and drops an unsupported annotation param, leaving annotationParams unset`

### coverage — `packages/core/src/parser/base-node-fields-coverage.test.ts`

- [x] `annotationParams` を `BaseNodeFields` に追加しても coverage 契約（compile-time）が成立する

  > ✅ Automated — `base-node-fields-coverage.test.ts` の `ExpectedKeys` 契約

### spec — `docs/spec/tags-annotations.md` / `.ja.md`

- [x] 「Annotation parameters」節が en / ja 同構造で存在し、TPL-20260610-01 と双方向リンクする

  > ✅ Automated — `scripts/lint/spec-structure-sync.ts`（pre-push / CI）

## 受け入れ条件（手動）

- N/A — 言語層のみ。params の表示 / filter は #1595 で扱う（本 PR では表示面を追加しない）。
