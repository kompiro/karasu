# Cross-System Service References with Fully Qualified Names

- **日付**: 2026-04-04
- **ステータス**: 検討中
- **関連**: [multi-file-wildcard-import.md](multi-file-wildcard-import.md), Issue #285

## 背景・課題

現在、`->` エッジのターゲットは同一システム内の子ノード ID のみが有効。
`view-extract.ts` の `childIds.has(e.from) && childIds.has(e.to)` フィルタにより、
ターゲットが別システムに属するエッジはビュー構築時に無視される。

実際のアーキテクチャでは ECPlatform から PaymentGateway を呼び出すといった
クロスシステム依存は一般的なパターンだが、現在の構文では記述する手段がない。

```krs
system ECPlatform {
  service OrderService {
    -> PaymentService   # ← PaymentService が同一システム内になければエッジは消える
  }
}
system PaymentGateway {
  service PaymentService { }
}
```

## 制約・前提

- `KrsEdge.to` は `string` 型（変更不要）
- `[external]` タグは既存の外部ノード表現として使用済み
- `@import` / `import` による 2-pass 解決は #281 で実装済み
- 字句解析で `.`（ドット）は現在 Identifier の構成文字ではない（未トークン化）
- `extractView` は `systems[0]` を対象システムとして扱う設計

## 検討した選択肢

### 案1: ドット記法（`SystemId.ServiceId`）

```krs
system ECPlatform {
  service OrderService {
    -> PaymentGateway.PaymentService
  }
}
```

エッジターゲットとして `SystemId.ServiceId` 形式の修飾名を受け入れる。
パーサーは `Identifier DOT Identifier` のシーケンスを検出し、
`"PaymentGateway.PaymentService"` という単一文字列として `KrsEdge.to` に格納する。

**メリット**:
- 意図が明確（どのシステムのサービスかが一目で分かる）
- 型の変更が不要（`KrsEdge.to: string` のまま）
- 修飾名の検出が `includes('.')` で済む

**デメリット**:
- Dot トークンの追加が必要（Lexer・TokenType の変更）
- ノード ID としての `.` はサポートしない（エッジターゲットのみ）

### 案2: エイリアス宣言 + 通常参照

```krs
system ECPlatform {
  alias PaymentService from PaymentGateway   # 別システムのサービスをエイリアス宣言
  service OrderService {
    -> PaymentService   # エイリアスを介して参照
  }
}
```

**メリット**:
- エッジターゲットの構文変更が不要
- 依存関係の明示性が高い（alias 宣言が一覧できる）

**デメリット**:
- `alias` という新キーワードの追加が必要
- 宣言と使用の 2 箇所を管理する必要があり冗長
- スコープ解決の複雑性が増す

### 案3: `@import` スコープ内での自動解決

ワイルドカード import で取り込まれた別システムのサービスを、
修飾なしで `-> PaymentService` として参照できるようにする。

```krs
import "team-payment.krs"   # PaymentGateway.PaymentService が使えるようになる
system ECPlatform {
  service OrderService {
    -> PaymentService   # ファイル内に見つからなければ import 先を検索
  }
}
```

**メリット**:
- 既存エッジ構文を変更しない

**デメリット**:
- 名前衝突の解決が困難（複数ファイルに同名サービスが存在する場合）
- 暗黙的な参照解決はデバッグを困難にする
- 単独ファイルでのクロスシステム参照ができない

## 比較

| 観点 | 案1: ドット記法 | 案2: エイリアス | 案3: 暗黙解決 |
|---|---|---|---|
| 構文変更量 | Dot トークン追加のみ | alias キーワード + 型追加 | なし |
| 意図の明示性 | 高（記法で自明） | 高（宣言が一覧できる） | 低（暗黙的） |
| 単独ファイル対応 | ✅ | ✅ | ❌ |
| 名前衝突への耐性 | 高（System.Service で一意） | 中（alias ごとに解決） | 低 |
| 既存ユーザーへの影響 | なし | なし | あり（既存エッジの意味が変わりうる） |

## 現時点の方針

**案1（ドット記法）を採用する。**

- 変更量が最小（Lexer に Dot トークンを追加、Parser でエッジターゲットを拡張）
- `KrsEdge.to` の型変更なし、ドット有無で修飾名を判定可能
- 明示性が高く、単独ファイルでも動作する

### レンダリング方針: ghost external node

クロスシステム参照ターゲットは、参照元システムのビューに `[external]` タグ付きの
ghost ノードとして自動追加する（`ghostUsers` の仕組みと同様）。
ユーザーが明示的に宣言していない場合は警告を出力する。

```
"PaymentGateway.PaymentService" is referenced from ECPlatform.OrderService
  but not explicitly annotated as @external
```

### 警告抑制の方針

参照元システムに同じベア ID（`PaymentService`）かつ `[external]` タグを持つ
子ノードが明示宣言されていれば警告を抑制する。

```krs
system ECPlatform {
  service PaymentService [external]           # 明示宣言 → 警告なし
  service OrderService {
    -> PaymentGateway.PaymentService
  }
}
```

これにより既存の `service X [external]` 構文の延長として利用できる。

### 未解決参照の方針

`PaymentGateway` または `PaymentGateway.PaymentService` が解決できない場合も
図の描画は継続し、warning を出力する（エラーにしない）。

```
"UnknownSystem.UnknownService" could not be resolved
  — rendered as unresolved external node
```

### examples への追加

`examples/` に複数システム間の参照パターンを示すシナリオを追加する。

**`examples/ec-platform/07-cross-system/`**

| ファイル | 内容 |
|---|---|
| `main.krs` | ECPlatform から PaymentGateway へのクロスシステム参照（ドット記法）のエントリポイント |
| `ec-platform.krs` | ECPlatform システム定義。`OrderService -> PaymentGateway.PaymentService` を含む |
| `payment-gateway.krs` | PaymentGateway システム定義。`PaymentService` を定義 |

```krs
// ec-platform/07-cross-system/main.krs
// Demonstrates: cross-system service references with fully qualified names

import "ec-platform.krs"
import "payment-gateway.krs"
```

```krs
// ec-platform/07-cross-system/ec-platform.krs
system ECPlatform {
  label "ECプラットフォーム"

  service OrderService {
    label "注文サービス"
    -> PaymentGateway.PaymentService "決済を依頼する"
  }

  service InventoryService {
    label "在庫管理サービス"
  }

  OrderService -> InventoryService "在庫を確認する"
}
```

```krs
// ec-platform/07-cross-system/payment-gateway.krs
system PaymentGateway {
  label "決済ゲートウェイ"

  service PaymentService {
    label "決済サービス"
    description "クレジットカード・口座振替などの決済処理"
  }

  service FraudDetection {
    label "不正検知サービス"
  }

  PaymentService -> FraudDetection "不正チェックを行う"
}
```

このシナリオにより以下を確認できる:
- `ECPlatform` のビューで `PaymentGateway.PaymentService` が external ghost node として表示される
- `PaymentGateway` のビューは独立して通常どおりレンダリングされる
- `main.krs` からのマルチファイル import と組み合わせた動作

## 未解決の問い

1. **ghost node のラベル**: 実ノードが解決できた場合はそのノードの `label` を使用する。
   解決できなかった場合は修飾名全体（`PaymentGateway.PaymentService`）をフォールバックとして表示する。
2. **service view でのドリルダウン**: ghost external node をクリックした場合、
   対象システムの service view にナビゲートするか、無効（クリック不可）にするか。
   → 今回のスコープ外（別 issue）とする予定。
3. **ドット記法ノード ID**: エッジターゲット以外（例: ノード ID `service A.B`）でも
   ドット記法を許容するか。→ 今回は **エッジターゲットのみ** に限定。

## ghost system のレンダリング（保留）

クロスシステム参照のレンダリングについて設計段階で判明した要件：

- 参照先システム（例: `PaymentGateway`）は参照元システム（ECPlatform）の **外側** に ghost として表示する
  （ECPlatform のコンテナ内に表示するのは誤り）
- ghost システムの中に参照先サービス（`PaymentService`）を子ノードとして表示する
- エッジは ECPlatform 内のサービスから ghost システム内のサービスへ描画する
- `service PaymentGateway [external]` を ECPlatform 内に明示することで
  ghost システムの代わりに ECPlatform 内の単純な外部ノードとして描画できる

この実装には `ViewSlice` への `ghostSystems` / `ghostSystemEdges` フィールド追加と
`layout.ts` のサブレイアウト対応が必要なため、今回の PR では **構文導入のみ** にとどめ、
レンダリングは別 issue で対応する。
