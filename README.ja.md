# karasu 鴉

<p align="center">
  <img src="packages/app/public/karasu-logo-1200w.png" alt="karasu logo" width="640" />
</p>

> [English](README.md) · **日本語**（このファイル）

**システムの論理・物理・組織を一つの言語で描き、
チームとアーキテクチャを一緒に設計するためのテキストベース DSL。**

## 何が違うのか

- **論理・物理・組織の三面構造** —
  サービスとドメインの論理関係、デプロイされる物理アーティファクト、
  チームが所有する範囲を一つの `.krs` 言語で記述できる。
  Conway の法則と逆コンウェイ戦略を同じテーブルで議論するための設計
- **scoped glance + drill-down** —
  一度に見せる情報量を限定し、必要な詳細があればその場所へ降りる。
  全体を 1 枚に押し込む "at a glance" な鳥瞰図ではなく、
  認知負荷を抑えるための意図的な設計選択
- **人間と AI が共同編集できる DSL** —
  `.krs` は AI のために設計されたのではなく、人間が読み書きする独立した道具。
  その独立性が双方向性を生む — AI が生成した `.krs` を人間が手で編集でき、
  逆に手書きしたモデルを AI に洗練させられる

C4 Model / Structurizr / Mermaid からインスピレーションを受けつつも、
drill-down の連続性・組織の第三軸・AI との協働という点で異なる立ち位置を取っています。
設計思想の詳細は [`docs/concepts.md`](docs/concepts.md) を参照。

## 試す

ブラウザですぐに試せます: **<https://karasu.pages.dev/>**

Getting Started を含む `ec-platform` の段階別チュートリアルが初回起動時に自動ロードされます。ブラウザのロケールに合わせて日本語版と英語版のシードが自動選択されるため、違和感なく読み進められます。`.krs` の編集・プレビュー・ドリルダウン・SVG エクスポートをその場で体験できます。AI チャット機能を使う場合は Settings タブから Claude API キー (BYOK) を入力してください — キーはブラウザの `sessionStorage` に保存され、外部サーバーには送信されません。

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
| `Org` | 組織図。チームと所有サービスの関係。Tree View モードで全体俯瞰も可能 |
| `Diff` | 2 つの `.krs` ファイルを比較するグラフィカル差分表示。基準ファイルと比較ファイルを選ぶと、追加／削除／変更されたノードが System 図上でハイライト表示される（Phase 1） |

## Chat UI と AI アシスタント

`Chat` タブで Claude API を使った対話型モデリングが行えます。API キーはユーザーが用意する **BYOK 方式**（Bring Your Own Key）で、ブラウザ内で完結しサーバーには送信されません。

```
1. Settings タブで Claude API キーを入力
2. Chat タブを開くと、現在の ViewPath に合わせた構造化インタビューが開始
3. AI が提案する .krs パッチは Apply / Reject を選んでから適用
```

- **スコープ連動**: ドリルダウン位置が変わると AI の質問スコープも追随する
- **tool_use**: AI は自然言語ではなく `navigate_view` / `apply_krs_patch` で意図を返す
- **競合検知**: パッチ提案後にユーザーが編集すると Apply ボタンが自動無効化される
- **セキュリティ**: キーはデフォルトで `sessionStorage` に保存。オプトインで `localStorage` に永続化できる

## 主な機能

- **論理／物理の分離** — ビジネス構造とデプロイ構造を別図で管理。`realizes` で対応付け
- **ドリルダウン** — ダブルクリックで階層を深掘り。パンくずナビで上位に戻れる。Show All Layers で全階層を一度に表示、Open All Views で全ビューを新ウィンドウで開ける
- **グラフィカル差分ビューア** — 2 つの `.krs` ファイルを並べて比較し、追加／削除／変更されたノードを System 図上でハイライト表示
- **SVG / draw.io エクスポート** — 全図を一括 SVG エクスポート（エクスポート SVG はブラウザ単体でドリルダウン可能）、または draw.io (mxGraph XML) 形式に書き出してレイアウトを細部まで調整できる
- **トップレベル インフラブロック** — `service` / `database` / `queue` / `storage` を `system` で囲わずファイル直下に書ける。デプロイ中心のファイルが単体で描画可能
- **アイコンモード** — System・Deploy・Org 図をアイコン表示に切り替え
- **パネルフォーカス** — サイドバーの折りたたみとプレビューの全画面表示
- **ドメイン分散の検出** — 同じドメイン名が複数サービスに分散していると自動警告
- **移行期のドメイン共存** — `@deprecated` / `@migration_target` で旧新ドメインを同時に描画
- **タグ・アノテーション** — `[external]` `[human]` `[async]` と `@deprecated` `@new` などに対応
- **スタイル分離** — CSS ライクな `.krs.style` ファイルで見た目を制御
- **マルチファイルプロジェクト** — `import` と `import "dir/"` による相対パス結合、クロスファイル navigation/ジャンプ対応
- **クロスシステム参照** — `PaymentGateway.PaymentService` のドット記法で別システムのサービスを参照
- **ドメイン間依存** — `domain` ブロック内で `-> TargetDomain` を宣言し、サービス間エッジとして自動派生
- **ProjectMode の ZIP 入出力** — ブラウザ内で保持するプロジェクトを ZIP として書き出し／取り込み可能
- **Chat UI + BYOK AI アシスタント** — Claude API キー (BYOK) を入力し、`.krs` を対話的に育てる構造化インタビュー
- **`.krs` フォーマッター** — `karasu fmt` / LSP / エディタの Format ボタン (Shift+Alt+F) でコメントを保持しつつ整形
- **VS Code 拡張** — シンタックスハイライト・LSP 診断・SVG プレビュー・双方向ジャンプ・アイコンモードトグル
- **多言語対応（日本語 / 英語）** — UI 文言・診断メッセージ・警告・Chat のツール説明・Chat システムプロンプトは Settings のロケール選択に追随する

## CLI

### プレビュー・レンダリング

```bash
# ローカルサーバーを起動してブラウザでプレビュー
karasu serve ./architecture

# SVG を標準出力へ（stdout → ファイルリダイレクト）
karasu render index.krs > docs/arch.svg

# 特定のビューのみ出力
karasu render index.krs --view deploy --output deploy.svg

# svgo でパイプ最適化
karasu render index.krs | svgo - -o docs/arch.svg

# draw.io (mxGraph XML) に書き出して細部までレイアウト調整する
karasu render index.krs --format drawio --output arch.drawio
```

### フォーマット

```bash
# in-place で整形
karasu fmt **/*.krs

# CI 用（差分があれば exit 1）
karasu fmt --check **/*.krs

# パイプで受け取って stdout に出力
cat service.krs | karasu fmt --stdin
```

### 既存システムの再アーキテクチャリング

`karasu translate` は、**既存システムの構造を karasu の語彙に引き上げて俯瞰する** ためのコマンドです。対象の 4 つのフォーマットはそれぞれ、既存システムを別の角度から捉える入力として選んでいます:

| 入力                 | 何を得られるか                                 |
| -------------------- | ---------------------------------------------- |
| Docker Compose       | サービスの実行トポロジとリソース境界           |
| Kubernetes マニフェスト | コンテナ化された実行単位と間の依存関係       |
| OpenAPI スキーマ     | サービスが公開する API の境界と責務（RESTful な操作は 1 つのリソース `usecase` にまとめられる） |
| SQL DDL              | データ所有関係とドメインの候補（関連するテーブルは集約ルートの下にグルーピングされる） |

これらを `.krs` スキャフォールドに変換することで、現行システムを karasu の三面構造で描き、ドメイン境界の再整理やサービス分割の候補を検討しやすくなります。Unix パイプで `karasu apply` と組み合わせれば、インフラ側の更新を既存 `.krs` に差分反映できます。

```bash
# docker-compose から deploy.krs を生成
karasu translate --from compose docker-compose.yml > deploy.krs

# translate 結果を既存ファイルにマージ（存在するノードは replace、なければ append）
karasu translate --from k8s manifests/deployment.yaml | karasu apply deploy.krs
```

### `.krs` の構造編集

Chat UI / CI から `.krs` ファイルをプログラム的に編集するためのコマンド群です。

```bash
# ノード削除
karasu remove PaymentService arch.krs

# トップレベルブロックを末尾追記
echo 'service NewService {}' | karasu append arch.krs

# 指定親ノードの子として挿入（インデント自動）
echo 'service NewService {}' | karasu insert ECommerce arch.krs
```

## VS Code 拡張

> **ステータス: experimental（実験的）**
>
> コア機能（パーサー・レンダラー・Web プレビュー）に比べて優先度は低く、VS Code ユーザーが `.krs` を手元で編集するための補助ツールとして提供しています。補完・コードアクション・リネームなど、モダンなエディタ拡張としての完成度はまだ低く、基本的な記述体験に集中したい場合は Web プレビュー（`karasu serve` またはブラウザ版）の利用を推奨します。

`packages/vscode/` に含まれています。現時点で動作する機能:

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
| コアコンセプト（論理／物理分離など） | `docs/concepts.md` |
| 設計判断の経緯（ADR） | `docs/adr/` — `ADR-YYYYMMDD-NN-*.md` 形式で日付順 |
| 詳細技術設計（検討中のもの）| `docs/design/` |
| 受け入れテスト基準 | `docs/acceptance/` |
| 開発プロセス（ライフサイクル・PR フロー）| `docs/process.md` |
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
