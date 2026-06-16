# AT: Orthogonal edge routing avoids intermediate node cards

- **日付**: 2026-04-29
- **関連 Issue**: [#968](https://github.com/kompiro/karasu/issues/968)（親: [#966](https://github.com/kompiro/karasu/issues/966)）
- **対象ファイル**:
  - `packages/core/src/renderer/edge-routing-channels.ts`（新規）
  - `packages/core/src/renderer/edge-routing.ts`
  - `packages/core/src/renderer/layout.ts`
- **設計**: `docs/design/auto-layout-edge-routing-orthogonal.md`

## 受け入れ条件

- [x] skip-layer エッジ（`|fromLayer - toLayer| >= 2`）の直線が中間ノードのバウンディングボックスを横断する場合、L 字型の直交経路に置き換えられる
  > ✅ Automated — `packages/core/src/renderer/edge-routing-channels.test.ts` › `routes a skip-layer edge around an obstructing intermediate node`

- [x] 直線が中間ノードを横断しない skip-layer エッジは直線のまま残る
  > ✅ Automated — `packages/core/src/renderer/edge-routing-channels.test.ts` › `leaves an unobstructed straight edge alone`

- [x] ghost edge と cyclic edge は対象外（直線のまま）
  > ✅ Automated — `packages/core/src/renderer/edge-routing-channels.test.ts` › `skips ghost edges` / `skips cyclic edges`

- [x] EC Platform 風の構造（actor が中間 client を介さず深い service に到達）で `Admin → ECSite` のエッジが MobileApp のバウンディングボックスを横断しない
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `adds waypoints to a skip-layer edge whose straight line crosses an intermediate node`

- [x] 既存の図（same-layer / adjacent-layer のみ）の SVG 出力に regression が無い
  > ✅ Automated — `packages/core/src/` の全 snapshot/unit テストが変更なしで通過することで担保（waypoints が空のときは従来の `<line>` レンダリングを維持）

- [ ] EC Platform の例を `pnpm dev` のプレビューで開き、`Admin → ECSite` のエッジが目視で MobileApp カードを横断していないこと、エッジ全体が L 字に折れて見やすくなっていることを確認する
  > 🧑 Manual — Preview URL（`https://feat-edge-routing-impl.karasu.pages.dev`）または `pnpm dev` でローカル起動して `examples/ja/ec-platform/02.5-clients.krs` を読み込み、視覚的に確認する。

## スコープ外（follow-up）

- ポート分散・チャネルレーン分散による fan-out ラベル重なり解消（Phase 3）
- ghost domain edge / cyclic edge の直交化
- 横方向 layered モード対応
