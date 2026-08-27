---
id: TPL-1761
title: "system-view で external をサイドに置く配置は、他 kind の配置帯を侵さず決定的で、column override を尊重する"
status: active
applicable_to:
  - "ノードを kind 別の帯（tier / row / side column）に配置する forced layout の post-pass"
  - "auto-layout のデフォルト配置を style ヒントで override させる仕組み"
known_consumers:
  - system-view-external-on-sides
date: 2026-06-24
discovered_from:
  - root_cause_adr: "ADR-1724"
  - root_cause_file: "packages/core/src/renderer/layout.ts"
  - issue: "#2384"
  - issue: "#2394"
  - issue: "#2625"
related_to: [TPL-1736, TPL-1001]
topic: renderer
scope:
  packages: [core]
---

# TPL-1761: system-view で external をサイドに置く配置は、他 kind の配置帯を侵さず決定的で、column override を尊重する

## 観点

system view では `[external]` サービスを左右のサイド列に配置する（#1728）。この種の「kind 別に別の帯へ動かす」配置 post-pass は、次を必ず満たすこと:

1. **他帯を侵さない**: external は side（または overflow 時のサイド縦積み）にのみ置かれ、actor / client / service / infra の配置帯（行・x スパン）を侵食しない。infra は従来どおり service の下の行に残る。
2. **決定的**: 自動サイド振り分け（consuming-hub barycenter）は宣言順に対して安定で、入力が同じなら出力も同じ。tie（同 barycenter / 同 x）は宣言順で安定化する。
3. **override 可能**: 作者の `column: left/right` ヒントが自動割り当てより優先される。
4. **kind の境界を保つ**: infra kind（`database`/`queue`/`storage`）は `[external]` タグの有無に関わらずサイドへ移動しない（[ADR-1724] の境界ルール）。
5. **内側アンカー**: サイド external へのエッジは external の内側の辺（左サイド→右辺 / 右サイド→左辺）に着地し、矢印頂点が内向きになる。tier index ベースの上下アンカーに引っ張られて上辺/下辺に着地しないこと。
6. **gate**: サイド化は適用すると益のある条件（cross-hub 交差が生じる ＝ external エッジを持つ hub が ≥2）でのみ行う。単純な図（単一ハブ）は従来配置を維持し、横に無駄に広げない。明示ヒントは gate を迂回する。
7. **回帰なし**: external 配置の変更が、infra/service の tier 配置（#1724 / #823）や #974 の infra pull-up を壊さない。
8. **順位ベースの閾値は必ず分割する — 分割してよい入力かを別に判定する**: 自動振り分けの比較対象を、振り分けたい集合そのものから導出した統計量（median 等）に取ると、閾値は必ず集合の内側に落ちる。`<= median` は要素の実際の位置に関わらず 1〜n-1 件を片側に残す、つまり**分割が常に起きる**。分けるべき入力かどうかは、集合の**外**にある基準（content centre など配置の文脈から決まる座標）で別途判定する。

   karasu の external サイド振り分けはこの形を採る（#2394）: 消費ハブの重心が content centre を**跨ぐ**ときだけ median 分割（別ハブのファンを左右に分けて cross-hub 交差を減らす [ADR-1728] の意図）、跨がないなら自動割り当て分を**まとめて**ハブのある側へ置く。重心が同値に潰れる退化入力（external 1 件、または同一ハブ集合の共有）は「跨がない」の極限で、同じ分岐に乗る（#2384）。

   **分割しない側を「別の閾値との比較」で書かないこと。** 片側判定を content centre との比較に置き換えると、ちょうど centre に載った要素が `<=` で反対側に落ち、同じ stranding が 1 段下で再発する（#2507 のレビューで検出）。分けないと決めたらグループ単位で割り当てる。

   検証は 4 通りを揃えて行う: 跨ぐ入力で左右に分かれること、片側入力で全件がハブ側に寄ること、**最寄りの重心が境界とちょうど一致する片側入力でも分割されないこと**、退化入力でハブ側に寄ること。片側入力のケースだけが欠けると、順位ベース閾値への差し戻しがテストを素通りする。

9. **固定の幅・高さを N 等分しない — 最小クリアランスを持たせ、足りなければ帯の外へ伸ばす**: サイド列は
   コンテンツの縦スパンを `count + 1` 等分して各カードを載せていた。**固定の広がりを N 等分する形は
   N が増えると静かに壊れる**: 刻み幅がカード高を下回った瞬間、列は「入りきらない」ことを見せずに
   カードを重ね始める（#2625 — dify のルートビューで external 14 件が 25px ずつ重なった）。
   等分は「入りきる限り」の答えとして残してよいが、**隣接ペアが最小クリアランスを割るなら、
   クリアランスで積み直して帯の外へはみ出させる**。はみ出した分はフレーム側が追う（失敗モード 1 と対）。

   同じ形は edge のレーン割り当てにもあった（`LANE_BAND = 18` を `N + 1` 等分し、31 本で 0.56px 間隔。
   #2598）。**分配の検証は「入る前提の件数」ではなく、隣接ペアの実測ギャップで行う** — 件数を増やした
   ときに初めて壊れるので、少数件のテストだけでは緑のまま通る。

## 想定される失敗モード

- external をサイドへ動かす post-pass が container の bbox を拡張し忘れ、ノードが図の外にはみ出す / クリップされる。
- サイド列の配置が固定スパンの N 等分で書かれており、件数が増えるとカードが**重なる**。図は出力され、
  テストも通り、目で見て初めて分かる（#2625）。逆に、はみ出しを許した結果フレームが追随せず、
  自分の system frame の外にカードが描かれる。
- 自動振り分けが `Math.random` 的・非決定的になり、同じ `.krs` で図が毎回変わる（スナップショット flake）。
- `column` override が無視され、作者が左右を制御できない。
- infra kind が誤ってサイドへ移動し、`database [external]` が infra 行から消える（境界ルール違反）。
- external 配置変更が #1724 の tier テストや #974 pull-up を退行させる（回帰）。
- 自動振り分けの閾値を振り分け対象の集合そのものから取っており、要素 1 件（または全要素同値）で閾値が各要素と一致し、tie-break が全件を一方の側へ寄せる。ヒューリスティックの入力（consuming-hub の位置）が結果に効かなくなり、作者が `column` で補うしかなくなる（#2384）。
- displayMode（shape / icon）でサイド配置が成立しない（[TPL-1001]）。

## チェックリスト

kind 別の帯へノードを動かす配置 post-pass を追加・変更する際:

- [ ] 動かした kind 以外（actor/client/service/infra）の行・x スパンが不変であることを確認した
- [ ] 自動配置が決定的（宣言順安定・tie-break 明示）であることを確認した
- [ ] 自動振り分けの閾値が分類対象の集合そのものから導出されていないことを確認した。導出している場合は、**閾値が退化する入力**（要素 1 件、全要素同値）を列挙し、そのそれぞれで入力（barycenter 等）が結果に効くことをテストで示した。「同値」の判定は座標の平均に対して bit 一致ではなく許容誤差で行う
- [ ] style ヒント（`column` 等）による override が効くことを確認した
- [ ] 列の分配が固定の広がりの N 等分になっていないことを確認した。**隣接ペアの実測ギャップ**を
      複数の件数（入りきる件数 / 入りきらない件数の両方）で assert し、重なりが 0 であることを示した
- [ ] 入りきらない列がフレームと canvas の内側に収まることを確認した（はみ出した分だけフレームが伸び、
      すでに収まっている図のフレームは動かない）
- [ ] 関連 kind の境界ルール（infra は常に内側 = [ADR-1724]）が保たれることを確認した
- [ ] サイド external へのエッジが内側の辺に着地し矢印が内向きであることを確認した（tier index ベースの上下アンカーに上書きが効いている）
- [ ] サイド化の gate（益のある条件でのみ適用）が効き、単純な図が無駄に広がらないことを確認した
- [ ] 既存の tier 配置テスト（#1724 / #823）と pull-up テスト（#974）が無変更で通ることを確認した
- [ ] container の bbox がサイド列を含むよう拡張され、はみ出し / クリップが無いことを確認した

## 既知の対処パターン

- **edge 計算前に配置を確定する**: external をサイドへ動かす post-pass は `computeLayoutEdges` の前に実行し、エッジアンカーが相対位置から再選択されるようにする（`computeEdgePoints`）。これで service→external が自動で水平アンカーになる。
- **consuming-hub barycenter で決定的に振り分け**: external を呼ぶハブの x 重心の median で左右分割、同側内は hub-x → y → 宣言順で安定ソート（`placeExternalServicesOnSides`）。
- **system container だけを拡張**: サイド列を含むよう、system kind の container のみ bbox を広げる（infra container 等は広げない）。

## 関連テスト

- `packages/core/src/renderer/layout.test.ts`:
  - `keeps infra in a row below services and moves external to a side column (#1728)`
  - `assigns each external to the side of its consuming hub (#1728)`
  - `honors column:left/right to override the auto side assignment (#1728)`
  - `puts a lone external on the side its consumers are on (#2384)` / `keeps a lone external left when its consumers are on the left (#2384)` / `puts externals that share one right-side hub set on the right (#2384)` / `breaks a centred lone external toward the left (#2384)`（退化した median のガード）
  - `keeps both externals right when every consuming hub is right of centre (#2394)` / `keeps both externals left when every consuming hub is left of centre (#2394)`（片側入力）
  - `keeps a hub sitting exactly on the centre with its one-sided group (#2394)`（境界一致でも分割しない）
  - `still splits the sides when the consuming hubs straddle the centre (#2394)`（跨ぐ入力で分割が残ること）
  - `moves external to a side column even without user/client (#1728)`
  - `keeps a database [external] on the infra row, not the external row (kind wins over tag) (#1724)`（境界ルール回帰ガード）
  - `propagates infra pull-up through a dep-on-dep chain … (Issue #974)`（pull-up 回帰ガード）

## 派生元 spec / ADR

- [ADR-1724](../adr/1724-system-view-infra-external-tier-split.md) — infra/external ティア分割（本 TPL の external 配置はこれを refine する #1728 由来）
- `docs/spec/style.md` の `column` 節（external services: `column` picks the side）
- [ADR-1728](../adr/1728-external-on-sides-layout.md) — system-view の external サイド配置（#1728。Design Doc から昇格）
