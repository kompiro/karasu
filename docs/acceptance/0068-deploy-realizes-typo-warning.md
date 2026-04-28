---
type: product
---

# AT-0068: Deploy `realizes` typo surfaces an `unresolved-realizes` warning

## 概要

`deploy` ノードの `realizes <target>` プロパティに、論理側の `service` / `domain` として存在しない id を書いた場合、新しい `unresolved-realizes` 警告が出ることを確認する
（Issue [#907](https://github.com/kompiro/karasu/issues/907)）。

これまでパーサは任意の識別子を受理していたため、タイポで物理ノードと論理ノードのリンクが silent に切れる問題があった。`handles` の検証 (#854) と同じパターンを `realizes` にも適用する。

## 前提条件

- 任意の `.krs` を編集できる状態
- WarningPanel が表示されている

## 受け入れ条件

### 1. 解決できる realizes は警告にならない

```krs
system S {
  service ECommerce {}
}
deploy Production {
  oci ecommerceApp {
    runtime "Kubernetes"
    realizes ECommerce
  }
}
```

→ `unresolved-realizes` 警告は出ない。

### 2. タイポで警告が出る

`realizes ECommerce` を `realizes ECommrce` に変える:

```krs
deploy Production {
  oci ecommerceApp {
    runtime "Kubernetes"
    realizes ECommrce
  }
}
```

→ WarningPanel に「Deploy node "ecommerceApp" realizes "ECommrce" but no service or domain with that id exists」と表示される（日本語ロケールでは「デプロイノード "ecommerceApp" の realizes "ECommrce" を解決できる service / domain が見つかりません」）。

### 3. タイポを直すと警告が消える

`Ordr` → `Order` のような修正を行うと、PR #893 で入った fingerprint 改善により WarningPanel から該当警告が消える。

### 4. 1 ノードに複数 typo があれば各々で警告

```krs
deploy Production {
  oci app {
    runtime "Kubernetes"
    realizes A
    realizes Bx
    realizes Cx
  }
}
```

→ 解決可能な `A` には警告なし、`Bx` `Cx` それぞれに `unresolved-realizes` が出る。

### 5. 別 deploy block ごとに別々に検査

```krs
deploy Production {
  oci app1 { runtime "k" realizes ECommrce }   // typo
}
deploy Staging {
  oci app2 { runtime "k" realizes Comm }       // typo
}
```

→ 両方の deploy block それぞれで警告が出る (`deployBlockId` が `Production` と `Staging` で区別される)。

### 6. 既存の `missing-realizes` と独立して動く

`realizes` 自体が無い場合は従来通り `missing-realizes` のみが出て、`unresolved-realizes` は出ない（重複警告なし）。

### 7. import 越しの参照は警告しない

```krs
// main.krs
import { ECommerce } from "./services.krs"
deploy Production {
  oci app {
    runtime "k"
    realizes ECommerce
  }
}
```

→ 警告なし（`compileProject` がマージ後の AST に対して走るため、import 解決済み）。

## 自動化された検証

- `packages/core/src/resolver/warnings.test.ts` — `unresolved-realizes warning` セクション 7 ケース:
  - 直接解決
  - タイポ検出
  - `realizes` なしは別経路（`missing-realizes`）任せ
  - service 配下の domain も解決できる
  - top-level service / domain も解決できる
  - 1 ノードに複数 typo
  - 別 deploy block ごとの検出

## 関連

- Issue: [#907](https://github.com/kompiro/karasu/issues/907)
- 同じ validation パターンの先例: PR #880 (#854 — `handles` クロスリファレンス)
- 警告のリフレッシュ: PR #893 (#891 — fingerprint で `unresolved-realizes` も両方向で更新される)
