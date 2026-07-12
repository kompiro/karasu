# AT-1886: Group by team（diff モード）— 除去ノード配置と集約エッジ diff state

- **日付**: 2026-07-12
- **Issue**: #1886（follow-up of #1873 / ADR-20260711-03）
- **PR**: (この PR)
- **関連 ADR**: [ADR-20260711-03](../adr/20260711-03-system-view-group-by-team.md)（Group by: team P2a）
- **設計**: `docs/design/system-view-grouping.md` §「差分モードの grouping — 除去ノード配置と集約エッジ diff state（#1886）」
- **Related TPLs**:
  - [TPL-20260712-01](../test-perspectives/TPL-20260712-01-rekey-transform-preserves-per-element-decoration.md)（id を書き換える集約変換は元 id にキーされた装飾を再導出する）
  - [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md)（全域性・端点保持）
- **対象**: `packages/core/src/index.ts`（`compileSystemDiff`）/ `packages/core/src/renderer/group-collapse.ts` / `layout.ts` / `svg-renderer.ts`

## 概要

diff モードの Group by: team は grouping 軸に **after 側だけの `ownerIndex`** を使っていた（AT-1873 の
既知制約）。`diffed.slice` は before ∪ after の和集合なので、before にしか無い（= after で削除された）
ノードは所属チームを解決できず末尾帯に落ち、team を畳むと集約 stub エッジが per-edge の diff 装飾を失った。

本 AT は #1886 の 2 決定を fence する:

1. **配置** — grouping 軸を before ∪ after のマージ ownerIndex（after 勝ち）に切替。除去ノードが former
   team フレーム内に `removed` で収まり、team ごと消滅すると全 removed の team フレームを描く。
2. **集約 stub エッジの diff state** — 畳んだ team の再ターゲット stub エッジに diff 装飾を stub id で
   再キーして持たせる。集約元が単一 state なら踏襲、混在なら `changed`。

## 受け入れ条件

### AC-1: 除去ノードは former team フレーム内に配置される

> ✅ Automated by `packages/core/src/renderer/group-by-diff.test.ts` (suite-wide) — "places a removed team-owned node inside its former team frame in diff mode (#1886)"

- [x] before で team 所有・after で削除されたノードが、末尾帯ではなく `__group_<team>__` フレームの
      矩形内（中心座標が枠内）に `data-diff-state="removed"` で描かれる
- [x] 全域性は維持（ちょうど一度描画）— TPL-20260624-02
- [x] 別チーム所有ノードは当該フレーム内に入らない（配置の混線がない）

### AC-2: team ごと消滅すると全 removed の team フレームを描く

> ✅ Automated by `packages/core/src/renderer/group-by-diff.test.ts` (suite-wide) — "draws an all-removed team frame when a team disappears wholesale (#1886)"

- [x] before に居た team が after で消滅しても `__group_<team>__` フレームが描かれ、その全 removed
      メンバーがフレーム内に収まる

### AC-3: 集約 stub エッジは diff state を保持する（単一踏襲・混在 changed）

> ✅ Automated by `packages/core/src/renderer/group-by-diff.test.ts` (suite-wide) — "keeps single-state…" / "folds mixed-state…" / "carries diff state on both kinds…"

- [x] 単一 state の cross-group エッジを畳んだ stub エッジは元 state（例 `added`）を `data-diff-state`
      に保持する
- [x] 追加＋不変が混在して 1 本の stub エッジに畳まれると `data-diff-state="changed"`
- [x] 同一 stub ペア間の sync/async 2 本（kind-less な diff lookup を共有）は両方とも同じ diff 装飾を
      持つ（片方だけ bare にならない）— 設計 §「kind をまたぐ集約の扱い」の退化ケース

### AC-4: 非 collapse / 非 diff は不変（回帰なし）

> ✅ Automated by `packages/core/src/renderer/group-by-diff.test.ts` (suite-wide) — "does not draw frames when groupBy is omitted"; plus the core snapshot suite (byte-identical non-collapse output)

- [x] `groupBy` 未指定・collapse なしの diff 出力は従来どおり（`foldedEdgeDiffState` は空で
      `svg-renderer` の diff lookup は byte-identical）

### AC-5: 手動（描画の目視確認）

- [ ] **手動**: app で org 宣言を持つモデルを開き、team 所有 service を 1 つ削除した版と compare →
      system view の Group by を Team に切替。削除した service が**旧チームのフレーム内**に removed 装飾
      （赤系）で表示される。そのチームを ⊖ で畳むと、他チームからの追加/削除された依存が stub エッジの
      色（added/removed/changed）として残る。None に戻すと従来の diff 表示。
