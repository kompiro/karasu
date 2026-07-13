---
id: TPL-20260711-02
title: "エッジルーティング/レイアウトの可読性を検証するときは、交差数だけでなくノード/フレーム貫通数も測る（貫通は 0 を assert）"
status: active
date: 2026-07-11
applicable_to:
  - "エッジのルーティング規律（直交化・チャネル・ガター・トランク束ね）を変更/追加してレイアウトの可読性を改善する機能"
  - "境界フレーム / バンド / スイムレーンなど、ノード以外の描画領域をまたいでエッジを通す配置ロジック"
known_consumers:
  - system-view-group-routing
  - renderer
discovered_from:
  - root_cause_adr: "ADR-20260711-03"
  - root_cause_adr: "ADR-20260429-01"
  - root_cause_file: "packages/core/src/renderer/edge-routing-channels.ts"
related_to:
  - TPL-20260623-04
  - TPL-20260624-02
topic: renderer
scope:
  packages:
    - core
---

# TPL-20260711-02: エッジルーティング/レイアウトの可読性を検証するときは、交差数だけでなくノード/フレーム貫通数も測る（貫通は 0 を assert）

## 観点

エッジルーティングやレイアウトを「読みやすくする」変更を検証するとき、**交差（crossing）数だけを可読性の指標にすると、真の欠陥を見逃す**。

system-view grouping の設計計測（`docs/design/system-view-grouping.md` § 「計測 5」）で実測された事実:

| | 直線モック | 直交 + 集約 + marks |
| --- | --- | --- |
| エッジ交差 | 76 | 61 |
| **ノード/フレーム貫通** | **38** | **0** |

直線モックの読みづらさの**主因は交差ではなくノード/フレーム貫通（38 本）**だった。交差数だけを見ると 76→61 の小改善にしか見えず、貫通を 38→0 にした本質的な改善を測れない。さらに:

- **交差は「表現」で無害化できる**（直交交差を hop アークで「非接続」と明示、トランク合流を junction dot で「接続」と明示）ので、幾何的な交差数が残っていても可読性上の害は消える。→ **交差の総数最小化は可読性の代理指標として弱い。**
- **貫通は「表現」で無害化できない**（線がカード/枠の内部を突っ切っている時点で読めない）ので、**貫通数 == 0 を厳密 assert する**のが正しい柵。

この観点は [TPL-20260623-04](TPL-20260623-04-tier-split-no-edge-penetration.md)（ティア分割で中間カードを貫通しない）を **2 点で拡張**する:

1. 貫通の対象を**ノードカードだけでなく境界フレーム（グループ枠）の内部**にも広げる。grouped view ではフレームが obstacle であり、フレーム内部を横切るエッジも貫通である。
2. 「救済されること」の定性チェックにとどめず、**貫通数を数値で測って 0 を assert する**（＋交差数も併記して回帰を観測する）二重計測を要求する。

## 想定される失敗モード

- ルーティング変更の PR が「交差が N 本減った」だけを根拠に可読性改善を主張し、**貫通が残っている / 増えている**のを見逃す。
- 障害物集合に**ノードカードしか入れず、フレーム矩形を入れ忘れる**（既存 `routeOrthogonalEdges` がフレーム非対応なのが典型）。結果、エッジがグループ枠の内部を横切っても貫通判定に引っかからない。
- hop/junction を「交差数を減らす」ものと誤解し、交差数の減少で評価してしまう（hop/junction は**数を減らさず表現で無害化**する手段）。
- 集約トランクの spine を obstacle に入れ忘れ、別エッジが spine を貫通する。

## チェックリスト

エッジルーティング/レイアウトの可読性を変える実装・変更で、以下を確認する:

- [ ] 可読性の検証で**交差数と貫通数を両方測る**テストを書いた（片方だけにしない）。
- [ ] **ノード/フレーム貫通数 == 0** を厳密に assert した（「救済される」の定性確認で済ませない）。
- [ ] 貫通判定の障害物集合に**ノードカードとフレーム矩形の両方**を含めた（grouped/framed view）。
- [ ] 交差を hop/junction 等の**表現で無害化**する設計なら、交差数の残存を欠陥と誤認せず、代わりに「全交差が mark 付き（非接続/接続が明示）」を assert した。
- [ ] 退化ケース（グループ 1 つ / 枠なし / infra・external なし）で貫通ゼロが保たれることを確認した。
- [ ] 「Group by: none」等の**非対象モードが byte-identical で不変**であることを確認した（新ルーティングが gate 内でのみ走る）。

## 既知の対処パターン

- **障害物 = 全ノードカード ∪ 全フレーム矩形**: grouped view の貫通判定は両方を obstacle に入れる。フレームは `ContainerRect { group: true }` から得られる。
- **最外ガターへのフォールバック**: 帯間チャネル・フレーム内回廊で貫通が残るエッジは、構成上必ず空く最外の左右ガターへ退避させ、貫通ゼロを構成的に保証する。
- **交差は減らさず mark で無害化**: 直交ルーティングで全交差を直角にし、横 over 縦の hop アーク（非接続）とトランク junction dot（接続）で「接続か通過か」の曖昧さを消す。評価軸は「交差数」ではなく「全交差が mark 付きか」。
- **二重計測ヘルパー**: テストに `countCrossings(edges)` と `countPenetrations(edges, obstacles)` の両方を用意し、後者は必ず 0 を assert する。

## 関連テスト

- `packages/core/src/renderer/edge-routing-channels.test.ts`（skip-layer 直交ルーティング — ノードカード貫通の既存ガード）
- P2c 実装時に追加予定: grouped view のルーティングテスト（`routeGroupedEdges`）で貫通数 == 0 と全交差 mark 付きを assert（#1859）

## 派生元 spec / 設計

- `docs/design/system-view-grouping.md` § 「計測 5」 — 交差 vs 貫通の計測（本観点の一次ソース）
- `docs/design/system-view-grouping.md` § 「P2c 実装設計（#1859）」 — 本観点を「正しさの柵」に採用
- [ADR-20260711-03](../adr/20260711-03-system-view-group-by-team.md) — system-view Group by team（P2a）
- [ADR-20260429-01](../adr/20260429-01-orthogonal-edge-routing-skip-layer.md) — skip-layer の直交チャネルルーティング
- [TPL-20260623-04](TPL-20260623-04-tier-split-no-edge-penetration.md) — ティア分割で中間カードを貫通しない（本 TPL が frame + 二重計測へ拡張）
