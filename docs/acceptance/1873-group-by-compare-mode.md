# AT-1873: Group by team — compare / diff モードでも有効化する

- **日付**: 2026-07-11
- **Issue**: #1873（follow-up of #1858 / ADR-20260711-03。Gap 1）
- **PR**: (この PR)
- **関連 ADR**: [ADR-20260711-03](../adr/20260711-03-system-view-group-by-team.md)（Group by: team P2a）
- **Related TPLs**: [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md)（要素を別グループへ再配置 → 全要素ちょうど一度配置 + 参照エッジ端点保持）
- **対象**: `packages/core/src/index.ts`（`compileSystemDiff`） / `packages/app/src/hooks/useSystemView.ts` / `packages/app/src/hooks/useAppViews.ts`

## 概要

Group by: team（#1858）は単一プロジェクトの system view のみで有効で、compare（diff）モードでは
`groupByAvailable` ゲートが `effCompareEntryPath === null` を要求するためセレクタが消えていた。
本 AT は `compileSystemDiff` に `groupBy` / `collapsedGroups` / `interactive` を通し、diff の
after-slice を team フレームで囲めるようにする。Gap 2（Show All Layers / export の非グループ）は
#1879 で別途扱う。

## 受け入れ条件

### AC-1: core — diff への group-by 配線

> ✅ Automated by `packages/core/src/renderer/group-by-diff.test.ts` (suite-wide)

- [x] `compileSystemDiff({ groupBy: "team" })` は after-slice の `ownerIndex` を軸に team 境界フレーム
      （`data-container-id="__group_<team>__"` / `data-group="true"`）を出す
- [x] diff で追加されたノードが team に所有される場合も grouped で描かれる（全域性・TPL-20260624-02）
- [x] `groupBy` 未指定は従来の diff 出力のまま（フレームなし・opt-in）
- [x] `collapsedGroups` を渡すと diff モードでも team が `<Team> (N)` stub に畳まれる

### AC-2: app — compare モードのゲート緩和

> ✅ Automated by `packages/app/src/hooks/useAppViews.test.tsx` (suite-wide)

- [x] `groupByAvailable` は `hasOrgDiagram` のみに依存し、compare モードでも真になる
- [x] compare 中に「Group by: Team」を選ぶと `compileSystemDiff` が `groupBy` 付きで再コンパイルされる
- [x] `useSystemView` の diff-compile 経路が `groupBy` / `collapsedGroups` / `interactive` を転送する

### AC-3: 手動（描画の目視確認）

- [ ] **手動**: app で org 宣言を持つモデルを開き compare（別ファイル/前バージョン）を有効化 →
      system view の「Group by」を Team に切替 → diff 上に team フレームが出て、追加/削除ノードの
      diff 装飾がフレーム内で保たれる。None に戻すと従来の diff 表示に戻る
