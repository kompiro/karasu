# resource と database の設計

- **日付**: 2026-04-05
- **ステータス**: 検討中
- **関連**: `docs/spec/syntax.md`, `docs/concepts.md`, Issue #316

## 背景・課題

現在の karasu では `resource` は `usecase` 配下にのみ存在できる。

```
system → service → domain → usecase → resource
```

しかし実際のアーキテクチャでは、`resource`（テーブル、キュー、ストレージ等）は次の二つの顔を持つ：

- **UseCase 図**: usecase が操作する依存先（実装詳細）
- **System 図**: service と並ぶインフラ構成要素（DB・キュー・外部 API）

この二重性に対して、karasu の語彙とレンダリングをどう設計するかを検討する。

## 制約・前提

- karasu の原則「**論理 = What/Why、物理 = How**」を維持する
- DRY：同じ概念を二箇所に書かせない
- 「書きながら設計を詰めていく」途中の未確定状態を許容する（既存ポリシー）
- 既存の階層構造（`system` 直下に `service`・`user` が並ぶ）との整合性を保つ

## 検討した選択肢

### 案 A: 暗黙的プロモーション

`usecase` 内の `resource` を System ビュー描画時に自動昇格させる。

```krs
usecase B {
  resource C { label "注文テーブル" }  // System 図に自動昇格
}
```

- **Pro**: DRY。一箇所に書けば両方の図に出る
- **Con**: System 図に全 resource が出て制御不能になる

### 案 B: resource のトップレベル化 + ID 参照

`resource` を `system` や `service` レベルで宣言し、`usecase` 内では ID 参照する。

```krs
system ECPlatform {
  resource OrderDB.C { label "注文テーブル" }  // system 直下
  service A {
    domain X {
      usecase B {
        resource OrderDB.C   // 参照
      }
    }
  }
}
```

- **Pro**: 明示的
- **Con**: 定義が散らばる可能性。`service` 直下に resource を置くと「担当 domain」との概念コンフリクトが起きる

### 案 C（採用方針）: `database` を system 直下のファーストクラスノードにする

`database` を `service`・`user` と同階層の system 直下ノードとして導入し、  
`usecase` 内では `resource DatabaseId.TableId` のドット記法で参照する。

```krs
system ECPlatform {
  database OrderDB {                        // 定義（system 直下）
    table C { label "注文テーブル" }
    table D { label "在庫テーブル" }
  }

  service A {
    domain X {
      usecase B {
        resource OrderDB.C                  // 参照
        resource OrderDB.D
      }
      usecase F {
        resource OrderDB.C
      }
      usecase E {
        resource OrderDB.D
      }
    }
  }
}
```

- **Pro**: 定義が一箇所に集まる。`service` 直下との概念コンフリクトがない。System 図に `database` ノードが自然に現れる
- **Pro**: `service → database` エッジを自動導出できる（usecase の resource 参照を集約）
- **Con**: `database` ブロックを先に定義しなければならない（ボトムアップ設計との摩擦）

## 設計ライフサイクル：ボトムアップ設計への対応

実際の設計作業は「usecase を書きながら resource を発見する」ボトムアップの流れになる。
これは既存の「未割り当て domain」パターンと同じ問題であり、同じ解法を適用できる。

### フェーズ 1: 発見期（database 未定）

```krs
usecase B {
  resource C { label "注文テーブル" }   // どの database か未定
  resource D { label "在庫テーブル" }
}
```

警告を出すにとどめる（エラーにしない）：
```
⚠ resource "C" is not assigned to any database
```

System 図には `C` が孤立ノードとして現れる（または非表示）。

### フェーズ 2: グループ化期（database 命名・昇格）

C と D が同じ DB に属すると気づいたら `database` ブロックを宣言し、参照に昇格：

```krs
system ECPlatform {
  database OrderDB {
    table C { label "注文テーブル" }
    table D { label "在庫テーブル" }
  }

  service A {
    domain X {
      usecase B {
        resource OrderDB.C   // dot notation に昇格
        resource OrderDB.D
      }
    }
  }
}
```

### フェーズ 3: 完成（System 図に反映）

```
[Service A] ──→ [OrderDB]
```

`usecase → resource` の参照を集約して `service → database` エッジを自動描画。

## 既存パターンとの対称性

| 定義する場所 | 定義 | 参照する場所 | 参照 |
|---|---|---|---|
| `system` 直下 | `service ECommerce {}` | エッジ | `ECommerce -> Payment` |
| `system` 直下 | `database OrderDB { table C }` | `usecase` 内 | `resource OrderDB.C` |
| 別 system | `service PaymentService {}` | エッジ | `-> PaymentGateway.PaymentService` |

ドット記法は「**親.子**」で所属を表現する点で統一されている。

## System 図・UseCase 図での見え方

**System 図**
```
[Service A] ──→ [OrderDB]
```
複数 service が同じ `database` を参照していれば共有関係が自然に現れる：
```
[Service A] ─→ [OrderDB] ←─ [Service B]
```

**UseCase 図（Service A にドリルダウン）**
```
[Usecase B] → [Table C]
             → [Table D]
[Usecase F] → [Table C]
[Usecase E] → [Table D]
```

## 未解決の問い

1. **`queue` や `storage` も同じ二層構造にするか？**
   - `queue EventBus { topic OrderCreated {} }` → `resource EventBus.OrderCreated`
   - 一貫性のためには同じ構造が望ましい

2. **`table` 以外のサブリソースの命名**
   - `database` → `table`
   - `queue` → `topic`（Kafka）/ `queue`（SQS）
   - `storage` → `bucket` / `object`
   - それとも `resource` で統一するか

3. **未割り当て resource の System 図での表示方針**
   - 孤立ノードとして表示する？非表示にする？

4. **`database` ブロックが存在しない場合の `resource OrderDB.C` の扱い**
   - 未解決参照として警告のみ？エラー？

5. **`service` 直下への `database` 配置は許容するか？**
   - 「DB per service」パターンへの対応
   - 現時点の方針では `system` 直下のみとする（service の担当 domain との概念コンフリクトを避けるため）
