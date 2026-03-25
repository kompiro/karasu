---
type: product
---

# AT-0007: Deployment Diagram

## 概要

deploy ブロックを持つ `.krs` ファイルを開いたとき、deploy 図が正しく表示され、
system 図と行き来できることを確認する。

## 前提条件

以下の内容を `index.krs` に記述する:

```
system ECPlatform {
  label "ECプラットフォーム"

  service ECommerce {
    label "ECサイト"
    description "商品管理と注文処理"
  }
  service Payment {
    label "決済サービス"
    description "クレジットカード決済処理"
  }

  ECommerce -> Payment "決済を処理する"
}

deploy "本番環境" {
  oci "order-api" {
    runtime "Node.js 20"
    realizes ECommerce
  }
  oci "order-worker" {
    runtime "Node.js 20"
    realizes ECommerce
  }
  oci "payment-svc" {
    runtime "Go 1.22"
    realizes Payment
  }
  job "data-migration" {
    runtime "Python 3.12"
  }
}
```

---

## AT-0007-01: Deploy タブが有効になる

**手順**
1. 上記の `index.krs` を持つプロジェクトを開く

**期待結果**
- プレビューペイン上部に「System」「Deploy」タブが表示される
- 両タブが有効（クリック可能）な状態である

---

## AT-0007-02: Deploy 図のコンテナグループ化

**手順**
1. 「Deploy」タブをクリックする

**期待結果**
- `ECサイト` ラベルのコンテナが表示され、`order-api` と `order-worker` が内側に含まれる
- `決済サービス` ラベルのコンテナが表示され、`payment-svc` が内側に含まれる
- `Unclassified` ラベルのコンテナが表示され、`data-migration` が内側に含まれる
- 各ノードに `runtime` の値がセカンダリテキストとして表示される（例: "Node.js 20"）
- 各ノードに種別バッジが表示される（例: "oci", "job"）

---

## AT-0007-03: Ghost エッジの表示

**手順**
1. 「Deploy」タブを表示する

**期待結果**
- `ECサイト` コンテナと `決済サービス` コンテナの間に半透明の破線エッジが表示される
- エッジに "決済を処理する" ラベルが付いている

---

## AT-0007-04: Deploy → System クロスナビゲーション

**手順**
1. 「Deploy」タブを表示する
2. `決済サービス` コンテナ（または内側のノード以外の領域）をクリックする

**期待結果**
- 自動的に「System」タブに切り替わる
- `Payment`（決済サービス）ノードがハイライト（ドロップシャドウ）される
- 別のノードをクリックするか別の操作をするまでハイライトが維持される

---

## AT-0007-05: Deploy タブなし（deploy ブロックなし）

**手順**
1. 以下の `deploy` ブロックを含まない `index.krs` を開く:

```
system ECPlatform {
  label "ECプラットフォーム"

  service ECommerce {
    label "ECサイト"
  }
  service Payment {
    label "決済サービス"
  }

  ECommerce -> Payment "決済を処理する"
}
```

**期待結果**
- 「Deploy」タブがグレーアウトして表示される
- グレーアウトされたタブにカーソルを合わせると「deploy ブロックがありません」ツールチップが表示される
- タブはクリックできない（状態が変わらない）

---

## AT-0007-06: ズーム・パンの動作

**手順**
1. 「Deploy」タブを表示する
2. マウスホイールでズームする
3. ドラッグでパンする

**期待結果**
- System 図と同様にズーム・パンが動作する

---

## AT-0007-07: タブボタンのラベル

**期待結果**
- System タブ・Deploy タブの両方にアイコン＋テキストラベルが表示される

---

## AT-0007-08: ファイル切り替え時のリセット

**手順**
1. 「Deploy」タブを表示する
2. 別のファイルを選択する

**期待結果**
- 「System」タブに自動的に戻る
