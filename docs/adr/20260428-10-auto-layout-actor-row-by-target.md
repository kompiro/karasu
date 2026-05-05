---
id: ADR-20260428-10
title: アクター配置 — outgoing edge の最も浅い target に隣接する row へ引き下げる
status: accepted
date: 2026-04-28
topic: renderer
related_to:
  - ADR-20260429-01
  - ADR-20260429-02
  - ADR-20260429-04
scope:
  packages:
    - core
assumptions:
  - "file: packages/core/src/renderer/layout.ts"
  - "symbol: packages/core/src/renderer/layout.ts :: assignForcedSystemLayers"
  - "file: packages/core/src/renderer/layout.test.ts"
---

# ADR-20260428-10: アクター配置 — outgoing edge の最も浅い target に隣接する row へ引き下げる

- **日付**: 2026-04-28
- **ステータス**: 決定済み
- **関連**:
  - 親 Issue: [#966](https://github.com/kompiro/karasu/issues/966) — Auto-layout: actors that bypass intermediate clients render with crossing edges
  - Issue: [#967](https://github.com/kompiro/karasu/issues/967)
  - PR: [#971](https://github.com/kompiro/karasu/pull/971)
  - 兄弟 Issue: [#968](https://github.com/kompiro/karasu/issues/968)（B. edge routing）, [#969](https://github.com/kompiro/karasu/issues/969)（C. presentation-only layout hints）, [#974](https://github.com/kompiro/karasu/issues/974)（D. infra/external の対称配置）

## 背景

karasu の system-view は `systemTier()` で `kind` ごとに 0..3 のティアを割り当てる（user=0, client=1, service=2, infra/external=3）。`assignForcedSystemLayers()` は全 `user` を強制的にティア 0（最上段）に置いてきた。

しかし、中間 client を経由しない actor（典型例: 内部 API を直接叩く運用者やオペレータ）が混在する図では、その actor のエッジが client 段を**貫通**する形で描画される。

```
[Customer] [Seller] [Admin]    ← 全 user が row 0
     \      /        |
   [MobileApp]       |         ← row 1
        \           /
       [EC Site]               ← row 2 — Admin → EC Site のエッジが MobileApp を貫通
```

karasu は **既存システムを記述する** 言語なので、ユーザーに「ここに client を立てよ」と要求するわけにはいかない。レイアウト側で解く必要がある。

## 決定

`assignForcedSystemLayers()` の最終段に post-pass を追加し、各 `user` ノードについて「outgoing edge の最小 target row - 1」へ**引き下げる**（押し上げはしない）。outgoing edge を持たない user は従来どおりティア 0 のまま。

```ts
for (const u of byTier[0]) {
  const targets = outByUser.get(u.id);
  if (!targets || targets.length === 0) continue;
  const minTargetLayer = min(targets.map(t => layers.get(t)));
  const desired = Math.max(0, minTargetLayer - 1);
  if (desired > current) layers.set(u.id, desired);
}
```

EC Platform 例での効果:

- `Customer → MobileApp(1)` → row 0 のまま
- `Seller → MobileApp(1)` → row 0 のまま
- `Admin → ECSite(2)` → row 1 へ引き下げ（MobileApp と同じ row に並ぶ）

## 理由

- **モデル側に手を入れずに済む**: `.krs` を書き換えなくても既存ファイルが綺麗にレンダリングされる。
- **既存挙動を壊さない**: outgoing edge を持つ user のみ引き下げ対象。引き下げのみ（`desired > current` ガード）なので、target が同じ row 1 にある一般的なケースは変化なし。Subscriber 型（user が service edge の終点）も従来どおり。
- **発展性**: 親 Issue [#966](https://github.com/kompiro/karasu/issues/966) の B（エッジルーティング）と C（presentation-only hint）に直交する。A だけで多くのケースは解決し、残りは B / C / D で対応する。

## 却下した案

### 案 A1: 全 user を BFS で `target row - 1` に揃える

`desired > current` のガードを外し、引き下げ・押し上げ両方やる版。outgoing edge を持たない user（Subscriber 等）がティア 0 から外れるのは慣習に反するため却下。

### 案 A2: タグでレイアウト都合を表現する（`user Admin [internal]` 等）

モデル語彙にレイアウト都合の意味を持ち込むことになる。タグは「この actor が何者か」を表すのが目的で、「どこに描画してほしいか」ではない。Presentation hint は別 Issue [#969](https://github.com/kompiro/karasu/issues/969) で `.krs.style` 側に寄せる。

### 案 A3: ティア定義そのものを書き換える（user を廃止する）

`user` を kind ベースのティアから外し、純粋に topological sort で配置。多くの図では「user は上」が正しいので、一律フラットにすると逆方向（user が service の下）に落ちるケースが増えてかえって悪化する。
