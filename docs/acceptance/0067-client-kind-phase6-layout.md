---
type: product
---

# AT-0067: `client` kind — Phase 6 forced `user → client → service` layout

## 概要

system 図のレイアウトが、エッジの有無に関係なく **`user` 行 → `client` 行 → `service` 行** の三層を上から下に強制配置することを確認する
（Issue [#856](https://github.com/kompiro/karasu/issues/856)、設計は `docs/design/client-mcp-modeling.md` Q11）。

`client` 不在の system は `user` 行 → `service` 行の二層に縮約される。

## 前提条件

- Phase 1 (#849) が main にマージされている
- 任意の `.krs` を編集できる状態

## 受け入れ条件

### 1. 三層レイアウト

以下の `.krs` をアプリで開いたとき、`Customer` が最上段、`MobileApp` が中段、`OrderService` が最下段に並ぶ。

```krs
system Demo {
  user Customer [human]
  client MobileApp [mobile]
  service OrderService {}
  Customer -> MobileApp
  MobileApp -> OrderService
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

### 3. `client` 不在時の二層フォールバック

`client` を持たない system は、`user` 行 → `service` 行の二層に縮約される。

```krs
system ClassicSSR {
  user Visitor [human]
  service WebApp {}
  Visitor -> WebApp
}
```

### 4. 同一層内は宣言順

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

### 5. Getting Started への影響

`examples/getting-started/index.krs` を開いたとき、`Customer / Seller / Admin` が最上段、`MobileApp` が中段、`ECommerce / Payment / Inventory / Notification` が最下段に並ぶ。エッジの矢印が下方向に流れている。

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
