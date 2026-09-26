# karasu 鴉

<p align="center">
  <img src="packages/app/public/karasu-logo-1200w.png" alt="karasu logo" width="640" />
</p>

> [English](README.md) · **日本語**（このファイル）

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/kompiro/karasu)
<a href="https://cloudflare.com"><img src="https://workers.cloudflare.com/built-with-cloudflare.svg" alt="Built with Cloudflare" height="20" /></a>

**実在するシステムを理解し、進化させるための Architecture as Code。**

karasu は、テキストベースのアーキテクチャモデリング言語とツールチェインです。
システムの **論理構造**、**物理デプロイ**、**チームのオーナーシップ**を、
人間・コード・AI agent が共に読み、進化させられる一つのモデルに保ちます。

[**ブラウザで試す →**](https://karasu.kompiro.dev/)

[ドキュメント](https://kompiro.github.io/karasu/ja/) ·
[ガイド](https://kompiro.github.io/karasu/ja/guide/) ·
[構文リファレンス](https://kompiro.github.io/karasu/ja/spec/syntax/) ·
[サンプル](https://kompiro.github.io/karasu/ja/examples/) ·
[VS Code](https://marketplace.visualstudio.com/items?itemName=karasu-tools.karasu-vscode)

## 一つのモデル、三つの視点

アーキテクチャは単なる図ではありません。システムが何をするか、どう動くか、
誰が所有するか、そしてその境界がどう変わるかを一緒に理解する必要があります。

| 視点 | 記述するもの |
| --- | --- |
| **論理** | システム、サービス、ドメイン、ユースケース、エンティティ、依存関係 |
| **物理** | デプロイ、ランタイム、データベース、キュー、ストレージ |
| **組織** | チームとオーナーシップ |

`.krs` テキストが信頼できる唯一の情報源です。人間が編集でき、CLI が既存の
artifact から抽出でき、AI agent がソースコードから作成・改善できます。
karasu は同じモデルを、システムの全階層を一枚に詰め込むのではなく、
必要な場所へ連続的にドリルダウンできる図として描画します。

## 試す

### 1. Web app で体験する

[Web app](https://karasu.kompiro.dev/) でモデルの編集、図の移動、組み込み
チュートリアルを体験できます。インストールは不要です。

エディタで作業したい場合は
[VS Code 拡張](https://marketplace.visualstudio.com/items?itemName=karasu-tools.karasu-vscode)
をインストールします。

```sh
code --install-extension karasu-tools.karasu-vscode
```

### 2. 自分のシステムから始める

Docker Compose、Kubernetes manifest、OpenAPI schema、SQL DDL がすでにあれば、
`karasu translate` で編集可能な `.krs` の出発点に変換できます。

```bash
npx --yes karasu@latest translate --from compose docker-compose.yml > architecture.krs
npx --yes karasu@latest serve .
```

ほかの入力には `--from k8s`、`--from openapi`、`--from db` を使います。
全コマンドは [CLI の使い方](https://kompiro.github.io/karasu/ja/tools/cli/)
を参照してください。

### 3. AI agent でリポジトリをリバースエンジニアリングする

[`reverse-architecture` skill](.claude/skills/reverse-architecture/SKILL.md) を使うと、
リポジトリを読める AI agent が既存のコードベースを調査し、karasu model を構築します。
ドメイン構造には agent の判断を使い、CLI による決定的な抽出と検証を組み合わせる
ワークフローです。

生成物はレビューして進化させるための地図であり、完全な正解を主張するものではありません。
karasu は AI がなくても使えます。モデルは plain text で、人間が編集でき、
生成した agent に依存しません。

## 小さなモデル

```krs
system Shop {
  user Customer [human]
  service Storefront {
    domain Ordering
  }
  service Payment [external]

  Customer -> Storefront "Place an order"
  Storefront -> Payment "Charge"
}

deploy Production {
  oci WebApp {
    runtime "Node.js"
    realizes Storefront
  }
}

organization Product {
  team Commerce {
    owns Storefront
  }
}
```

Web app で開くか `npx --yes karasu@latest serve .` を実行すると、System、Deploy、
Org view を移動し、詳細へドリルダウンできます。

## なぜ karasu か

- **システムと共に進化できるアーキテクチャ** — Git でテキストの変更をレビューし、
  図の差分を比較し、アーキテクチャを開発作業の近くに保てます。
- **論理・物理・組織の境界を一緒に扱う** — サービス設計、デプロイ、
  オーナーシップを同じ語彙で議論できます。
- **プログレッシブ・ディスクロージャー** — 範囲を絞った概要から始め、
  詳細が必要な場所だけに降りられます。
- **人間とツールの共通モデル** — `.krs` を手で編集し、構造化された入力から
  scaffold を生成し、AI agent に変更を提案させても、モデル自体は AI に依存しません。

karasu は C4 Model、Structurizr、Mermaid から着想を得ています。
設計思想は [コアコンセプト](https://kompiro.github.io/karasu/ja/concepts/)、
サービス境界・チーム境界・オンボーディング・アーキテクチャの進化は
[ガイド](https://kompiro.github.io/karasu/ja/guide/) を参照してください。

## ドキュメント

- [Web app の使い方](https://kompiro.github.io/karasu/ja/tools/app/)
- [CLI の使い方](https://kompiro.github.io/karasu/ja/tools/cli/)
- [ガイド](https://kompiro.github.io/karasu/ja/guide/)
- [構文リファレンス](https://kompiro.github.io/karasu/ja/spec/syntax/)
- [スタイルリファレンス](https://kompiro.github.io/karasu/ja/spec/style/)
- [サンプル](https://kompiro.github.io/karasu/ja/examples/)

## プロジェクトの位置づけ

karasu は個人の学習プロジェクトで、SLA なしのベストエフォートでメンテナンスしています。
`.krs` / `.krs.style` 言語仕様は v1.0 で後方互換性を維持します。
TypeScript API は v0.x で、マイナーリリース間に変更される可能性があります。
言語の互換性については [ADR-1314](docs/adr/1314-krs-spec-v1-freeze.md) を参照してください。

## コントリビュート、セキュリティ、ライセンス

Issue と Pull Request を歓迎します。[CONTRIBUTING.md](CONTRIBUTING.md) と
[Code of Conduct](CODE_OF_CONDUCT.md) を参照してください。脆弱性は公開 Issue ではなく、
[private vulnerability reporting](https://github.com/kompiro/karasu/security/advisories/new)
から報告してください。詳細は [SECURITY.md](SECURITY.md) にあります。

[Apache License, Version 2.0](LICENSE) でライセンスされています。
