---
id: ADR-20260404-09
title: "クロスシステムサービス参照 — ドット記法（`SystemId.ServiceId`）"
status: accepted
date: 2026-04-04
topic: edges
depends_on:
  - ADR-20260405-03
related_to:
  - ADR-20260405-07
scope:
  packages:
    - core
  domains:
    - parser
    - rendering
    - edges
---

# ADR-20260404-09: クロスシステムサービス参照 — ドット記法（`SystemId.ServiceId`）

- **日付**: 2026-04-04
- **ステータス**: 決定済み
- **関連**: Issue #285, [ADR-20260405-03](20260405-03-wildcard-import-two-pass-resolution.md), [ADR-20260405-07](20260405-07-ghost-system-rendering.md)

## 背景

従来、`->` エッジのターゲットは同一システム内の子ノード ID のみが有効で、`view-extract.ts` の `childIds.has(e.to)` フィルタによりターゲットが別システムに属するエッジはビュー構築時に無視されていた。実際のアーキテクチャでは「ECPlatform から PaymentGateway を呼び出す」といったクロスシステム依存は一般的だが、現行構文では記述する手段がなかった。

## 決定

**ドット記法**（`SystemId.ServiceId`）をエッジターゲットに導入する。パーサーは `Identifier DOT Identifier` のシーケンスを検出し、`"PaymentGateway.PaymentService"` という単一文字列として `KrsEdge.to` に格納する。

```krs
system ECPlatform {
  service OrderService {
    -> PaymentGateway.PaymentService "決済を依頼する"
  }
}
system PaymentGateway {
  service PaymentService { }
}
```

### レンダリング方針

本 ADR のスコープは**構文導入のみ**。クロスシステム参照のレンダリング（ghost system ボックス、`ViewSlice.ghostSystems` / `ghostSystemEdges` フィールド追加、サブレイアウト対応）は [ADR-20260405-07](20260405-07-ghost-system-rendering.md)（Issue #328）で扱う。

### 警告抑制

参照元システムに同じベア ID かつ `[external]` タグを持つ子ノードが明示宣言されていれば警告を抑制する：

```krs
system ECPlatform {
  service PaymentService [external]           // 明示宣言 → 警告なし
  service OrderService {
    -> PaymentGateway.PaymentService
  }
}
```

### 未解決参照

`PaymentGateway` または `PaymentGateway.PaymentService` が解決できない場合も図の描画は継続し、warning を出力する（エラーにしない）。

### examples 追加

`examples/ec-platform/07-cross-system/` にマルチファイル import と組み合わせたクロスシステム参照のシナリオを追加する。

## 理由

- **`KrsEdge.to` の型変更が不要**: `string` のまま保持でき、修飾名判定は `includes('.')` で済む
- **変更量が最小**: Lexer に Dot トークンを追加、Parser でエッジターゲットを拡張するだけで完結
- **意図が構文から明示される**: 「どのシステムのサービスか」がコードを読むだけで判る
- **名前衝突への耐性**: `System.Service` で一意になり、ワイルドカード import のような暗黙的解決の落とし穴がない
- **単独ファイルでも動作**: `@import` を経由しなくてもクロスシステム参照が書ける
- **既存 `[external]` 構文との延長**: 外部参照の明示宣言は既存の `service X [external]` パターンをそのまま使える

## 却下した案

### 案2: エイリアス宣言（`alias PaymentService from PaymentGateway`）

新キーワード `alias` の追加が必要で、宣言と使用の 2 箇所管理が冗長。スコープ解決の複雑性も増す。

### 案3: `@import` スコープ内での自動解決

既存エッジ構文を変えずに済む利点はあるが、複数ファイルに同名サービスがある場合の名前衝突解決が困難で、暗黙的な参照解決はデバッグを困難にする。単独ファイルでのクロスシステム参照ができない。

## 残課題（別 Issue）

- **ghost node のラベル**: 実ノードが解決できればそのノードの `label`、未解決なら修飾名全体をフォールバック
- **ghost external node のドリルダウン**: クリック時に対象システムにナビゲートするか無効にするか
- **ドット記法ノード ID**: エッジターゲット以外での許容は対象外
