---
id: TPL-20260623-03
title: "system-view のティアを分割/挿入したら、新たに段を跨ぐエッジが中間カードを貫通しないことを確認する"
status: active
applicable_to:
  - "forced layout でノードを kind/タグベースのティアに割り当て、ティアを縦に積む配置ロジック"
  - "既存ティアを分割する / 新ティアを挿入する変更（あるノード集合を別の行へ移す）"
known_consumers:
  - system-view-tier-assignment
date: 2026-06-23
discovered_from:
  - root_cause_adr: "ADR-20260429-02"
  - root_cause_adr: "ADR-20260429-01"
  - root_cause_file: "packages/core/src/renderer/layout.ts"
related_to: [TPL-20260519-02]
topic: renderer
scope:
  packages: [core]
---

# TPL-20260623-03: system-view のティアを分割/挿入したら、新たに段を跨ぐエッジが中間カードを貫通しないことを確認する

## 観点

system-view の forced layout は、ノードを kind/タグで複数のティアに割り当てて縦に積む（`user → client → service → infra → external`）。
**ティアを分割する／新しいティアを挿入する変更**は、それまで隣接段だったノード間に新しい中間段を挟む。
その結果、中間段を **跨ぐ（skip する）エッジ**が新たに生まれる。

このとき守るべき不変条件は2つ:

1. **貫通の救済**: 中間段を跨ぐエッジは、中間段のノードカードを直線で貫通してはならない。直交チャネルルーティング（[ADR-20260429-01](../adr/20260429-01-orthogonal-edge-routing-skip-layer.md)）または consumer 直下への引き上げ（[ADR-20260429-02](../adr/20260429-02-infra-row-by-deepest-consumer.md)）のいずれかで救済されること。
2. **既存 pull-up の温存**: ティア分割は、既存のティアに対する pull-up/pull-down post-pass（#974 / #967）の不変条件を壊してはならない。新ティアのための floor/clamp を足すなら、それが既存ティアの引き上げを抑止していないか確認する。

「論理的に近いものは物理的にも近くに置く」原則（[ADR-20260429-02](../adr/20260429-02-infra-row-by-deepest-consumer.md) 却下案 D1）の派生。ティアを増やすほど段間距離が伸び、貫通が起きやすくなる。

## 想定される失敗モード

- external を infra の下段に分けた結果、`service → external` エッジが infra 行のカードを縦断する（直交ルーティングが skip-layer のみ対象で、新たな貫通を拾い損ねる）。
- 新ティアの placement に `tierBase` floor を入れたら、別ティアの #974 pull-up（dep を consumer 直下へ引き上げる）まで抑止され、深いサービスチェーンで長い貫通エッジが復活する。
- ティア分割でノードが別行に移り、`column` hint や barycenter に依存した既存テストの x 位置がずれる（行メンバーシップの変化を見落とす）。

## チェックリスト

ティアの分割・挿入・並べ替えを伴う変更で、以下を確認する:

- [ ] 新たに段を跨ぐようになったエッジを列挙し、各々が直交ルーティングまたは pull-up で救済される（中間カードを直線貫通しない）ことを確認した
- [ ] 既存ティアの pull-up/pull-down post-pass（#974 / #967）の不変条件が保たれている（新ティア用の floor/clamp が既存の引き上げを抑止していない）
- [ ] 単一種別しか無いモデル（infra のみ / external のみ）で空ティアが phantom gap を作らない（高さが無駄に増えない）ことを確認した
- [ ] ティア間で同一始点からファンアウトするエッジ群が、行メンバーシップ変化で交差や x 位置を悪化させていないか確認した
- [ ] shape / icon 両 displayMode でティア構造が成立することを確認した（[TPL-20260510-06](TPL-20260510-06-display-mode-cross-surface.md)）

## 既知の対処パターン

- **新ティアは pull-up させず固定バンドに置く**: external は最下段固定（consumer 直下へ引き上げない）にして、infra との行重複を避ける。引き上げが必要な既存ティア（infra）は従来どおり pull-up を温存し、新ティアの floor を既存ティアに掛けない（#1724 の実装方針）。
- **救済はルーティングに委ねる**: 固定バンド化で生まれる skip-layer エッジは [ADR-20260429-01](../adr/20260429-01-orthogonal-edge-routing-skip-layer.md) の直交チャネルルーティングが処理する。エッジの交差そのものの低減は別 workstream（[#1728](https://github.com/kompiro/karasu/issues/1728)）。

## 関連テスト

- `packages/core/src/renderer/layout.test.ts`:
  - `splits the dep tier into an infra row above an external row (#1724)`
  - `places database [external] in the external row, below owned infra (tag wins over kind) (#1724)`
  - `separates infra and external onto distinct rows when one service uses both (#1724)`
  - `does not add an empty infra band when a model has only external deps (#1724)`
  - `pulls a dep used only by an upper service up to one row below its consumer (Issue #974)`（既存 pull-up が温存されていることの回帰ガード）
- `packages/core/src/renderer/edge-routing-channels.test.ts`（skip-layer 直交ルーティング）

## 派生元 spec / ADR

- [ADR-20260429-02](../adr/20260429-02-infra-row-by-deepest-consumer.md) — infra/external を最深 consumer 直下へ引き上げる（#974）
- [ADR-20260429-01](../adr/20260429-01-orthogonal-edge-routing-skip-layer.md) — skip-layer エッジの直交チャネルルーティング
- Design Doc: `docs/design/system-view-infra-external-tier-split.md`（#1724）
