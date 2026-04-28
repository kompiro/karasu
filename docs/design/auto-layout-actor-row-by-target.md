# Auto-layout: place actors adjacent to their first reachable row

- **日付**: 2026-04-28
- **ステータス**: 検討中
- **関連**:
  - 親 Issue: [#966](https://github.com/kompiro/karasu/issues/966) — Auto-layout: actors that bypass intermediate clients render with crossing edges
  - Issue: [#967](https://github.com/kompiro/karasu/issues/967) — A. place actors adjacent to the row of the node they first reach
  - 兄弟 Issue: [#968](https://github.com/kompiro/karasu/issues/968)（B. edge routing）, [#969](https://github.com/kompiro/karasu/issues/969)（C. presentation-only layout hints）

## 背景・課題

karasu の system-view は `systemTier()` でノードの `kind` を 0..3 のティアに割り当てる:

- 0: `user`
- 1: `client`
- 2: `service`（内部）
- 3: `database` / `queue` / `storage` / `[external]`

`assignForcedSystemLayers()` は全 `user` を強制的にティア 0（最上段）に置く。
これは多くの図で正しい — 「人は上、システムは下」という C4 風の慣習に沿う。

しかし、**実態として中間クライアントを経由しない actor**（典型例: Web 管理画面に
直接アクセスする運用者ではなく、内部 API を直接叩くオペレータや bot 等）が
混在する図では、その actor のエッジが client 段を**貫通**する形で描画される。

```
[Customer] [Seller] [Admin]    ← 全 user が row 0
     \      /        |
   [MobileApp]       |         ← row 1
        \           /
       [EC Site]               ← row 2 — Admin → EC Site のエッジが MobileApp を貫通
```

karasu は **既存システムを記述する** 言語であるべきなので、ユーザーに
「ここに client を立てよ」と要求するわけにはいかない（ADR-20260427-02 の
ガイドラインにも沿う）。レイアウト側で解く必要がある。

## 制約・前提

- `.krs` の語彙・構文は変えない（純粋にレンダリング層の改善）
- `.krs.style` にも新プロパティは足さない（C は別 Issue [#969](https://github.com/kompiro/karasu/issues/969)）
- 既存の「user は上に置く」慣習は壊さない — outgoing edge を持たない user は
  これまで通りティア 0 に残す
- 後方互換: 既存の図が悪化しないこと（多くのケースでは見た目が変わらないか改善する）

## 決定

`assignForcedSystemLayers()` の最終段に **post-pass** を追加する:

- 各 `user` ノード `u` について、`u` から出る outgoing edge の到達先 `t` の
  layer を集める。
- それらの最小値を `minTargetLayer` とする。
- `u` の layer を `max(0, minTargetLayer - 1)` に**引き下げる**（押し上げはしない）。
- outgoing edge を持たない user は変更しない（既存挙動: ティア 0）。

```ts
for (const u of byTier[0]) {
  const targets = outByUser.get(u.id);
  if (!targets || targets.length === 0) continue;
  const minTargetLayer = min(targets.map(t => layers.get(t)));
  const desired = Math.max(0, minTargetLayer - 1);
  if (desired > current) layers.set(u.id, desired);
}
```

### 効果（EC Platform 例）

- `Customer → MobileApp(1)` → `Customer.layer = 0`（変化なし）
- `Seller → MobileApp(1)` → `Seller.layer = 0`（変化なし）
- `Admin → ECSite(2)` → `Admin.layer = 1`（MobileApp と同じ row に並ぶ）

Admin → ECSite のエッジは MobileApp を貫通しなくなる。

## 理由

1. **モデル側に手を入れずに済む**: ユーザーは `.krs` を書き換える必要がない。
   既存ファイルが自動的に綺麗にレンダリングされる。
2. **既存挙動を壊さない**: outgoing edge のある user は引き下げのみ
   （`desired > current` ガード）、無い user は完全に従来通り。Subscriber
   ユースケース（user が service edge の終点）も維持される。
3. **発展性**: 親 Issue [#966](https://github.com/kompiro/karasu/issues/966) の B（エッジルーティング）と
   C（presentation-only hint）に直交する。A だけで多くのケースは解決し、
   残りは B / C で対応する三段構えになる。

## 却下した案

### 案 A1: BFS で全 user を強制的に target row - 1 に揃える
- `desired > current` のガードを外し、引き下げ・押し上げ両方やる版。
- 却下理由: outgoing edge を持たない user（Subscriber 等）が
  ティア 0 から外れるのは慣習に反する。「user は上にいる」という
  既定値を保ったまま、必要な user だけを動かす方が surprise が小さい。

### 案 A2: `[external]` タグや専用タグで明示的に分ける
- 例: `user Admin [internal]` のように書くと別レイヤに移動。
- 却下理由: モデル語彙にレイアウト都合の意味を持ち込む。タグは「この
  actor が何者か」を表すのが目的で、「どこに描画してほしいか」ではない。
  C [#969](https://github.com/kompiro/karasu/issues/969) で `.krs.style` 側のヒントを足す案と被るので、そちらに寄せる。

### 案 A3: ティア定義そのものを書き換える（user を廃止する）
- `user` を kind ベースのティアから外し、純粋に topological sort で配置。
- 却下理由: 多くの図では「user は上」が正しい。一律フラットにすると
  逆方向（user が service の下）へ落ちるケースが増えてかえって悪化する。

## 影響範囲

| 領域                              | 影響                                                   |
| --------------------------------- | ------------------------------------------------------ |
| `packages/core/src/renderer/layout.ts` | `assignForcedSystemLayers()` に post-pass を追加     |
| `packages/core/src/renderer/layout.test.ts` | 既存テスト 1 件にコメント補足、新規テスト 1 件追加 |
| `.krs` / `.krs.style` 構文        | 変更なし                                               |
| 既存の図                          | outgoing edge のない user は完全に同じ。outgoing edge を持つ user は target が同じ row にあれば変化なし、深いところを指していれば下がる |

## 検証

- 既存 layout テスト（1055 件）すべて通過
- 新規テスト「places an actor that bypasses the client tier in the client row, not the top row」を追加
- 視覚的検証は `/qa` または手動で `examples/ec-platform/` をレンダリングして確認

## 未解決事項

- 同じ row に複数 actor / client が並ぶときの x 順序: 現状の barycenter ヒューリスティクスに任せる。実例で破綻したら #968（edge routing）または #969（layout hints）で対応する。
- 多段 client（client → client → service）はまだ稀なので未検証。
