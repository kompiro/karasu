# AT: Embed rendered SVG diagrams alongside guide snippets

- **日付**: 2026-06-16
- **関連 Issue**: [#1574](https://github.com/kompiro/karasu/issues/1574)
- **対象ファイル**: `scripts/guide/gen-guide-diagrams.ts`

## 受け入れ条件

特記なき項目は `scripts/guide/gen-guide-diagrams.test.ts` でカバーされる。

- [x] マーカー（`<!-- render: <view> id=<id> -->`）付きスニペットから指定 view の SVG を生成し、画像参照を必ず **閉じフェンスの外（直後）** に挿入する

  > ✅ Automated — `scripts/guide/gen-guide-diagrams.test.ts` › `inserts each image region directly after its closing fence — never inside a fence`

- [x] 同一ファイル内に複数マーカーがあっても、各画像がコードフェンス内に紛れ込まない（複数挿入時の anchor ずれ回帰）

  > ✅ Automated — `scripts/guide/gen-guide-diagrams.test.ts` › `inserts each image region directly after its closing fence — never inside a fence`

- [x] 再実行しても markdown と SVG が変化しない（決定的・冪等）

  > ✅ Automated — `scripts/guide/gen-guide-diagrams.test.ts` › `is idempotent — a second pass reproduces the same markdown and SVGs`

- [x] `.md` は `<id>.svg`、`.ja.md` は `<id>.ja.svg` と言語別の出力パスになる

  > ✅ Automated — `scripts/guide/gen-guide-diagrams.test.ts` › `derives per-language SVG paths from the filename`

- [x] `style` フラグ付きマーカーは直後の css ブロックをスタイルとして適用し、スニペットの `@import "*.krs.style"` 行を除去する

  > ✅ Automated — `scripts/guide/gen-guide-diagrams.test.ts` › `uses the next css block as the stylesheet and strips the @import line when `style` is set`

- [x] スニペットが compile error を起こす場合は生成を失敗させる

  > ✅ Automated — `scripts/guide/gen-guide-diagrams.test.ts` › `throws when a snippet fails to compile`

- [x] マーカーが `krs` フェンスの直上にない場合・未知の view の場合はエラーにする

  > ✅ Automated — `scripts/guide/gen-guide-diagrams.test.ts` › `throws when a render marker is not directly above a krs fence` / `throws on an unknown view`

- [x] コミット済みのガイド図・画像参照が最新（`--check` の drift gate が通る）

  > ✅ Automated — `scripts/guide/gen-guide-diagrams.test.ts` › `the committed guide diagrams + image refs are up to date (run `pnpm gen:guide-diagrams` if this fails)`

## Manual verification

- [ ] 代表図（system / org / styled）が実際に意図どおり描画され、レイアウトが破綻していないこと

  > Manual / visual review — 生成物の決定性・drift は自動テストで縛れるが、「図が読者にとって正しく・読みやすく描けているか」（auto-layout の最終的な見た目、styled 図の色とバッジ、org 図のチーム構造）は SVG snapshot では判定しきれず目視が必要。GitHub 上のガイド（`docs/guide/01-service-team-design.md` 等）で各図が white 背景・light テーマで適切に表示されることを確認する。
