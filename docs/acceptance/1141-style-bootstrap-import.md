---
type: product
---

# AT-1141: GUI style editing — auto-create `.krs.style` and inject `@import` when missing

- **日付**: 2026-05-06
- **関連 Issue**: [#1141](https://github.com/kompiro/karasu/issues/1141)（親 [#1076](https://github.com/kompiro/karasu/issues/1076)）
- **対象ファイル**:
  - `packages/app/src/lib/append-style-rule.ts`、`packages/app/src/lib/append-style-rule.test.ts`
  - `packages/app/src/components/AppShell.tsx`
- **関連 Design Doc**: [`docs/adr/1076-gui-driven-style-editing.md`](../adr/1076-gui-driven-style-editing.md)
- **依存**: AT-1098（edge direction context menu MVP）

## 受け入れ条件

- [x] AT-A: `deriveStyleFilePath("/proj/flow.krs")` が `/proj/flow.krs.style` を返す（basename から末尾の `.krs` を剥がして `.krs.style` を付与）
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `deriveStyleFilePath › strips a trailing .krs ...`

- [x] AT-B: `deriveStyleFilePath` は同名の `.krs` がディレクトリ違いで存在しても **source の隣に** 解決する
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `deriveStyleFilePath › resolves to the same directory as the source even when nested`

- [x] AT-C: `resolveOrDeriveStyleAppendTarget` は `@import` がある場合はそれを優先し、無い場合は派生パスにフォールバックする
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `resolveOrDeriveStyleAppendTarget › prefers an existing @import ...` / `... falls back ...`

- [x] AT-D: `injectStyleImport` は `.krs` の 1 行目に `@import "<basename>.krs.style"` を挿入し、既存内容はそのまま後ろに残す
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `injectStyleImport › inserts the directive at line 1 ...`

- [x] AT-E: `injectStyleImport` は冪等で、既に同じ import がある `.krs` には重複追記しない
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `injectStyleImport › is idempotent ...`

- [x] AT-F: `injectStyleImport` は **異なる** style file への既存 import がある場合でも、新しい import を頭に追加する（cascade-tail で勝つのは `appendEdgeDirectionRule` 側の責務、ここでは追記そのものをブロックしない）
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `injectStyleImport › does not collide with a different existing @import ...`

- [x] AT-G: `appendEdgeDirectionRule` は対象 `.krs.style` が存在しないとき新規作成する（既存挙動の継続。bootstrap 経路でも同じパスが通る）
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `appendEdgeDirectionRule › creates the file with the rule when it does not exist`

- [x] AT-H: brand-new な `.krs`（`@import` 無し）を開き、edge を右クリック → Direction ▸ Down を選ぶ。`.krs` の先頭に `@import "<basename>.krs.style"` が挿入され（エディタにも出る）、隣に `.krs.style` ファイルが作られて 1 ルール書かれる
  > ✅ Automated — `packages/e2e/tests/at-1098-edge-direction-context-menu.spec.ts` › `with no @import, the first pick injects it and creates the style file (AT-1141 AT-H)`

- [x] AT-I: 同じ操作をもう一度行うと、`@import` 行は重複しない（idempotent な bootstrap）。`.krs.style` の rule は AT-1142 の upsert により同じ行が書き換わる
  > ✅ Automated — `packages/e2e/tests/at-1098-edge-direction-context-menu.spec.ts` › `later picks rewrite the rule in place and add no second @import (AT-1141 AT-I, AT-1142 AT-K)`

- [ ] AT-J（manual）: basename 衝突の意図しない取り違えが起きないこと — 同名の `flow.krs` が別ディレクトリにあっても、bootstrap 先は **開いている `.krs` の隣** になる
  > 🧑 Manual — `proj-a/flow.krs` と `proj-b/flow.krs` の両方を持つプロジェクトで、片方を開いて Direction を選ぶ → そのディレクトリの `flow.krs.style` のみ更新されることを目視

## 補足

- 「basename と同名の `.krs.style` が既に存在するが import されていない」ケースは、 派生パスとして同じファイルを返すので **既存ファイルへ append される**。Issue の open question で示した「fewer surprises」方針どおり。
- `.krs` ヘッダのコメントや空白行の保護は **将来検討**。現状は line 1 へのストレート挿入で十分（Issue の open question で明示的に許容）。複雑なケースは AT-1142（in-place 更新）と一緒に扱う。
