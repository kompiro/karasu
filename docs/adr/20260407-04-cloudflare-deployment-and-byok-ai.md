---
id: ADR-20260407-04
title: Cloudflare Pages デプロイ基盤と BYOK AI 連携
status: accepted
date: 2026-04-07
topic: chat-ai
scope:
  packages:
    - app
  domains:
    - deployment
    - ai
---

# ADR-20260407-04: Cloudflare Pages デプロイ基盤と BYOK AI 連携

- **日付**: 2026-04-07
- **ステータス**: 決定済み
- **関連**: [AI Support Design](../../memory/project_ai_support.md)

## 背景

karasu はローカル起動前提のクライアントサイド SPA（Vite + React）であり、動作するサンプルを外部に公開する手段がなかった。将来の AI 連携（Claude API を使ったチャット UI など）を見据え、以下を一緒に設計する必要があった：

1. main マージのたびに自動デプロイされる公開サンプル環境
2. AI 機能をコスト・認証リスクなしに提供する方式

運営側の継続コストをゼロに近づけたい、設定はリポジトリで管理したい、という制約もあった。

## 決定

### 1. デプロイ: Cloudflare Pages

Cloudflare のグローバル CDN 上に静的ファイルをホスト。`wrangler.toml` でプロジェクト設定を管理する：

```toml
name = "karasu"
pages_build_output_dir = "packages/app/dist"
compatibility_date = "2025-01-01"
```

アカウント ID・API トークンは GitHub Secrets（`CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN`）で管理し、GitHub Actions の `wrangler pages deploy` で main マージ時に自動デプロイする。PR ごとのプレビュー URL を有効化する。

### 2. 認証: 認証なし（BYOK が実質的な認証を兼ねる）

静的 SPA のみのフェーズは認証を設けない。API キーの所有が実質的な認証として機能する。

### 3. AI 連携: BYOK（Bring Your Own Key）

ユーザーが自分の Claude API キーを UI に入力して使う方式。`@anthropic-ai/sdk` の `dangerouslyAllowBrowser: true` でクライアントサイドのみで完結、バックエンド不要。

**ストレージ方針**:

```
デフォルト: sessionStorage（タブを閉じたら消える、漏洩リスクが低い）
設定画面でオプトイン: localStorage（セッションをまたいで保持）
```

**localStorage キー設計**（将来の複数プロバイダー対応を見越してネームスペース）:

```
karasu.ai.anthropic.apiKey   ← API キー本体
karasu.ai.settings.persist   ← "session" | "local"
```

### 4. ドメイン

`*.pages.dev`（`karasu.pages.dev` が取得できれば）で運用。カスタムドメインは当面不要。

### 5. フェーズ分け

- **Phase 1（デプロイ基盤）**: `wrangler.toml` + `.github/workflows/deploy.yml` + `_redirects`（SPA ルーティング）。認証なしで静的 SPA をデプロイ
- **Phase 2（BYOK AI 連携）**: API キー入力 UI + 設定画面（localStorage オプトイン + セキュリティ注意文言）+ `dangerouslyAllowBrowser` を使った SDK 初期化

## 理由

- **Cloudflare Pages の無料枠の広さ**: 500 ビルド/月・帯域無制限で、運営コストがほぼゼロ。GitHub Actions + `wrangler pages deploy` だけで完結する
- **`wrangler.toml` によるリポジトリ管理**: ダッシュボード依存を避けられ、設定がコードレビューの対象になる
- **BYOK が認証を兼ねる**: Cloudflare Access（$7/ユーザー/月）等の認証基盤を導入せずに済む。karasu のターゲットが開発者層であり Claude API キーを持っている/取得しやすい層と一致する
- **sessionStorage デフォルト**: XSS によるキー漏洩リスクを低減しつつ、利便性を重視するユーザーは localStorage にオプトインできる
- **`dangerouslyAllowBrowser`**: バックエンドプロキシ（案B）はサーバーが必要になりインフラが複雑化する。現フェーズでは過剰

## 却下した案

### デプロイ: GitHub Pages

GitHub のみで完結する利点はあるが、PR プレビューなし、モノレポ対応が煩雑、カスタムドメイン設定が面倒。

### デプロイ: Vercel

PR プレビューありだが、無料枠の帯域制限（100GB/月）が厳しく、設定依存が大きい。

### 認証: Cloudflare Access

BYOK を採用するなら不要。複雑性を増すだけになる。

### BYOK: バックエンドプロキシ経由

サーバーが必要になりインフラが複雑化する。現フェーズでは過剰。

## コスト見通し

| 項目 | コスト |
|---|---|
| Cloudflare Pages | 無料（500 ビルド/月、帯域無制限） |
| Cloudflare Zero Trust | 不要 |
| 運営側 API コスト | ゼロ（ユーザー負担） |
