# AT: v1.x deprecation diagnostics for non-builtin tags / annotations

- **日付**: 2026-07-29
- **関連 Issue**: [#2159](https://github.com/kompiro/karasu/issues/2159)（tags-and-facets Part A、親 [#2065](https://github.com/kompiro/karasu/issues/2065)）
- **関連 Design Doc**: `docs/design/tags-and-facets.md`（ADR 昇格は Part B 完了後）
- **関連 spec**: [`docs/spec/tags-annotations.md`](../spec/tags-annotations.md)（Non-builtin tag / annotation names are deprecated、Vocabulary registers）/ [`docs/spec/diagnostics.md`](../spec/diagnostics.md)
- **関連 TPL**: [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)（第 4 状態を状態 (2) に解消）
- **対象ファイル**:
  - `packages/core/src/types/warnings.ts`（`tag-not-builtin` / `annotation-not-builtin`）
  - `packages/core/src/resolver/warnings.ts`（detector + `SYSTEM_ASSIGNED_TAGS`）
  - `packages/i18n/src/{types,en,ja,render-warning}.ts`

> スコープは **v1.x の additive な deprecation 診断**のみ。facet construct（Part B）、
> style セレクタへの deprecation 告知（B8）、v2.0 の閉鎖そのものは対象外。

## 受け入れ条件

- [x] AT-A: 非 builtin タグ（例 `[cache]`）は任意の node kind / edge で `tag-not-builtin`（warning）になる

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `tag-not-builtin deprecation warning (#2159)` › `warns on a non-builtin tag on any node kind` / `warns on a non-builtin tag on an edge` / `walks nested nodes`

- [x] AT-B: builtin 17 種と system-assigned タグ（`[inferred]` 等）は警告されない — `translate --from db` の出力が警告ゼロで通る

  > ✅ Automated — 同 describe › `stays silent for every builtin tag` / `stays silent for system-assigned tags — [inferred] is stamped into source by translate`

- [x] AT-C: 非 builtin アノテーション（例 `@canary`）は node / team で `annotation-not-builtin`（warning）になり、builtin 4 種は警告されない

  > ✅ Automated — `annotation-not-builtin deprecation warning (#2159)` › `warns on a non-builtin annotation` / `stays silent for the four builtin annotations` / `covers team annotations in organization blocks`

- [x] AT-D: style セレクタがあっても抑制されない（`annotation-possible-typo` の抑制条件は温存され、near-miss には両診断が併発する）

  > ✅ Automated — 同 describe › `is NOT suppressed by a style selector, unlike the typo hint` / `fires alongside the typo hint on an unstyled near-miss`、tag 側 › `is NOT suppressed by a style selector — intent does not change the v2.0 outcome`

- [x] AT-E: 両診断の register は warning（info ではない）

  > ✅ Automated — `warningSeverity — exhaustive register map` › `tag-not-builtin → warning` / `annotation-not-builtin → warning`

- [x] AT-F: en / ja の警告メッセージが移行先（facet #2065 / builtin 追加要望）を案内する

  > ✅ Automated — `packages/i18n/src/render-warning.test.ts`（`tag-not-builtin` / `annotation-not-builtin` の en/ja レンダリングとプレースホルダ解決）

### 手動確認（CI で検証できない項目）

- [ ] M-1: app の WarningPanel で `[cache]` タグ / `@canary` アノテーションを持つモデルを開くと、deprecation warning が警告アイコン（info ではない）付きで表示され、詳細行の移行先ガイドが en / ja とも読めること
- [ ] M-2: 既存の examples（getting-started / ec-platform / multi-file-system）を app で開いても deprecation warning が 1 件も出ないこと
