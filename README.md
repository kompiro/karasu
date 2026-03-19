# karasu（鴉）

テキストベースのアーキテクチャモデリングツール。
C4 Model に触発されつつも独自の語彙を持ち、**論理構造と物理構造を分離**して表現します。

## 命名の由来

北欧神話のオーディンの使い魔ヒギン・ムニン（思考と記憶の鴉）に由来します。
世界を俯瞰して情報を集め、必要な場所へ降りていく鴉の姿が、ドリルダウン型アーキテクチャ把握のコンセプトと重なります。

## 概要

karasu は `.krs` ファイルにアーキテクチャを記述し、SVG 図として可視化するツールです。

```krs
system "ECプラットフォーム" {
  user  Customer  "顧客"
  service ECommerce "ECサイト"
  service Payment   "決済サービス" [external]

  Customer  ->  ECommerce "商品を購入する"
  ECommerce ->  Payment   "決済を処理する"
}
```

## 主な特徴

- **論理／物理の分離** — ビジネス構造（`system` / `service` / `domain` / `usecase`）と、デプロイ構造（`deploy` / `oci` / `war` / `job` ...）を別図で管理
- **`realizes` による対応付け** — 「このデプロイ単位がこのサービスを実現している」をUMLのRealization関係で明示
- **ドリルダウン** — `system` → `service` → `domain` → `usecase` の階層をドリルダウンしながら把握
- **ドメイン分散の検出** — 同じドメイン名が複数の service に分散している場合に自動警告
- **スタイル分離** — CSS ライクな `.krs.style` ファイルで見た目を制御

## ドキュメント

| ドキュメント                        | 場所                                                           |
| ----------------------------------- | -------------------------------------------------------------- |
| .krs 構文リファレンス               | [docs/spec/syntax.md](docs/spec/syntax.md)                     |
| .krs.style 構文リファレンス         | [docs/spec/style.md](docs/spec/style.md)                       |
| タグ・アノテーション一覧            | [docs/spec/tags-annotations.md](docs/spec/tags-annotations.md) |
| コアコンセプト（論理/物理分離など） | [docs/design/concepts.md](docs/design/concepts.md)             |
| 設計判断の経緯（ADR）               | [docs/design/adr/](docs/design/adr/)                           |
| 実装予定の機能                      | [docs/features/planned/](docs/features/planned/)               |
| 検討中のアイデア                    | [docs/features/ideas/](docs/features/ideas/)                   |

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
