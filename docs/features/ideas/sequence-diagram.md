# シーケンス図のサポート

## アイデア概要

`usecase` からドリルダウンした先としてシーケンス図を描けるようにする。

## 動機

業務フローを `usecase` で定義した後、その実装の詳細（どのサービスがどの順番で呼び出されるか）を
シーケンス図として記述できると、論理→物理の連続したドキュメントになる。

## 検討中の構文（草案）

```
usecase "注文を受け付ける" {
  sequence {
    Customer   -> OrderService   "POST /orders"
    OrderService -> InventoryService "在庫確認"
    InventoryService -> OrderService "OK"
    OrderService -> PaymentService  "決済リクエスト"
    PaymentService   -> OrderService  "決済完了"
    OrderService -> Customer   "注文確認メール"
  }
}
```

## 課題

- `.krs` の構文と整合性を保てるか
- 既存の Mermaid シーケンス図との差別化
- レンダリングの複雑度が大幅に上がる

## ステータス

未決定。まずはコアの論理・物理図の実装を優先する。
