---
type: product
---

# AT-1326: Reference Syntax / Styles tab — fill the prose gaps

- **日付**: 2026-05-12
- **関連 Issue**: [#1326](https://github.com/kompiro/karasu/issues/1326)（親 [#1296](https://github.com/kompiro/karasu/issues/1296)）
- **対象ファイル**:
  - `packages/app/src/components/ReferencePanel.tsx`（Syntax タブの `<pre>` スニペット、Styles タブの selector examples / specificity テーブル）
  - `packages/app/src/components/ReferencePanel.test.tsx`
- **関連 ADR**: [ADR-20260512-03](../adr/20260512-03-reference-data-single-source.md)（`docs/spec/syntax.md` の `krs` フェンスを app に取り込む方向 — 散文スニペットの全面生成化は別 follow-up）

## 受け入れ条件

- [ ] AT-A: Syntax タブ（system view）の Edge Syntax ブロックに edge id（`#<id>`）の例と canonical id 派生（`<from><arrow><to>`）の注記がある
  > ✅ Automated — `packages/app/src/components/ReferencePanel.test.tsx` › `Syntax tab documents resource operations (CRUD) and the optional edge id`（`#criticalWrite` の存在を確認）

- [ ] AT-B: Syntax タブ（system view）に "Resource Operations (CRUD)" ブロックがあり、`operations create, read`（CRUD 列挙）と verb-decoration（`enqueue:create` 等の 1:N CRUD マッピング）の例が表示される
  > ✅ Automated — `ReferencePanel.test.tsx` › `Syntax tab documents resource operations (CRUD) and the optional edge id`

- [ ] AT-C: Styles タブ（system view）の Selector Specificity テーブルに `Edge ID`（`edge#criticalWrite` / specificity 101）の行があり、Selector Examples に `edge[write] { direction: down; }` と `edge#criticalWrite { ... }` の例がある
  > ✅ Automated — `ReferencePanel.test.tsx` › `Styles tab includes the edge#<id> selector (specificity 101) and a direction example`

- [ ] AT-D: `getReference(locale)` は両ロケールでこれまでどおり解決し、`reference-spec-sync.test.ts` は無変更で green（本変更は `reference-data.ts` / `docs/spec/*` に触れていない）
  > ✅ Automated — `packages/core/src/builtins/reference.test.ts` / `reference-spec-sync.test.ts` / `packages/app/src/i18n/locale-coverage.test.tsx`（無変更で pass）

- [ ] AT-E（manual）: アプリ（`pnpm dev`）で Reference パネル → Syntax タブ（system view）に Resource Operations ブロックと Edge Syntax の `#<id>` 例が、Styles タブに `Edge ID` の specificity 行と `direction` の例が表示されることを目視確認する。`docs/spec/syntax.md` の `#### operations property` / `#### Optional edge id` / `docs/spec/style.md` の `## Edge ID selector` と内容が齟齬していないことも確認する
  > 🧑 Manual — UI 表示と spec doc との整合の目視確認
