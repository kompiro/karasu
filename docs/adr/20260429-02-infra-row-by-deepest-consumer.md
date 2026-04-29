---
id: ADR-20260429-02
title: Infra/external ノードを最深 consumer の直下行に引き上げる
status: accepted
date: 2026-04-29
topic: renderer
related_to: [ADR-20260429-01]
assumptions:
  - "file: packages/core/src/renderer/layout.ts"
  - "symbol: packages/core/src/renderer/layout.ts :: assignForcedSystemLayers"
  - "grep: packages/core/src/renderer/layout.ts :: byTier\\[3\\]"
---

# ADR-20260429-02: Infra/external ノードを最深 consumer の直下行に引き上げる

- **日付**: 2026-04-29
- **ステータス**: 決定済み
- **関連**:
  - Issue [#974](https://github.com/kompiro/karasu/issues/974)（親 [#966](https://github.com/kompiro/karasu/issues/966)）
  - 兄弟: [#967](https://github.com/kompiro/karasu/issues/967)（A — actor row by target、PR [#971](https://github.com/kompiro/karasu/pull/971) で実装済み）
  - 実装 PR [#992](https://github.com/kompiro/karasu/pull/992)
  - 関連 ADR: [ADR-20260429-01](./20260429-01-orthogonal-edge-routing-skip-layer.md)（B — エッジルーティング）
  - 設計経緯: 旧 Design Doc は本 ADR で置き換え

## 背景

karasu の system-view は `systemTier()` でノードの kind を 0..3 のティアに割り当てる:

- 0: `user`
- 1: `client`
- 2: `service`（内部）
- 3: `database` / `queue` / `storage` / `[external]`（dep ティア）

`assignForcedSystemLayers()` は dep ティアを常に最下段に置く。多くの図で正しいが、深いサービスチェーン
（`A → B → C`）を持つシステムで `Cache` を `A` だけが使う場合、`Cache` が最下段に押し下げられて
`A → Cache` のエッジが `B` と `C` を貫通する。これは Issue [#967](https://github.com/kompiro/karasu/issues/967)
が `user` の最上段固定で起こしていた問題の **下端側のミラーケース** である。

A（[#967](https://github.com/kompiro/karasu/issues/967)）の post-pass が既に存在するため、
同じ場所に対称な mirror として実装できる。

## 決定

`assignForcedSystemLayers()` の最終段（A の post-pass の直後）に、tier-3 ノードを引き上げる
**dep pull-up post-pass** を追加する。

- 各 dep `d` について incoming edge の発生元 `s` の layer を集め、`max(layers[s]) + 1` を `desired` とする。
- `desired < current` のときだけ `layers[d] = desired` で引き上げる（**strictly upward**）。
- incoming edge を持たない dep は変更しない（既存挙動: 最下段）。
- dep-on-dep の連鎖（`A → dep1 → dep2`）にも対応するため、**固定点反復** で収束させる。
  反復回数は `byTier[3].length` で打ち切る。

ノードの id 集合 (`depIds`) を一度作って tier-3 への edge を O(E + N) でフィルタする。
`nodes.find(...)` を edge ごとに回す O(E·N) は避ける。

## 理由

- **A の symmetric な mirror**: 既存 post-pass と同じ場所・同じ構造で実装できる。コードの意図が一目で分かる。
- **モデル側に手を入れずに済む**: `.krs` を書き換えなくても既存ファイルが綺麗にレンダリングされる。
- **strictly upward**: `desired < current` ガードにより現在より下に動かない。incoming edge のない dep は完全に従来通り。「全 infra が最下段に並ぶ」既存の見た目を壊さない。
- **固定点反復で宣言順非依存**: `Backend → Stripe → Auth` のような連鎖が `Stripe` 宣言順より前に `Auth` が宣言されても正しく伝播する。反復は最大 `|byTier[3]|` 回で打ち切る。
- **B との相補関係**: D で多くの貫通を解消し、B（[ADR-20260429-01](./20260429-01-orthogonal-edge-routing-skip-layer.md)）のオルソゴナルルーティングは A・D で救えなかった残りを処理する。

## 却下した案

### 案 D1: 最下段固定のまま、エッジルーティング（B）だけで救う
長いエッジは図全体の縦幅を増やし視認性も落ちる。「論理的に近いものは物理的にも近くに置く」原則に反する。
B はあくまで補完であって主役にはしない。

### 案 D2: consumer が散らばる場合は最下段に戻すヒューリスティクス
「max consumer row と min consumer row の差が N 以上なら最下段」のような閾値ルール。
N の根拠がない。早すぎる最適化を避け、まず単純な `max + 1` で出して実例で破綻したら再検討する。

### 案 D3: dep ティアの placement を topo sort に任せる
ティア固定を外して純粋に topo で配置する案。incoming edge のない infra（参考データベース等）が
思わぬ場所に飛ぶ可能性が高い。ティア構造の安定性を保ちつつ必要な dep だけを動かす方が surprise が小さい。

### 案 D4: `min(sourceLayer) + 1` を使う
最も浅い consumer の直下に置く案。共有 dep の場合、深い consumer からのエッジが他の row を貫通する。
同じ問題を逆向きに作るだけ。`max` を使えば全 consumer のエッジは下方向（または同 row）に流れて貫通しない。

## 親 Issue [#966](https://github.com/kompiro/karasu/issues/966) における位置づけ

| サブ案 | Issue | 状態 | カバー範囲 |
| --- | --- | --- | --- |
| A. Actor row by target | [#967](https://github.com/kompiro/karasu/issues/967) | 実装済み | 上端: `user` の引き下げ |
| B. Orthogonal edge routing | [#968](https://github.com/kompiro/karasu/issues/968) / [#996](https://github.com/kompiro/karasu/issues/996) | 実装済み（Phase 2/3） | 残るエッジ貫通の救済 |
| C. Presentation-only layout hints | [#969](https://github.com/kompiro/karasu/issues/969) | 未着手 | 自動で解けないケースの逃げ道 |
| **D. Infra/external by consumer** | **[#974](https://github.com/kompiro/karasu/issues/974)** | **本 ADR で確定** | **下端: dep の引き上げ** |
