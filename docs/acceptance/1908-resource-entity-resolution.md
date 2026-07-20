---
type: product
---

# AT-1908: resource → entity resolution + transitive derivation (PR 2c)

- **日付**: 2026-07-13
- **関連 Issue**: [#1908](https://github.com/kompiro/karasu/issues/1908)（Sub-task of [#1870](https://github.com/kompiro/karasu/issues/1870)）
- **対象ファイル**:
  - `packages/core/src/resolver/resource-entity.ts`（新規 — 解決ヘルパ）
  - `packages/core/src/view/view-extract.ts`（推移的導出・二重計上排除・R/W 合成）
  - `packages/core/src/resolver/warnings.ts`（`detectUnassignedResources` / `detectSharedInfraFanIn` の entity 対応）
  - `packages/core/src/parser/parser.ts`（`unassigned-resource` を parser から除去）
  - `packages/core/src/types/{ast,warnings}.ts`
  - `packages/i18n/src/{types,en,ja,render-warning,render-diagnostic}.ts`
  - `docs/spec/{syntax,syntax.ja,diagnostics,diagnostics.ja}.md`
- **関連 ADR**: [ADR-1870](../adr/1870-domain-entity-modeling.md)（ドメインエンティティと関連のモデリング v1 — #1910 で design doc から昇格）
- **関連 TPL**: TPL-20260623-02 / TPL-20260514-05 / TPL-20260510-07

## 受け入れ条件

- [x] AT-A: bare `resource Order` が一意な `entity Order` に解決される（unique match）
  > ✅ Automated — `packages/core/src/resolver/resource-entity.test.ts` › `resolves a bare id to a unique entity and its physical mapping`

- [x] AT-B: entity が別 domain / service にあってもフラット id 空間で解決される
  > ✅ Automated — `packages/core/src/resolver/resource-entity.test.ts` › `resolves an entity across domain/service boundaries`

- [x] AT-C: bare `resource Order` は entity 宣言の追加で**無編集**解決され、`unassigned-resource` 警告が消える（編集ゼロの昇格）
  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `promotes a bare resource with zero edits once the matching entity is declared`

- [x] AT-D: `usecase → entity → table → database` を辿って `service → database` エッジが導出される
  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › `derives a service→database edge through usecase → entity → table → database`

- [x] AT-E: 物理直参照と entity 経由参照が同じ store に到達しても二重計上されない
  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › `does not double-count a physical and an entity-mediated reference to the same store`

- [x] AT-F: `table` 対応のない entity に解決される resource は store エッジを導出せず、警告も出さない
  > ✅ Automated — `resource-entity.test.ts` › `resolves logically but yields no infra parent …` + `view-extract.test.ts` › `derives no store edge when the resolved entity has no physical mapping` + `warnings.test.ts` › `resolves logically even before a physical table mapping exists`

- [x] AT-G: entity 経由の bare resource でも usecase→resource エッジに read/write タグが合成される
  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › `synthesizes a read/write usecase→resource edge for a bare entity-resolved resource`

- [x] AT-H: 曖昧な bare id（別 domain 下の同名 entity 2 個）は解決されず `unassigned-resource` 警告のまま、根本原因は `entity-anchor-collision` が指す
  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `keeps an ambiguous bare resource unresolved and surfaces the collision root cause`

## 手動確認

N/A — all covered by automated tests（resolver / view 層の振る舞いで、app / 視覚
表面はなし。エンティティビューの app 統合は PR 2b #1907 の担当）。
