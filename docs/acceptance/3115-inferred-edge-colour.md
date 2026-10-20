---
type: product
---

# AT: `[inferred]` のエッジが無タグのエッジと別の色で描かれる（#3115）

- **日付**: 2026-10-17
- **関連 Issue**: [#3115](https://github.com/kompiro/karasu/issues/3115)
- **Related TPLs**: [TPL-1944](../test-perspectives/TPL-1944-inferred-tag-only-soft-fk.md), [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)
- **対象ファイル**: `packages/core/src/builtins/default-style.ts`

> 組み込みスタイルが `edge[inferred]` に無タグの `edge` と同じ色を付けていたため、推測の関連と確認済みの関連が見分けられなかった。`[inferred]` を暖色寄りのグレー（dark `#A8A29E` / light `#78716C`）にする。

## 受け入れ条件

### AC-1: `[inferred]` は無タグのエッジと見分けられる色で、キャンバス上で読める

- [x] AT-A: 両テーマで、色を指定するエッジのタグ規則（`[inferred]` を含む）は、無タグのエッジの色から CIE76 で 10 以上離れている。修正前の組み込みスタイルでは `[inferred]` が両テーマで落ちる

  > ✅ Automated — `packages/core/src/builtins/default-style-contrast.test.ts` › `builtin badge colors (%s theme)` › `edge color of %s reads apart from the untagged edge`

- [x] AT-B: `[inferred]` の色はキャンバスに対して AA（4.5:1）以上

  > ✅ Automated — `packages/core/src/builtins/default-style-contrast.test.ts` › `builtin badge colors (%s theme)` › `edge color of %s is AA-legible on the canvas`

## 手動確認

色が実際に見分けられるかは、既存の [store-scoped-er-view.md](store-scoped-er-view.md) の M-2 で確かめる（この PR の Manual Verification Checklist に写す）。
