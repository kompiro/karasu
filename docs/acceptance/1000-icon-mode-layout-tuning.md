# AT: Auto-layout gap tuning for Icon display mode

- **日付**: 2026-04-29
- **関連 Issue**: [#1000](https://github.com/kompiro/karasu/issues/1000)
- **対象ファイル**:
  - `packages/core/src/renderer/layout.ts`（`getLayoutConstants` + 各 layout
    関数で displayMode 別 gap を反映）
  - `packages/core/src/renderer/layout.test.ts`（icon-mode gap の assertion
    を追加）
- **設計ドキュメント**:
  [ADR-20260429-05](../adr/20260429-05-icon-mode-layout-gap-tuning.md)

## 受け入れ条件

### gap 定数の displayMode 別切替

- [x] `displayMode = "icon"` で同じレイヤ内の隣接ノード間 gap が 36px になる
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `uses ICON_NODE_GAP (36) between sibling nodes within the same layer`

- [x] `displayMode = "icon"` で隣接レイヤ間の縦 gap が 80px になる
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `uses ICON_LAYER_GAP (80) between layers in icon mode`

- [x] `displayMode = "shape"` のときは従来の 60px gap が維持される（後方互換）
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `retains shape-mode gaps (60) when displayMode is shape`

- [x] icon カードの寸法（160×56 / 160×100）は変わらない
  > ✅ Automated — 既存 `layout.test.ts` › `uses 160×56 ...` / `uses 160×100 ...`

### 既存テストへの非リグレッション

- [x] core パッケージの全テストが通過する
  > ✅ Automated — `pnpm --filter @karasu-tools/core test`（1103 件 / 45 ファイル）

- [x] lint・typecheck・format がすべて通過する
  > ✅ Automated — `pnpm run lint` / `pnpm run typecheck` / `pnpm run format:check`

### 手動検証

- [ ] **Preview UI で `getting-started` を開き、Display mode を Icon に切替えたとき、shape mode と比較してアイコンが詰まって配置されているのを目視確認する。**

  > 検証方法: `pnpm --filter @karasu-tools/app dev` で起動し、Project selector から `getting-started` を選ぶ。Display mode toggle で Icon に切替え、shape mode 表示と並べて以下を確認する:
  > - 同じレイヤ内のアイコン間の余白が以前より狭く（36px ≒ アイコン幅の 22%）見える
  > - レイヤ間の縦間隔が以前より縮まって見える（説明なしカード 56px 高 + LAYER_GAP 80）
  > - sub-row 折返しが以前と同じ位置（または 1 つ早く）に発生する
  > - skip-layer 直交エッジ（ADR-20260429-01）の L 字経路が縦 80px のチャネルに収まり、ノード矩形を貫通しない
  > - LANE_BAND（18px）でレーン分散される多重エッジが LAYER_GAP=80 の余裕に収まり、ラベル・arrowhead が重ならない

  > Manual rationale: 自動レイアウトの数値変更は単体テストで assert できるが、「アイコンが寄って見える / typology が読み取りやすい」「edge routing が破綻していない」は SVG 上の最終的な見えに依存するため目視確認が必要。Issue #1000 の "Render representative diagrams in Icon mode and capture screenshots" タスクに直接対応する。

- [ ] **`ec-platform` を Icon mode で開き、6 ノード以上のレイヤで `MAX_LAYER_WIDTH=1040` の sub-row 折返しが意図どおりに発生することを目視確認する。**

  > 検証方法: 同じく Preview UI で `ec-platform` を選び Icon mode に切替える。Service が 6 件以上同レイヤに並ぶケース（5 件で 944px、6 件で 1140px > 1040 → 折返し）で 6 件目以降が次の sub-row に降りていること、上下の sub-row 間に LAYER_GAP=80 が適用されていることを確認する。

  > Manual rationale: 折返し閾値は数値テストで境界を assert できるが、実際の代表例で「読みやすい場所」で折り返されているかは別問題。本 AT のスコープでは fixed-N 折返しに変更しない方針を取ったので、現行の width-based 折返しで違和感がないかを確認したい（違和感が強ければ design doc の続編で再検討する）。
