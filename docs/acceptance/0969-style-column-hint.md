# AT: Presentation-only `column` layout hint in `.krs.style`

- **日付**: 2026-04-29
- **関連 Issue**: [#969](https://github.com/kompiro/karasu/issues/969)（親 [#966](https://github.com/kompiro/karasu/issues/966)）
- **対象ファイル**:
  - `packages/core/src/types/style.ts`（型追加）
  - `packages/core/src/resolver/style-resolver.ts`（hint 解決）
  - `packages/core/src/renderer/layer-layout-logics.ts`（`bucketByColumn`）
  - `packages/core/src/renderer/layout.ts`（system view で bucket 適用）
  - `examples/ja/getting-started/default.krs.style` / `examples/en/getting-started/default.krs.style`
  - `docs/spec/style.md` / `docs/spec/style.ja.md`
- **設計ドキュメント**: [ADR-20260429-04](../adr/20260429-04-style-column-layout-hint.md)

## 受け入れ条件

### 解決

- [x] `column: left | center | right` が `.krs.style` から解決され、`ResolvedStyles.layoutHints` に格納される
  > ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `populates layoutHints for valid values`

- [x] 不正な値（`column: middle` など）は捨てられ `style-column-invalid-value` 警告が出る
  > ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `emits style-column-invalid-value and skips the hint when the value is unknown`

- [x] cascade は通常スタイルと同じ規則 — id selector が kind selector を上書きする
  > ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `honors cascade: id selector overrides kind selector`

- [x] 同じ specificity で複数宣言があった場合、宣言順で後勝ち
  > ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `honors cascade: same specificity → declaration order, last wins`

### Layout への適用

- [x] system view で同じ layer 内のノードが `column: left` → 未指定/`center` → `column: right` の順に並ぶ
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `places left-bucket nodes before middle, right-bucket after middle (single-system path)`

- [x] バケット内は宣言順を保つ
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `preserves declaration order within each bucket`

- [x] `column: center` は未指定と同じ中央バケットに入る
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `treats column: center as middle (same bucket as unspecified)`

- [x] 多システム root view（`layoutMultipleSystems`）でも bucket が適用される
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `applies bucketing in the multi-system root path`

- [x] hint が無い、または全ノードが同じバケットの場合は既存の出力と完全に一致する（後方互換）
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `layout output is unchanged when no hints are passed` / `no-op when every node is in the same bucket (unspecified)`

### スコープ

- [x] deploy view で `column` が解決された場合、`style-column-ignored-non-system-view` 警告を出して配置に影響しない
  > ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `warns when a column hint resolves on a deploy node`

- [x] org view で `column` が解決された場合も同様の警告
  > ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `warns when a column hint resolves on an org team node`

### 手動検証

- [ ] **Preview UI で getting-started を開き、最下段が `[Notification] [DB / Order events / Media storage] [Payment / Inventory]` の並びで読めることを目視確認する。**

  > 検証方法: `pnpm --filter @karasu-tools/app dev` で起動し、Project selector から `getting-started`（または `getting-started-en`）を選ぶ。`default.krs.style` で `service[external] { column: right; }` が効いているため、Payment と Inventory が右端、内部の Notification や infra（EC Site DB / Order events / Media storage）はそれより左に配置される。

  > Manual rationale: 自動レイアウトの最終的な見た目は SVG snapshot test では確認できるが、「人間が読みやすいか」の判定は人手の目視が必要。代表ケースで意図どおり並んでいることを Issue #969 の motivating example として確認したい。
