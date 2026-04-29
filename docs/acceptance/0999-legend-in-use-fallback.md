# AT: Legend ref fallback for in-use-but-unstyled targets

- **日付**: 2026-04-29
- **関連 Issue**: [#999](https://github.com/kompiro/issues/999)
- **対象ファイル**:
  - `packages/core/src/legend/usage.ts`（新規）
  - `packages/core/src/renderer/svg-builder.ts`
  - `packages/core/src/renderer/svg-renderer.ts`
  - `packages/core/src/renderer/org-renderer.ts`
  - `packages/core/src/index.ts`
- **関連 AT**: [AT-0833](./0833-diagram-legend.md)（legend 構文の本体）

## 受け入れ条件

- [x] 実ノードに付与されているタグ／アノテーションを参照する `ref` は、`.krs.style` に painting rule が無くてもフォールバックの swatch（`#9CA3AF`）と共に legend に表示される
  > ✅ Automated — `packages/core/src/renderer/legend-footer.test.ts` › `emits a fallback swatch for a ref whose tag is in use but unstyled (Issue #999)`

- [x] 実ノードにも `.krs.style` にも存在しない `ref`（例: `@gone`）は従来通り legend から省略される（unresolved-ref drop の動作維持）
  > ✅ Automated — `packages/core/src/renderer/legend-footer.test.ts` › `still drops a ref whose target is unused (regression check)`

- [x] 既存の painting rule を持つ `ref`（例: `[external]`）は従来通り該当の `background-color` / `badge-color` が swatch に使われる
  > ✅ Automated — `packages/core/src/renderer/legend-footer.test.ts` › 既存の `resolves a ref [tag] through the builtin style sheet` 系テストが回帰なしで通過

- [ ] Getting Started 例（`@example getting-started`）の preview で `[human]` legend エントリが表示される
  > 🧑 Manual — Preview URL（`https://fix-legend-human-annotation.karasu.pages.dev`）または `pnpm dev` でローカル起動して凡例の `人間ユーザー` 行が swatch + ラベル付きで描画されることを確認する。

## 補足

- 本変更前は resolver と renderer で「ref が resolve したか」の判定が食い違っていた:
  - resolver は「アノテーションが実ノードに付いている」だけで resolved 扱い → 警告無し。
  - renderer は painting rule が無いと `null` を返し、entry を黙って drop。
  結果として `[human]` のような **意味的にだけ存在するアノテーション** が legend から消えていた。
- 本 PR は両者の判定を `packages/core/src/legend/usage.ts` に集約して、resolver と renderer が同じ「使われている」定義を共有するようにする。
- フォールバック色 `#9CA3AF`（neutral gray）は `tags-annotations.md` の「No effect on default style」という従来の方針を尊重しつつ、legend だけは中立的に可視化する。
