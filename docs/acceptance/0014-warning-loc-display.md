# AT-0014: WarningPanel に loc 情報を表示

## 概要

`Warning.loc` が存在する場合、WarningPanel に `Line N:` 形式で行番号を表示する。

## 前提条件

- karasu アプリが起動していること (`npm run dev`)

## 手動確認手順

### ケース1: loc なし Warning の表示

1. エディタに以下を入力する:

```
system "Example" {
  service "payments" { domain "billing" }
  service "orders" { domain "billing" }
}
```

2. WarningPanel に `domain "billing" appears under multiple services` のような info 通知が表示される（ℹ アイコン）
3. **確認**: 行番号プレフィックス（`Line N:`）が**表示されない**こと

### ケース2: loc あり Warning の表示

1. エディタに以下を入力する:

```
deploy "prod" {
  node "api" {}
}
```

2. WarningPanel に `missing-runtime` / `missing-realizes` の警告が表示される
3. **確認**: `Line N: デプロイノード "api" に runtime が指定されていません` のように行番号プレフィックスが表示されること

## 自動テスト

`packages/app/src/components/WarningPanel.test.tsx` に以下のケースが含まれる:

- `loc` なし: メッセージのみ表示、`Line` プレフィックスなし
- `loc` あり (`start.line: 12`): `Line 12: <メッセージ>` 形式で表示
