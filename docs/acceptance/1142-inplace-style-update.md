---
type: product
---

# AT-1142: GUI style edit upsert — in-place update for single-property rules, append fallback otherwise

- **日付**: 2026-05-08
- **関連 Issue**: [#1142](https://github.com/kompiro/karasu/issues/1142)
- **対象ファイル**:
  - `packages/app/src/lib/append-style-rule.ts`、`packages/app/src/lib/append-style-rule.test.ts`
  - `packages/app/src/components/AppShell.tsx`
- **関連 ADR**: [ADR-20260508-01](../adr/20260508-01-gui-style-inplace-update.md)（supersedes [ADR-20260506-01](../adr/20260506-01-gui-driven-style-editing.md)）
- **依存**: [ADR-20260506-02](../adr/20260506-02-edge-id-selector.md)（`edge#<canonicalId>` selector）

## 受け入れ条件

- [x] AT-A: `upsertStyleProperty` は対象 selector の **単一プロパティ・コメント無し** ブロックを in-place で書き換える（単一行）
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `upsertStyleProperty › rewrites a single-line rule in place`

- [x] AT-B: `upsertStyleProperty` は対象 selector の **改行入り・単一プロパティ・コメント無し** ブロックも in-place で書き換える（軽い手書き整形に追従）
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `upsertStyleProperty › rewrites a multi-line single-property rule in place ...`

- [x] AT-C: 複数プロパティを持つブロックは触らず、新規 rule を末尾に append する
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `upsertStyleProperty › falls back to append for multi-property rules`

- [x] AT-D: `/* */` ブロックコメントを含むブロックは触らず、append する
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `upsertStyleProperty › falls back to append when the block contains a /* */ comment`

- [x] AT-E: `//` 行コメントを含むブロックは触らず、append する
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `upsertStyleProperty › falls back to append when the block contains a // line comment`

- [x] AT-F: 同一 selector が複数回出現するファイルでは、**最後の出現** を更新する（cascade-tail と整合）
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `upsertStyleProperty › updates the LAST matching block when the same selector appears multiple times`

- [x] AT-G: selector 種別非依存 — node ID 形式 `#<id>` でも同じロジックで動作する
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `upsertStyleProperty › works for node-style id selectors (general for ...)`

- [x] AT-H: selector の prefix 一致は拾わない（`edge#flow` は `edge#flow2` と衝突しない）
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `upsertEdgeDirectionRule › does not collide rules whose ids share a prefix`

- [x] AT-I: 既存ファイルが無い時は、append として新規ファイルを作成する
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `upsertEdgeDirectionRule › creates the file with the rule when it does not exist`

- [x] AT-J: 既存ファイルに対象 rule が存在しない場合、末尾に append する（旧 append-only と同じ挙動を維持）
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `upsertEdgeDirectionRule › appends to an existing file when no matching rule is present`

- [ ] AT-K（manual）: brand-new な `.krs`（`@import` 無し）を `pnpm --filter @karasu-tools/app dev` の Preview で開き、edge を右クリック → Direction ▸ Down → Right → Up と 3 回切り替える。**`.krs.style` のファイル末尾には 1 行だけ** `edge#<id> { direction: up; }` が残ることを目視（旧実装では 3 行積まれていた）
  > 🧑 Manual — 本 PR の主要な体験改善ポイント。サイドバーが #1148 で reload するので、Preview を開いたまま `.krs.style` をクリックして中身を確認する

- [ ] AT-L（manual）: 同じ Preview で、ユーザーが事前に `.krs.style` を手動編集して `edge#<id> { color: red; direction: down; }` の **複数プロパティ** rule を書いておき、GUI で direction を変更すると、**手書き rule は触らず** 末尾に `edge#<id> { direction: <new>; }` が追加される（手書き整形を壊さない）
  > 🧑 Manual — fallback 経路の実機確認。手書き整形保護が効いていることを担保する

## 補足

- 本実装は `.krs.style` への書き込みパス全体を `appendEdgeDirectionRule`
  → `upsertEdgeDirectionRule` に切り替える。AppShell 側の呼び出しと
  関連テストも追従。
- 「単一プロパティ・コメント無し」判定は防御的に書く: `;` 区切りで
  property 宣言数を数え、`/*`・`*/`・`//` の含有を拒否する。判定不能な
  shape に当たったら append にフォールバックする。
- 過去に append された累積 rule の整理は **本実装の対象外**。Tidy Style
  コマンド（別 Issue）で扱う。
