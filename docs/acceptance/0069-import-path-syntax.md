---
type: product
---

# AT-0069: Import path syntax for system-nested service / domain

## 概要

別ファイルの `system` 配下にネストされた `service` / `domain` / `usecase` を、`import { Sys.Svc.Dom } from "./other.krs"` のような明示 path 構文で取り込めることを確認する
（Issue [#927](https://github.com/kompiro/karasu/issues/927)、設計は `docs/design/import-system-nested.md`）。

PR #913 (`unresolved-realizes`) で生まれた validation gap — クロスファイル参照で深いネストにアクセスできなかった問題 — を解消する。

## 前提条件

- 任意の `.krs` を編集できる状態
- マルチファイル構成 (例: `examples/ec-platform/05-multifile/`) を持つプロジェクトを開ける状態

## 受け入れ条件

### 1. 基本形: 2 セグメントの path で service に届く（realizes の典型）

`realizes` のターゲットは通常 service。2 セグメント path で system 直下の service を取り込む。

```krs
// services.krs
system ECPlatform {
  service ECommerce {
    domain Order {}
  }
  service Notification {}
}

// main.krs
import { ECPlatform.ECommerce } from "./services.krs"

deploy Production {
  oci ecommerceApp {
    runtime "k"
    realizes ECommerce
  }
}
```

`unresolved-realizes` 警告が出ないことを確認する。

### 2. 3 セグメントの path で domain にも到達できる（深いネスト）

`Sys.Svc.Dom` で system → service → domain の最深部に届くことを確認する。`realizes` のターゲットは引き続き service にする (path で取り込んだ ECommerce を使う)。

```krs
// services.krs (上記と同じ)

// main.krs
import { ECPlatform.ECommerce.Order } from "./services.krs"

deploy Production {
  oci ecommerceApp {
    runtime "k"
    realizes ECommerce
  }
}
```

merged AST に `ECPlatform → ECommerce → Order` のチェーンが現れる (`Catalog` のような兄弟 domain は含まれない — 後述)。`realizes ECommerce` も解決される (path 解決で ECommerce stub が ancestor として merged AST に作られるため)。

### 3. 兄弟ノードは自動 import されない

上記 2 の状態で、`Catalog` などの兄弟は merged AST に含まれていない。`handles Catalog` のような参照 (#854) を試すと `unresolved-handles` が出る。兄弟も使いたい場合は明示的に `import { ECPlatform.ECommerce.Catalog }` を追加するか、wildcard import (`import "./services.krs"`) でファイル全体を取り込む。

### 4. 同名衝突 (システム移行) を path で disambiguate

```krs
// services.krs
system OrderSystemV1 {
  service OrderService { domain Legacy {} }
}
system OrderSystemV2 {
  service OrderService { domain Modern {} }
}

// main.krs — V2 だけを取り込む
import { OrderSystemV2.OrderService } from "./services.krs"
```

merged AST に `OrderSystemV2` のみが現れ、`OrderSystemV1` は含まれない。`Modern` ドメインだけが解決可能で `Legacy` は解決できない。

### 5. bare id (後方互換) は変更なし

```krs
import { ECommerce } from "./services.krs"   // 既存の bare id
```

既存の `.krs` ファイルが書き換えなしで動き続ける。internal AST では `[["ECommerce"]]` (single-segment path) として保持されるが、resolver の挙動は変わらない。

### 6. path のセグメントが解決できないと警告

```krs
import { ECPlatform.NotThere.Order } from "./services.krs"
```

WarningPanel に「Import path "ECPlatform.NotThere.Order" failed at segment "NotThere" (#1): no child with that id under "ECPlatform"」と表示される（日本語ロケールでは「import path "..." のセグメント "NotThere" (#1) を解決できません: "ECPlatform" の下にその id の子は存在しません」）。

### 7. 最初のセグメントで失敗したときも適切なメッセージ

```krs
import { Missing.Foo } from "./services.krs"
```

→ 「Import path "Missing.Foo" failed at segment "Missing" (#0): no top-level system with that id in ./services.krs」

### 8. 同じ import 文に bare id と path を混在できる

```krs
import { Foo, Sys.Bar } from "./other.krs"
```

両方とも parse error なく解決される (それぞれ存在すれば)。

### 9. 同じファイルの複数 leaf を 1 つの import 文で取り込める

```krs
import { ECPlatform.ECommerce.Order, ECPlatform.ECommerce.Catalog } from "./services.krs"
```

merged AST には `ECPlatform.ECommerce` が **共通の stub** として 1 つだけ存在し、その下に `Order` と `Catalog` が並ぶ。

### 10. wildcard import との独立性

`import "./services.krs"` (wildcard) は本変更の影響を受けず、ファイル全体を取り込む。明示 path syntax と独立して動く。

## 自動化された検証

- `packages/core/src/parser/parser.test.ts` — bare id と path syntax 両方をパース、トレーリングドット時のエラー検出
- `packages/core/src/fs/import-resolver.test.ts` — `path syntax (Issue #927)` セクション 7 ケース:
  - 3 セグメント path の解決
  - 2 セグメント path (bare id 等価)
  - 同名衝突の disambiguate
  - 最初のセグメントで失敗
  - 中間セグメントで失敗
  - wildcard import との独立性
  - 同一 import 文での複数 leaf 共有 ancestor

## スコープ外（将来の別 Issue）

- LSP 補完 (`import { Sys.<TAB>` で system 配下を補完)
- path セグメントの kind 厳格化 (現状は id-only loose match)
- usecase 内 resource を path で取り込む需要が出たとき (現状の AST 設計には影響しない)

## 関連

- 親 Issue: [#927](https://github.com/kompiro/karasu/issues/927)
- 設計ドキュメント: `docs/design/import-system-nested.md`
- 動機元: PR #913 / Issue #907 (`unresolved-realizes`)
