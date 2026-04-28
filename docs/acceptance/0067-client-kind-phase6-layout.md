---
type: product
---

# AT-0067: `client` kind — Phase 6 forced layered layout

## 概要

system 図のレイアウトが kind ベースの **4 段グルーピング** + **段内の topological sort** で構成されることを確認する
（Issue [#856](https://github.com/kompiro/karasu/issues/856)、設計は `docs/design/client-mcp-modeling.md` Q11）。

段（tier）の構造:

| 段 | 含まれる kind | 役割 |
|---|---|---|
| 0 | `user` | 操作の起点となるアクター |
| 1 | `client` | ユーザー接点（mobile / web / desktop / cli / device / extension / embed） |
| 2 | `internal` (`service` その他、`[external]` でない非インフラ) | 我々が所有するサービス層 |
| 3 | `dep` (`database` / `queue` / `storage` / `[external]` 付きノード) | internal が依存する要素群 |

各段の中では **その段内のエッジでトポロジカルソートを行い sub-row を割り当てる**（呼び出し関係や依存関係が縦に流れる）。空の段は行ごと詰められる。`[external]` と infra kind は同じ段にまとめ、視覚的な区別は `[external]` タグのスタイル（枠線・色）に委ねる。

## 前提条件

- Phase 1 (#849) が main にマージされている
- 任意の `.krs` を編集できる状態

## 受け入れ条件

### 1. 4 段レイアウトと段内 topological sort

以下の `.krs` をアプリで開いたとき、`Customer`（user 段）→ `MobileApp`（client 段）→ `OrderService` → `BillingService`（internal 段、`OrderService -> BillingService` で sub-row 分離）→ `Postgres`（dep 段）の順に並ぶ。

```krs
system Demo {
  user Customer [human]
  client MobileApp [mobile]
  service OrderService {}
  service BillingService {}
  database Postgres {}
  Customer -> MobileApp
  MobileApp -> OrderService
  OrderService -> BillingService
  BillingService -> Postgres
}
```

### 2. user の配置はエッジトポロジーに依存しない

`user` は **エッジの有無や向きに関係なく** 常に最上段に配置される。トポロジカルソートでは `service` の下に押し下げられるようなパターンでも、強制レイアウトが `user` 行に引き上げる。

```krs
system Demo {
  service Notifier {}
  user Subscriber [human]
  Notifier -> Subscriber
}
```

`Subscriber` が `Notifier` より上に配置されること（トポロジカルソートだけだと逆になる）を確認する。

`client` をスキップして `service` に直接エッジを張る user（例: `Admin -> OrderService`）も同様で、`Admin` は他の user と同じ最上段に並ぶ。

### 3. infra と `[external]` は同じ dep 段で、internal の下に並ぶ

`database` / `queue` / `storage` kind のノードと、`[external]` タグの付いたノードはすべて **dep 段** にまとめられ、internal 段の下に配置される。dep 段内に依存エッジがなければ、それらは同じ sub-row に並ぶ。

```krs
system Demo {
  service Backend {}
  database Postgres {}
  queue Jobs {}
  storage Blobs {}
  service Stripe [external] {}
}
```

`Backend`（internal 段）→ `Postgres / Jobs / Blobs / Stripe`（同じ dep 段の同じ sub-row）の順に並ぶ。

### 4. dep 段内の依存エッジで sub-row が分かれる

`queue Q -> database D` のような dep 段内のエッジがあると、Q が D の上の sub-row に置かれ、依存方向が縦に流れる。

```krs
system Demo {
  service App {}
  queue Q {}
  database D {}
  Q -> D
  App -> Q
}
```

`App`（internal）→ `Q`（dep の上 sub-row）→ `D`（dep の下 sub-row）の 3 行レイアウト。

`[external]` タグの付いた `service` は、内部 service より下段（最下段）に配置される。M2M 依存先（外部 SaaS など）が下流であることをレイアウトで表現する。

```krs
system Demo {
  user Customer [human]
  client MobileApp [mobile]
  service OrderService {}
  service Stripe [external] {}
  Customer -> MobileApp
  MobileApp -> OrderService
  OrderService -> Stripe
}
```

`Customer`（最上段）→ `MobileApp` → `OrderService` → `Stripe`（最下段）の 4 段に並ぶ。`user` / `client` / `internal service` / `external service` のうち空の段は行ごと詰められる。

### 5. `client` 不在時の段の縮約

`client` を持たない system は、`user` 行 → `service` 行の二層に縮約される。

```krs
system ClassicSSR {
  user Visitor [human]
  service WebApp {}
  Visitor -> WebApp
}
```

### 6. 同一層内は宣言順

同じ層内のノードは `.krs` での宣言順を保つ。barycenter による並び替えはかからない。

```krs
system Demo {
  user U1 [human]
  user U2 [human]
  client C1 [web]
  client C2 [web]
  service S {}
  U1 -> C2
  U2 -> C1
}
```

`C1` は `C2` の左に、`U1` は `U2` の左に配置される（barycenter ヒューリスティクスが効いていれば flip するパターン）。

### 7. Getting Started への影響

`examples/getting-started/index.krs` を開いたとき、上から順に
`Customer / Seller / Admin`（user 段）→ `MobileApp`（client 段）→ `ECommerce / Notification`（internal 段）→ `Payment / Inventory`（dep 段、`[external]`）の順に並ぶ。エッジの矢印が下方向に流れている。

## 自動化された検証

- `packages/core/src/renderer/layout.test.ts` — `forced system layers (Phase 6)` describe ブロック
  - 三層配置 / `user` 直結バイパスの上段維持 / `client` 不在時の二層 / 宣言順保持

## スコープ外

- `delivers` エッジの専用線種・色（Phase 3 / Issue #853 の表現）
- サブタイプタグごとの icon 差別化
- `client → domain → usecase → resource` フル階層レイアウト

## 関連

- 親 Issue: [#823](https://github.com/kompiro/karasu/issues/823)
- 本 Phase: [#856](https://github.com/kompiro/karasu/issues/856)
- 設計ドキュメント: `docs/design/client-mcp-modeling.md` Q11
