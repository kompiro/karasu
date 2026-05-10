---
id: TPL-20260510-14
title: "E2E の async UI 操作は要求した state ではなく到達した stable state を待ってから assert / 操作する"
status: active
date: 2026-05-10
applicable_to:
  - "Playwright / ExTester で SVG / DOM の状態変化を assertion する E2E テスト"
  - "click / fill / type など input 系の操作と、その結果として再描画される要素の assertion を連鎖させるシーケンス"
  - "Monaco Editor のように非同期 mount / 内部状態が settle する前に keystroke を送るテスト"
known_consumers:
  - editor-fixture
  - playwright-tests
related_to:
  - TPL-20260510-08
  - TPL-20260510-13
discovered_from:
  - issue: "#1171"
  - issue: "#976"
  - root_cause_file: "packages/e2e/tests/at-0014-memory-project-mode-unification.spec.ts:162"
  - root_cause_file: "packages/e2e/fixtures/editor.ts"
topic: testing
scope:
  packages:
    - e2e
---

# TPL-20260510-14: E2E の async UI 操作は要求した state ではなく到達した stable state を待ってから assert / 操作する

## 観点

E2E で「操作 → 再描画 → assertion」のシーケンスを書くとき、**操作と再描画の間に "stable に達した" シグナル** を挟まないと、再描画途中の transient state を観測してしまい、間欠的に失敗する（flake する）。

代表的な落とし穴:

- `click()` 後すぐに `toHaveClass(...)` する → 再描画完了前に assertion が走り、class がまだ付いていない / 付いてから剥がれた瞬間を見る
- Monaco Editor に `Ctrl+A` → `Delete` → `insertText` を一気に流す → mount / 値の同期が完了する前にキー入力を送り、入力が drop / 重複する（→ TPL-04 と地続き）
- ナビ後の URL 変化を待たずに次の要素を assert する → 旧画面の DOM を観測する

`expect(locator).toHaveCount(1)` のような Playwright の **auto-retry assertion** は短い揺らぎを吸収できるが、**5s タイムアウトを使い切って落ちる場合は「到達不能」か「再描画で剥がれて戻る race」のどちらか**。timeout を伸ばすのは fix ではなく、stable state の定義 / 待機が間違っているサイン。

#1171 では Deploy → System のクロスナビ後に `[data-node-id="Web"].karasu-highlighted` が toHaveCount(1) で 5s タイムアウトしていた。highlight class が付いて剥がれて再付与される race か、付与経路自体が走っていないかのどちらか。`retries=2` 時代は 3 回目で通っていた事実が「stable state を待っていない」ことの証拠。

## 想定される失敗モード

- **toHaveCount / toHaveClass の auto-retry がタイムアウト** で落ちる（短い flake ではなく決定的な timeout）
- 個別実行・低負荷環境では通り、CI worker 並列度が高いと落ちる
- `retries=2 → 1 → 0` と retry を絞った瞬間に flake が表面化する
- Monaco / 大きな React tree など **mount コストが高い** UI で顕著

## チェックリスト

E2E で UI 状態の assertion / 連鎖操作を書くとき、以下を確認する:

- [ ] click / nav / fill の **直前と直後** に「想定 state に到達した」signal を待っているか（`waitForURL` / `getByRole(..., { name }).waitFor()` / 特定要素の `toBeVisible()` など）
- [ ] auto-retry が効く assertion（`toHaveCount` / `toHaveClass` / `toHaveText`）で **timeout を伸ばさず** に通るか。伸ばさないと通らないなら待機点が間違っている可能性が高い
- [ ] Monaco Editor 等の async mount コンポーネントに対しては、**fixture が「ready」を保証する helper** を提供しているか（直接 keystroke を送らない）
- [ ] 「class が付いた瞬間」のような **transient な state** を assertion せず、「**stable な後続状態**」（次の操作が enabled になっている等）で代替できないか検討したか
- [ ] retry を 2 → 1 → 0 と段階的に絞ったときに通り続けるか。`retries=0` で通らないテストは **隠れ flake** を抱えている

## 既知の対処パターン

- nav 後の assertion は **URL / aria 状態 / 主要要素の visible** を順に待つ。click 直後に深い DOM の class を見ない
- Monaco に対しては `replaceEditorContent(page, content)` のような **fixture helper** を導入し、内部で「editor が ready」「値が反映された」を待つ。各 spec が個別に Ctrl+A → Delete → insertText を書かない
- transient state を直接 assert したい場合は、**それが stable に維持される条件を作ってから** 観測する（例: 連続した nav の途中ではなく、最終的に止まった位置で highlight を見る）
- flake が出たテストは `test.fixme()` でロックし、**根本原因 issue を立てて hypothesis を 2-3 個書く**（#1171 のスタイル）。`fixme` を雑に外さない
- `retries` を絞ったときに落ちるテストは、retry の数だけ「stable 待ちを忘れている」サインなので、retry を増やして治すのではなく fixture / helper を直す

## 関連テスト

- `packages/e2e/fixtures/editor.ts` — `replaceEditorContent` 等の wait-for-ready helper
- `packages/e2e/tests/at-0014-memory-project-mode-unification.spec.ts:162`
- `packages/e2e/playwright.config.ts` — retries 設定
