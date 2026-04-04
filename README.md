# karasu 鴉

チーム規模のシステムを、テキストで記述・俯瞰するアーキテクチャモデリングツール。

![TypeScript](https://img.shields.io/badge/TypeScript-blue) ![Vite](https://img.shields.io/badge/Vite%20%2B%20React-purple) ![Vitest](https://img.shields.io/badge/Vitest-green)

## なぜ karasu か

複数のリポジトリに分散して開発が進むと、システム全体を俯瞰した図を誰も持たなくなります。Confluence や Notion に書かれたアーキテクチャ図は更新されず、新入社員のオンボーディングで誰かが口頭で説明するか、古い情報をもとに混乱するか、どちらかです。

karasu はアーキテクチャの記述を **アーキテクチャ専用リポジトリに集約し、チームの境界に沿ってファイルを分割・結合できる** ようにすることで、この問題に取り組みます。

| 用途 | 使う人 | 求めていること |
|------|--------|----------------|
| システム設計・進化の議論 | アーキテクト | 全体構造の設計と選択肢の比較 |
| オーナーシップの明示 | チームリード | どのチームが何を担当するかの公式な記述 |
| オンボーディング | 新入社員 | 自チームのドメインと周辺サービスの把握 |

## 設計上の前提

> **karasu はアーキテクチャ専用リポジトリで使うことを前提としています。**
>
> 各サービスの実装リポジトリに .krs ファイルを分散させ、URL で結合する設計は採用していません。import は **相対パスのみ** をサポートします。
>
> 各チームはアーキテクチャリポジトリ内の自チームディレクトリを CODEOWNERS で管理し、そこに .krs ファイルを置いて更新していきます。

## 基本的な使い方

```
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

## リポジトリ構成パターン

```
karasu-architecture/
  ├── index.krs                 ← アーキテクトが所有。全体構造を定義
  ├── teams/
  │   ├── payment/
  │   │   └── service.krs       ← paymentチームが所有・更新
  │   ├── ec/
  │   │   └── service.krs       ← ecチームが所有・更新
  │   └── inventory/
  │       └── service.krs
  └── deploy/
      └── production.krs
```

各チームのディレクトリには CODEOWNERS を設定することで、レビュー権限を分散させながら全体の整合性を保てます。

```
# .github/CODEOWNERS
/teams/payment/   @payment-team
/teams/ec/        @ec-team
/index.krs        @architect
```

## ファイルの結合（import）

import は相対パスのみをサポートします。

```
// index.krs — 名前付き import（特定ブロックのみ取り込む）
import { Payment } from "./teams/payment/service.krs"
import { ECommerce } from "./teams/ec/service.krs"

// ワイルドカード import（ファイル内の全ブロックをマージ）
import "./teams/inventory/service.krs"

system ECPlatform {
  ECommerce -> Payment "決済を処理する"
}
```

## 論理構造と物理構造

`realizes` によって「このデプロイ単位がこのサービスを実現している」を明示します。

```
// teams/ec/service.krs — 論理構造（チームが定義）
service ECommerce {
  domain Order {
    usecase PlaceOrder  { label "注文を受け付ける" }
    usecase CancelOrder { label "注文をキャンセルする" }
  }
}

// deploy/production.krs — 物理構造
deploy "本番環境" {
  oci "api-server" {
    runtime  "Node.js 20"
    realizes ECommerce     // 論理サービスとの対応を明示
  }
  job "monthly-billing" {
    schedule "0 0 1 * *"
    realizes Billing
  }
}
```

## 組織とオーナーシップ

```
organization DevOrg {
  team Platform {
    label "プラットフォームチーム"
    owns ECommerce
    member Alice { slack "@alice" }
  }
}
```

## 図の種類

| タブ | 内容 |
|------|------|
| `System` | 論理図。ダブルクリックで system → service → domain → usecase へドリルダウン |
| `Deploy` | 物理図。デプロイ単位と realizes による論理との対応 |
| `Org` | 組織図。チームと所有サービスの関係 |

## 主な機能

- **論理／物理の分離** — ビジネス構造とデプロイ構造を別図で管理。`realizes` で対応付け
- **ドリルダウン** — ダブルクリックで階層を深掘り。パンくずナビで上位に戻れる。Show All Layers で全階層を一度に表示、Open All Views で全ビューを新ウィンドウで開ける
- **SVG エクスポート** — 全図を一括エクスポート。エクスポートした SVG はブラウザ単体でドリルダウンナビゲーション可能
- **アイコンモード** — System・Deploy・Org 図をアイコン表示に切り替え
- **パネルフォーカス** — サイドバーの折りたたみとプレビューの全画面表示
- **ドメイン分散の検出** — 同じドメイン名が複数サービスに分散していると自動警告
- **タグ・アノテーション** — `[external]` `[human]` `[async]` と `@deprecated` `@new` などに対応
- **スタイル分離** — CSS ライクな `.krs.style` ファイルで見た目を制御
- **VS Code 拡張** — シンタックスハイライト・LSP 診断・SVG プレビュー・双方向ジャンプ

## CLI

```bash
# ローカルサーバーを起動してブラウザでプレビュー
karasu serve ./architecture

# SVG を標準出力へ（stdout → ファイルリダイレクト）
karasu render index.krs > docs/arch.svg

# 特定のビューのみ出力
karasu render index.krs --view deploy --output deploy.svg

# svgo でパイプ最適化
karasu render index.krs | svgo - -o docs/arch.svg
```

## VS Code 拡張

`packages/vscode/` に VS Code 拡張が含まれています。

- `.krs` ファイルのシンタックスハイライト
- LSP による診断（エラー・警告をエディタ内表示）
- SVG プレビュー Webview（ドリルダウンナビゲーション対応）
- エディタ ↔ プレビューの双方向ジャンプ（Cmd/Ctrl+Click）
- ホバー・定義ジャンプなど標準 LSP 機能
- ノード詳細パネル（クロスダイアグラムナビゲーション対応）

## GitHub Actions

CI で `.krs` ファイルから SVG を自動生成するワークフローテンプレートを用意しています。

```yaml
- name: Render architecture diagrams
  run: npx --yes karasu@latest render docs/architecture.krs --output docs/architecture.svg
```

詳細は [`examples/github-actions/`](examples/github-actions/) および [`docs/github-actions.md`](docs/github-actions.md) を参照してください。

## 命名の由来

北欧神話のオーディンの使い魔、ヒギン・ムニン（思考と記憶の鴉）に由来します。世界を俯瞰して情報を集め、必要な場所へ降りていく鴉の姿が、ドリルダウン型アーキテクチャ把握のコンセプトと重なります。

## ドキュメント

| 内容 | 場所 |
|------|------|
| .krs 構文リファレンス | `docs/spec/syntax.md` |
| .krs.style 構文リファレンス | `docs/spec/style.md` |
| タグ・アノテーション一覧 | `docs/spec/tags-annotations.md` |
| コアコンセプト | `docs/concepts.md` |
| 設計判断の経緯（ADR） | `docs/adr/` |
| GitHub Actions 連携ガイド | `docs/github-actions.md` |
| サンプル `.krs` ファイル | `examples/` |

## リポジトリ構成

```
karasu/
├── docs/                  ← 仕様・設計ドキュメント
├── examples/              ← サンプル .krs ファイル（チュートリアル・テーマ別シナリオ）
├── packages/
│   ├── core/              ← パーサー・スタイル解決・SVGレンダラー（Pure TS）
│   ├── app/               ← Vite + React のプレビューUI
│   ├── cli/               ← karasu serve / render コマンド
│   ├── lsp/               ← Language Server Protocol 実装
│   └── vscode/            ← VS Code 拡張
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
| CLI                    | commander     |
| 言語サーバー           | LSP（vscode-languageserver） |

## インスピレーション

C4 Model に触発されつつも、独自の語彙と論理／物理分離のコンセプトを採用しています。
