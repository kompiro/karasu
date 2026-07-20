# AT-1873: Group by team — compare / diff モードでも有効化する

- **日付**: 2026-07-11
- **Issue**: #1873（follow-up of #1858 / ADR-1858。Gap 1）
- **PR**: (この PR)
- **関連 ADR**: [ADR-1858](../adr/1858-system-view-group-by-team.md)（Group by: team P2a）
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
- [x] diff で追加されたノードが team に所有される場合も grouped で描かれ、`data-diff-state` 装飾を保つ（全域性・TPL-20260624-02）
- [x] `groupBy` 未指定は従来の diff 出力のまま（フレームなし・opt-in）
- [x] `collapsedGroups` を渡すと diff モードでも team が `<Team> (N)` stub に畳まれ、cross-group エッジは stub に再ターゲット（drop しない）
- [x] `interactive` が描く ⊖ category コントロールが no-op にならないよう、`collapsedCategories` も diff の render pass に転送する

### AC-2: app — compare モードのゲート緩和

> ✅ Automated by `packages/app/src/hooks/useAppViews.test.tsx` (suite-wide)

- [x] `groupByAvailable` は `hasOrgDiagram` のみに依存し、compare モードでも真になる
- [x] compare 中に「Group by: Team」を選ぶと `compileSystemDiff` が `groupBy` 付きで再コンパイルされる
- [x] `useSystemView` の diff-compile 経路が `groupBy` / `collapsedGroups` / `collapsedCategories` / `interactive` を転送する

### 既知の制約（follow-up #1886）— ✅ 解決済み（[AT-1886](1886-group-by-diff-placement-and-edge-state.md)）

> #1886 で before ∪ after のマージ ownerIndex（after 勝ち）と集約 stub エッジの diff-state 再キーを
> 実装し、下記 2 点は解消した。以下は当時の制約の記録。


diff の grouping は **after-side の `ownerIndex`** のみを軸にする。before にしか存在しない要素は所属チームを解決できないため:

- before でチーム所有だったが after で**削除**されたノードは、旧チームのフレーム内ではなく末尾の un-grouped 帯に置かれる（全域性は保つ＝ちょうど一度描画・`removed` 状態を保持）
- team を折り畳んだとき、集約された cross-group stub エッジは per-edge の `data-diff-state` を持たない

before ∪ after の ownerIndex 統合と集約エッジの diff 状態セマンティクスは #1886 で扱う。上記 AC-1 のテストは「今日成立する保証」（totality・再ターゲット）のみを fence する。

### AC-3: 手動（描画の目視確認）

- [ ] **手動**: app で org 宣言を持つモデルを開き compare（別ファイル/前バージョン）を有効化 →
      system view の「Group by」を Team に切替 → diff 上に team フレームが出て、追加/削除ノードの
      diff 装飾がフレーム内で保たれる。None に戻すと従来の diff 表示に戻る
