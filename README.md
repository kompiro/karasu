# karasu（鴉）

テキストベースのアーキテクチャモデリングツール。
C4 Model に触発されつつも独自の語彙を持ち、**論理構造と物理構造を分離**して表現します。

## 命名の由来

北欧神話のオーディンの使い魔ヒギン・ムニン（思考と記憶の鴉）に由来します。
世界を俯瞰して情報を集め、必要な場所へ降りていく鴉の姿が、ドリルダウン型アーキテクチャ把握のコンセプトと重なります。

## 概要

karasu は `.krs` ファイルにアーキテクチャを記述し、SVG 図として可視化するツールです。

```krs
system ECPlatform {
  label "ECプラットフォーム"

  user Customer [human]              { role "購入者" }
  service ECommerce                  { label "ECサイト" }
  service Payment [external]         { label "決済サービス" }
  service Inventory [external] @deprecated { label "在庫管理（旧）" }

  Customer  ->  ECommerce "商品を購入する"
  ECommerce ->  Payment   "決済を処理する"
  ECommerce --> Inventory "在庫を同期する"
}
```

## 主な特徴

- **論理／物理の分離** — ビジネス構造（`system` / `service` / `domain` / `usecase`）と、デプロイ構造（`deploy` / `oci` / `war` / `job` ...）を別図で管理
- **`realizes` による対応付け** — 「このデプロイ単位がこのサービスを実現している」をUMLのRealization関係で明示
- **ドリルダウン** — ダブルクリックで `system` → `service` → `domain` → `usecase` の階層を深掘り。パンくずナビゲーションで上位に戻れる
- **ドメイン分散の検出** — 同じドメイン名が複数の service に分散している場合に自動警告
- **スタイル分離** — CSS ライクな `.krs.style` ファイルで見た目を制御
- **組織図** — `organization` / `team` / `member` で組織構造と所有関係（`owns`）を可視化
- **タグ・アノテーション** — `[external]`, `[async]`, `[human]`, `[ai]` などのタグと `@deprecated`, `@new`, `@experimental` などのアノテーション
- **ノード詳細表示** — ホバー / クリックでノードの説明・リンク・タグを確認

## 図の種類

karasu は 3 種類の図を生成します。UI 上のタブ（System / Deploy / Org）で切り替えて確認できます。

### 論理図（System ビュー）

ビジネス構造をドリルダウンで把握する。

```krs
// main.krs — system 全体像
system ECPlatform {
  label "ECプラットフォーム"
  user Customer [human]      { role "購入者" }
  service ECommerce          { label "ECサイト" }
  service Payment [external] { label "決済サービス" }
  Customer  ->  ECommerce "商品を購入する"
  ECommerce ->  Payment   "決済を処理する"
}

// ecommerce.krs — サービス内部をドリルダウン
service ECommerce {
  domain Order {
    label "受注"
    usecase PlaceOrder  { label "注文を受け付ける" }
    usecase CancelOrder { label "注文をキャンセルする" }
  }
}
```

### 物理図（Deploy ビュー）

デプロイ単位と実行環境を記述する。

```krs
// deploy.krs
deploy "本番環境" {
  oci "api-server" {
    runtime  "Node.js 20"
    realizes ECommerce
  }
  lambda "notifier" {
    runtime  "Python 3.12"
    realizes Notification
  }
  job "monthly-billing" {
    schedule "0 0 1 * *"
    runtime  "Java 21"
    realizes Billing
  }
}
```

### 組織図（Org ビュー）

チーム構造とサービスの所有関係を記述する。

```krs
// org.krs
organization DevOrg {
  label "開発組織"
  team Platform {
    label "プラットフォームチーム"
    owns ECommerce
    member Alice { slack "@alice" }
  }
}
```

## ドキュメント

| ドキュメント                        | 場所                                                           |
| ----------------------------------- | -------------------------------------------------------------- |
| .krs 構文リファレンス               | [docs/spec/syntax.md](docs/spec/syntax.md)                     |
| .krs.style 構文リファレンス         | [docs/spec/style.md](docs/spec/style.md)                       |
| タグ・アノテーション一覧            | [docs/spec/tags-annotations.md](docs/spec/tags-annotations.md) |
| コアコンセプト（論理/物理分離など） | [docs/concepts.md](docs/concepts.md)                           |
| 設計判断の経緯（ADR）               | [docs/adr/](docs/adr/)                                         |

## リポジトリ構成

```
karasu/
├── docs/                  ← 仕様・設計ドキュメント
├── packages/
│   ├── core/              ← パーサー・スタイル解決・SVGレンダラー（Pure TS）
│   └── app/               ← Vite + React のプレビューUI
├── package.json           ← npm workspaces 設定
└── tsconfig.json
```

## 技術スタック

| 用途                   | 技術          |
| ---------------------- | ------------- |
| 言語                   | TypeScript    |
| ビルド（app）          | Vite          |
| UIフレームワーク       | React         |
| エディタコンポーネント | Monaco Editor |
| テスト                 | Vitest        |

## インスピレーション

[C4 Model](https://c4model.com/) に触発されつつも、独自の語彙と論理／物理分離のコンセプトを採用しています。
