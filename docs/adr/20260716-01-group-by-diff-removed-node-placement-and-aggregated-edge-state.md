---
id: ADR-20260716-01
title: 差分モードの Group by で除去ノードを元の team フレームに残し、集約エッジの diff state を再導出する（#1886）
status: accepted
date: 2026-07-16
topic: renderer
related_to: [ADR-20260711-03]
scope:
  concerns: []
---

# ADR-20260716-01: 差分モードの Group by で除去ノードを元の team フレームに残し、集約エッジの diff state を再導出する（#1886）

- **日付**: 2026-07-16
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1886](https://github.com/kompiro/karasu/issues/1886)（親 epic [#1817](https://github.com/kompiro/karasu/issues/1817) comprehension）
  - 前提 ADR: [ADR-20260711-03](20260711-03-system-view-group-by-team.md)（P2a: team 軸グループ化。本 ADR はその compare/diff モードでの噛み合わせ修正）
  - 前段: [#1873](https://github.com/kompiro/karasu/issues/1873)（PR #1883、P2a を compare/diff で有効化）— そのレビューで本 2 課題が切り出された
  - 実装 PR: #1902（core: `index.ts` マージ ownerIndex + `group-collapse.ts` diff-state fold）
  - 設計（本 ADR に集約し削除）: `docs/design/system-view-grouping.md` § 「差分モードの grouping」
  - TPL: [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md)（再配置で全要素ちょうど一度 + 参照エッジ端点保持）, [TPL-20260712-01](../test-perspectives/TPL-20260712-01-rekey-transform-preserves-per-element-decoration.md)（id を書き換える集約変換は per-要素の装飾を再導出せよ — 本 PR で新設）
  - コード: `packages/core/src/index.ts`（`compileSystemDiff`）/ `packages/core/src/renderer/group-collapse.ts`

## 背景

P2a（ADR-20260711-03）の Group by: team を **compare/diff モード**（`compileSystemDiff`）で有効化した #1873 のレビューで、grouping と diff の噛み合わせに 2 つの誤表示が残った（#1886）。原因はどちらも、`compileSystemDiff` が grouping 軸を **after 側だけの `ownerIndex`** で render に渡していること（`diffed.slice` は before ∪ after の和集合なので、before にしか無いノード/エッジは after の ownerIndex で所属を解決できない）:

1. **除去された team 所有ノードが末尾の非 group 帯に落ちる。** before で team が所有し after で削除された service は、after ownerIndex に無いため grouping が `null` を返し、全 team フレームの下の未 group 帯に `removed` で置かれる。「team X がこの service を失った」ではなく孤立した removed ボックスに見える。
2. **畳んだ group の集約エッジが per-edge diff state を失う。** team を畳むと cross-group エッジは `<Team> (N)` stub に再ターゲットされる（drop しないのは正しい）が、`edgeDiffState` は**元の端点 id** でキーされ、描画される stub エッジは stub id でキーされるため、再ターゲット後のエッジは `data-diff-state` 装飾なしで描かれる。畳むと追加/削除された cross-team 依存が不可視になる。さらに 1 本の stub が複数の元エッジ（別々の diff state を持ちうる）を集約するので、集約後の state をどう定めるかという意味論の問いもある。

## 決定

### 決定 1 — 配置: after ownerIndex を基点に、除去ノードだけ before 所属を backfill

diff 用の grouping 軸を、**after の `ownerIndex` を基点**にしつつ、**diff 状態が `removed` のノードにだけ before 側の所属を backfill** したものに切り替える（`compileSystemDiff` で `new Map(after.ownerIndex)` に対し `diffed.nodes` を走査して `state === "removed"` かつ未所属の node にだけ before の team を set）。render / layout / grouping 側は不変（軸は既に単一 `Map<string,string>` 契約）。

- 除去ノード（before-only）は**かつての team フレーム内**に `removed` で収まる。畳んだ `(N)` カウントも除去メンバーを数える。
- 生存ノードは常に **after が正**。所属替え（A→B）は after の team、**所属剥奪（`owns` を消したが node は残る = A→無所属）も after どおり無所属**。既定（非 diff）ビューとの一貫性を保つ。
- **副次**: team ごと after で消滅した場合、全メンバーが `removed` で before 所属を backfill され、**全メンバー removed の team X フレーム**が描かれる（「team X ごと除去された」の正しい表現。AT で固定）。

### 決定 2 — 集約 stub エッジの diff state: 単一なら踏襲・混在なら `changed`

畳んだ group の stub エッジが担う diff state を集約元から導出し、**stub エッジのキー（`${from}->${to}`）で引けるよう re-key** する（`collapseGroups` に diff-state fold を追い込み、`compileSystemDiff` が再キー済み map を元の `edgeDiffState` に上書きマージして render に渡す。非畳み込みエッジは元キーのままで不変）。

- 集約元が**全て同一 state**（すべて added / removed / unchanged）ならその state を踏襲。
- 集約元が**混在**なら **`changed`** を付与（「この依存関係は変化した」と読める）。`changed` は新設値ではなく既存 `DiffState` の一員で、system view には既に**複数 domain エッジを 1 本に集約したエッジに `changed` を使う前例**があり一貫する。
- **kind をまたぐ集約**: render の diff lookup は `${from}->${to}`（kind なし）で、既存 `edgeDiffState` 契約も kind を区別しない。よって re-key も kind なしに揃え、同一ペアの sync/async 2 本は 1 スロットを共有して**両 kind をまとめて 1 回 fold** する（sync だけ added・async だけ removed でも「混在 → `changed`」）。kind 別 diff-state は既存契約の変更になるため範囲外（必要なら別 Issue）。

## 理由

- **`removed` 条件の backfill** が、素朴な before ∪ after union（after 勝ち）の欠陥を避ける唯一の形。union だと「removed した node」と「`owns` だけ消した生存 node」がどちらも「before にあり after に無い」形になり区別できず、後者に**古い所属が leak** する。`ownerIndex` は grouped フレームだけでなく非 grouped diff の service カードの team バッジにも使われるため、leak は既定ビューにも波及する。`removed` 状態を条件にすることで、剥奪ケースを after どおり無所属に保ちつつ除去ノードだけをフレームに戻す。
- **混在 → `changed`** は「事実を述べ判断は読み手に委ねる」karasu 方針と整合し、既存の集約 `changed` 語彙とも一貫する。
- render/layout 非改変（軸は単一 map 契約）・非畳み込みエッジ不変で、**既定ビューと非 diff 挙動への波及をゼロ**にできる。

## 却下した案

- **集約 diff state を「単一なら踏襲・混在は `unchanged`」** — 追加と削除が混ざると変化が消え、#1886 の「畳むと変化が不可視」がそのまま残る。
- **集約 diff state を「非 unchanged 優先（`added` > `removed`）」** — 変化は見えるが、追加と削除が同居すると片方に誤って寄せる。`changed` の方が「混ざっている」を正しく述べる。
- **配置を素朴な before ∪ after union（after 勝ち）で解く** — 上記のとおり所属剥奪ケースで古い所属が leak し、既定ビューにも波及する。

## 補足: 正しさの柵とスコープ外

- `group-by-diff.test.ts` の既存 pin（TPL-20260624-02 全域性: removed ノードちょうど一度・cross-group エッジ再ターゲットで非 drop）を維持しつつ、理想の見え方を追加 assert する: 除去ノードが末尾帯でなく**元 team フレーム内**（`data-container-id="__group_<team>__"` の内側）に `removed` で描かれる / team ごと除去で全 removed メンバーの team フレームが描かれる / 集約 stub エッジが単一 state 踏襲・混在 `changed`（`data-diff-state` で assert）/ 退化ケース（before だけ・after だけ・両方所属）で破綻しない。
- 本課題は **id を書き換える集約変換が、元 id にキーされた per-要素の装飾（diff state）を落とす**という、TPL-20260624-02（端点＝トポロジ保持）がカバーしない失敗クラスなので、proactive [TPL-20260712-01](../test-perspectives/TPL-20260712-01-rekey-transform-preserves-per-element-decoration.md) を同 PR で新設した。
- **スコープ外**: `changed` の視覚表現の新設（既存 diff スタイルを流用）/ deploy diff（`compileDeployDiff`）への同種修正（deploy に team grouping 軸が無い）。必要になれば別 Issue。
