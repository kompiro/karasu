# AT: Actor row placement by first reachable target

- **日付**: 2026-04-28
- **関連 Issue**: [#967](https://github.com/kompiro/karasu/issues/967)（親: [#966](https://github.com/kompiro/karasu/issues/966)）
- **対象ファイル**: `packages/core/src/renderer/layout.ts`

## 受け入れ条件

- [x] outgoing edge を持たない `user` は従来通り最上段（ティア 0）に置かれる

  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `keeps a user in the top row even when topo sort would push it below`

- [x] 中間 client を経由する `user`（target が row 1）は最上段（row 0）のまま

  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `places an actor that bypasses the client tier in the client row, not the top row`（Customer / Seller の検証）

- [x] 中間 client を経由せず深い層に直接到達する `user` は、その target の直前の row に下がる

  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `places an actor that bypasses the client tier in the client row, not the top row`（Admin の検証）

- [ ] EC Platform の例（`examples/ja/ec-platform/02.5-clients.krs`）をプレビューで開いたとき、actor → client → service の流れが視覚的に綺麗に並び、エッジが他のノードカードを貫通しない

  > 🧑 Manual — `pnpm dev` でアプリを起動し、`examples/ja/ec-platform/02.5-clients.krs` を読み込んで目視確認する。

## 補足

- `desired > current` のガードにより、本変更は user を **下げる方向のみ**作用する。既存の図で「user がティア 0 にいた」ものはすべて維持される（target が同じ row 1 にある一般的なケース）。
- 多段 client（client → client → service）や、user が複数の異なる深さを指す場合の見た目検証は別途必要だが、現時点では稀なので out of scope とする。
