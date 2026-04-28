# AT-0031: Multiple Deploy Blocks

**Date**: 2026-03-28
**Status**: active
**Related**: [Issue #31](https://github.com/kompiro/karasu/issues/31)

## Overview

複数の `deploy` ブロックを `.krs` ファイルに定義した場合、Deploy タブにセレクタが表示され、ブロックを切り替えてそれぞれのダイアグラムを確認できる。

## Test Cases

### AT-0031-01: Single deploy block — no selector shown

> ✅ Automated — `packages/e2e/tests/at-0031-multiple-deploy-blocks.spec.ts` › `no selector is shown when only one deploy block exists (AT-0031-01)`

**Precondition**: `.krs` ファイルに `deploy` ブロックが1つのみ存在する

**Steps**:
1. プロジェクトを開き Deploy タブをクリックする

**Expected**:
- deploy ブロックのダイアグラムが表示される
- セレクタ（`<select>`）は表示されない

---

### AT-0031-02: Multiple deploy blocks — selector appears

> ✅ Automated — `packages/e2e/tests/at-0031-multiple-deploy-blocks.spec.ts` › `selector appears, switches diagram, and persists across tab switch (AT-0031-02/03/05)`

**Precondition**: `.krs` ファイルに `deploy prod "本番環境" { ... }` と `deploy staging "ステージング" { ... }` の2ブロックが存在する

**Steps**:
1. Deploy タブをクリックする

**Expected**:
- タブバー内にセレクタが表示される
- セレクタの選択肢に「本番環境」「ステージング」が並ぶ
- デフォルトで最初のブロック（`prod`）が選択されている

---

### AT-0031-03: Switching deploy block updates the diagram

> ✅ Automated — `packages/e2e/tests/at-0031-multiple-deploy-blocks.spec.ts` › `selector appears, switches diagram, and persists across tab switch (AT-0031-02/03/05)`

**Precondition**: AT-0031-02 と同じ、Deploy タブが表示済み

**Steps**:
1. セレクタで「ステージング」を選択する

**Expected**:
- ダイアグラムが `staging` ブロックの内容に切り替わる
- `staging` ブロックのノードが表示される

---

### AT-0031-04: Deploy block label shown in selector

**Precondition**: AT-0031-02 と同じ

**Steps**:
1. セレクタの選択肢を確認する

**Expected**:
- ブロックの `label` 値（例: "本番環境"）がオプションテキストとして表示される
- `label` がない場合は `id` が表示される

---

### AT-0031-05: Selection persists when switching tabs

> ✅ Automated — `packages/e2e/tests/at-0031-multiple-deploy-blocks.spec.ts` › `selector appears, switches diagram, and persists across tab switch (AT-0031-02/03/05)`

**Precondition**: Deploy タブで「ステージング」を選択済み

**Steps**:
1. System タブをクリックする
2. Deploy タブに戻る

**Expected**:
- 「ステージング」の選択が維持されている
- ステージングのダイアグラムが表示される

---

### AT-0031-06: Selection resets on file switch

**Precondition**: Deploy タブで「ステージング」を選択済み

**Steps**:
1. 別のファイルを選択する（またはプロジェクトを切り替える）
2. Deploy タブに切り替える

**Expected**:
- セレクタが最初のブロック（`prod`）にリセットされている
