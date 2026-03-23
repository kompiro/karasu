# コアコンセプト

## 論理構造と物理構造の分離

karasu の設計の根幹となる考え方。

### 論理構造（What / Why）

**何を・なぜ** の観点でシステムを記述する。

```
system → service → domain → usecase → resource
```

- `system`：owned/external なサービスの関係を示す器
- `service`：独立したビジネス機能の単位
- `domain`：サービス内のビジネス上の関心事の境界（DDD の Bounded Context に近い）
- `usecase`：ドメイン内の業務・操作
- `resource`：usecase が操作する対象（テーブル、外部API、ファイル等）

### 物理構造（How）

**どのように** 動いているかを記述する。論理構造とは別の `.krs` ファイルに分離する。

```
deploy → war / oci / job / ...
```

### realizes による対応付け

物理と論理の対応は `realizes` で明示する。

```
oci "order-service":
  realizes: ECommerce   // 物理（具象）→ 論理（抽象）
```

UMLのRealization関係に対応。「このデプロイ単位がこのサービスを実現している」という宣言。

---

## ドリルダウン型アーキテクチャ把握

ツール名「karasu（鴉）」の由来でもあるコンセプト。
世界を俯瞰して情報を集め、必要な場所へ降りていく鴉のように、
図をドリルダウンしながらアーキテクチャを把握していく。

```
system（全体俯瞰）
  └─ service（ビジネス機能）
       └─ domain（関心事の境界）
            └─ usecase（業務）
                 └─ resource（操作対象）
```

任意のノードからドリルダウンして詳細図へ遷移できる。
インラインネストで記述し、育ったら外部ファイルに extract する。

---

## ドメイン分散の検出

DDD の観点から、同じドメインが複数のサービスにまたがることは設計上の問題シグナル。
karasu はこれを自動検出して警告を出す。

```
⚠ Warning: domain "受注" が複数の service に分散しています
  - ECommerce
  - Legacy
  ドメインの凝集性を確認してください
```

---

## C4 Model との違い

karasu は C4 Model に触発されつつも独自の語彙を採用している。

| C4 Model        | karasu                | 変更理由                           |
| --------------- | --------------------- | ---------------------------------- |
| Context Diagram | `system`              | "context" は意味が曖昧             |
| Container       | `service`             | ビジネス機能の単位であることを明示 |
| Component       | `domain`              | ドメイン境界であることを明示       |
| Code            | `usecase`             | 業務・操作の単位を表現             |
| （なし）        | `resource`            | usecase が操作する対象を明示       |
| （なし）        | `deploy` / `realizes` | 物理構造を論理構造と分離して表現   |
