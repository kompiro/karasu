---
type: product
---

# AT-0011: Deploy Node Detail Panel

## 概要

deploy ビューでノードをクリックしたとき、NodeDetailPanel が表示され、
deploy unit の kind・runtime・realizes が正しく表示されることを確認する。

## 前提条件

以下の内容を `index.krs` に記述する:

```
system ECPlatform {
  label "ECプラットフォーム"

  service ECommerce {
    label "ECサイト"
  }
  service Payment {
    label "決済サービス"
  }
}

deploy "本番環境" {
  oci "order-api" {
    runtime "Node.js 20"
    realizes ECommerce
  }
  lambda "mailer" {}
}
```

## 検証手順

### 1. deploy unit のパネル表示（runtime・realizes あり）

> ✅ Automated — `packages/e2e/tests/at-0011-deploy-node-detail-panel.spec.ts` › `clicking a deploy unit with runtime + realizes opens the detail panel`

1. アプリを開き、上記 `.krs` を入力する
2. Deploy タブをクリックしてデプロイビューに切り替える
3. `order-api` ノードをクリックする
4. NodeDetailPanel が表示されること
5. パネルに以下が表示されること:
   - kind アイコン: `🐳`（oci）
   - label: `order-api`
   - runtime: `Node.js 20`
   - realizes: `ECommerce`

### 2. deploy unit のパネル表示（runtime・realizes なし）

> ✅ Automated — `packages/e2e/tests/at-0011-deploy-node-detail-panel.spec.ts` › `clicking a deploy unit without runtime/realizes omits those sections`

1. `mailer` ノードをクリックする
2. NodeDetailPanel が表示されること
3. パネルに以下が表示されること:
   - kind アイコン: `λ`（lambda）
   - label: `mailer`
   - runtime・realizes セクションが表示されないこと

### 3. system ビューへの影響がないこと

> ✅ Automated — `packages/e2e/tests/at-0011-deploy-node-detail-panel.spec.ts` › `system view click still opens the detail panel for a service`

1. System タブをクリックしてシステムビューに切り替える
2. `ECサイト`（ECommerce）ノードをクリックする
3. NodeDetailPanel が表示されること
4. kind アイコン: `⚙`（service）が表示されること
5. runtime・realizes セクションが表示されないこと

## 期待結果

- deploy unit クリックで NodeDetailPanel が開く
- kind / runtime / realizes が正しく表示される
- system ビューの既存動作に影響がない
