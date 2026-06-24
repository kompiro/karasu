---
id: TPL-20260624-04
title: "system-view で external をサイドに置く配置は、他 kind の配置帯を侵さず決定的で、column override を尊重する"
status: active
applicable_to:
  - "ノードを kind 別の帯（tier / row / side column）に配置する forced layout の post-pass"
  - "auto-layout のデフォルト配置を style ヒントで override させる仕組み"
known_consumers:
  - system-view-external-on-sides
date: 2026-06-24
discovered_from:
  - root_cause_adr: "ADR-20260623-06"
  - root_cause_file: "packages/core/src/renderer/layout.ts"
related_to: [TPL-20260623-04, TPL-20260510-06]
topic: renderer
scope:
  packages: [core]
---

# TPL-20260624-04: system-view で external をサイドに置く配置は、他 kind の配置帯を侵さず決定的で、column override を尊重する

## 観点

system view では `[external]` サービスを左右のサイド列に配置する（#1728）。この種の「kind 別に別の帯へ動かす」配置 post-pass は、次を必ず満たすこと:

1. **他帯を侵さない**: external は side（または overflow 時のサイド縦積み）にのみ置かれ、actor / client / service / infra の配置帯（行・x スパン）を侵食しない。infra は従来どおり service の下の行に残る。
2. **決定的**: 自動サイド振り分け（consuming-hub barycenter）は宣言順に対して安定で、入力が同じなら出力も同じ。tie（同 barycenter / 同 x）は宣言順で安定化する。
3. **override 可能**: 作者の `column: left/right` ヒントが自動割り当てより優先される。
4. **kind の境界を保つ**: infra kind（`database`/`queue`/`storage`）は `[external]` タグの有無に関わらずサイドへ移動しない（[ADR-20260623-06] の境界ルール）。
5. **内側アンカー**: サイド external へのエッジは external の内側の辺（左サイド→右辺 / 右サイド→左辺）に着地し、矢印頂点が内向きになる。tier index ベースの上下アンカーに引っ張られて上辺/下辺に着地しないこと。
6. **gate**: サイド化は適用すると益のある条件（cross-hub 交差が生じる ＝ external エッジを持つ hub が ≥2）でのみ行う。単純な図（単一ハブ）は従来配置を維持し、横に無駄に広げない。明示ヒントは gate を迂回する。
7. **回帰なし**: external 配置の変更が、infra/service の tier 配置（#1724 / #823）や #974 の infra pull-up を壊さない。

## 想定される失敗モード

- external をサイドへ動かす post-pass が container の bbox を拡張し忘れ、ノードが図の外にはみ出す / クリップされる。
- 自動振り分けが `Math.random` 的・非決定的になり、同じ `.krs` で図が毎回変わる（スナップショット flake）。
- `column` override が無視され、作者が左右を制御できない。
- infra kind が誤ってサイドへ移動し、`database [external]` が infra 行から消える（境界ルール違反）。
- external 配置変更が #1724 の tier テストや #974 pull-up を退行させる（回帰）。
- displayMode（shape / icon）でサイド配置が成立しない（[TPL-20260510-06]）。

## チェックリスト

kind 別の帯へノードを動かす配置 post-pass を追加・変更する際:

- [ ] 動かした kind 以外（actor/client/service/infra）の行・x スパンが不変であることを確認した
- [ ] 自動配置が決定的（宣言順安定・tie-break 明示）であることを確認した
- [ ] style ヒント（`column` 等）による override が効くことを確認した
- [ ] 関連 kind の境界ルール（infra は常に内側 = [ADR-20260623-06]）が保たれることを確認した
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
  - `moves external to a side column even without user/client (#1728)`
  - `keeps a database [external] on the infra row, not the external row (kind wins over tag) (#1724)`（境界ルール回帰ガード）
  - `propagates infra pull-up through a dep-on-dep chain … (Issue #974)`（pull-up 回帰ガード）

## 派生元 spec / ADR

- [ADR-20260623-06](../adr/20260623-06-system-view-infra-external-tier-split.md) — infra/external ティア分割（本 TPL の external 配置はこれを refine する #1728 由来）
- `docs/spec/style.md` の `column` 節（external services: `column` picks the side）
- [ADR-20260624-06](../adr/20260624-06-external-on-sides-layout.md) — system-view の external サイド配置（#1728。Design Doc から昇格）
