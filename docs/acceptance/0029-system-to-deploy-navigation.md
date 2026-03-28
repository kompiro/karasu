---
type: product
---

# AT-0029: System ↔ Deploy / Org Cross-Navigation

## 概要

system 図のサービスノードから deploy 図・org 図へのクロスナビゲーション、および
org 図の team ノードから system 図へのクロスナビゲーションを確認する。

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
  service Legacy {
    label "旧システム"
  }

  ECommerce -> Payment "決済を処理する"
}

deploy "本番環境" {
  oci "order-api" {
    runtime "Node.js 20"
    realizes ECommerce
  }
  oci "payment-svc" {
    runtime "Go 1.22"
    realizes Payment
  }
}

organization Corp {
  team ecTeam {
    label "EC開発チーム"
    owns ECommerce
    owns Payment
  }
}
```

---

## AT-0029-01: Deploy ボタンがサービスノードに表示される

**手順**
1. 「System」タブを表示する

**期待結果**
- `ECサイト` ノードの右上に青い「D」ボタン（円）が表示される
- `決済サービス` ノードにも「D」ボタンが表示される
- `旧システム`（deploy コンテナなし）には「D」ボタンが表示されない

---

## AT-0029-02: D ボタンクリックで Deploy 図にジャンプしてハイライト

**手順**
1. 「System」タブで `ECサイト` ノードの「D」ボタンをクリックする

**期待結果**
- 自動的に「Deploy」タブに切り替わる
- `ECサイト` に対応するコンテナ（order-api）がハイライトされる
- 別の操作をするまでハイライトが維持される

---

## AT-0029-03: チームラベルがクリッカブルになっている

**手順**
1. 「System」タブで `ECサイト` ノードを確認する

**期待結果**
- ノード下部の「👥EC開発チーム」テキストがクリッカブル（カーソルがポインターになる）

---

## AT-0029-04: チームラベルクリックで Org 図にジャンプしてハイライト

**手順**
1. 「System」タブで `ECサイト` ノードの「👥EC開発チーム」をクリックする

**期待結果**
- 自動的に「Org」タブに切り替わる
- 「EC開発チーム」チームノードがハイライトされる

---

## AT-0029-05: NodeDetailPanel に Deploy ジャンプリンクが表示される

**手順**
1. 「System」タブで `ECサイト` ノードの「i」ボタン（info）をクリックする

**期待結果**
- NodeDetailPanel が開く
- 「🚀 Deploy 図で確認 →」ボタンが表示される

---

## AT-0029-06: NodeDetailPanel の Deploy リンクをクリックしてジャンプ

**手順**
1. NodeDetailPanel を開く（AT-0029-05 の手順）
2. 「🚀 Deploy 図で確認 →」をクリックする

**期待結果**
- Deploy タブに切り替わる
- 対応するコンテナがハイライトされる
- パネルが閉じる

---

## AT-0029-07: NodeDetailPanel に Org ジャンプリンクが表示される

**手順**
1. 「System」タブで `ECサイト` ノードの info ボタンをクリックする

**期待結果**
- NodeDetailPanel 内に「👥 EC開発チーム →」ボタンが表示される（クリッカブル）

---

## AT-0029-08: deploy コンテナのないサービスには Deploy ボタン/リンクが表示されない

**手順**
1. `旧システム` ノードの info ボタンをクリックする

**期待結果**
- 「D」ボタンが表示されない
- NodeDetailPanel にも「Deploy 図で確認」ボタンが表示されない

---

## AT-0029-09: ズーム・パン中は誤クリックしない

**手順**
1. System 図をドラッグしてパンする

**期待結果**
- パン操作中にタブ切り替えが発生しない
