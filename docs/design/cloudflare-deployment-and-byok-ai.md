# Cloudflare Pages デプロイ基盤と BYOK AI 連携

- **日付**: 2026-04-07
- **ステータス**: 検討中
- **関連**: [AI Support Design](../../memory/project_ai_support.md)

## 背景・課題

karasu は現在ローカル起動前提のツールであり、動作するサンプルを外部に公開する手段がない。
将来の AI 連携（Claude API を使ったチャット UI など）を見据え、以下を一緒に設計する：

1. main マージのたびに自動でデプロイされる公開サンプル環境
2. AI 機能をコスト・認証リスクなしに提供する方式

## 制約・前提

- karasu は純粋なクライアントサイド SPA（Vite + React）、サーバーサイド処理なし
- pnpm workspaces モノレポ：`packages/core` → `packages/app` の順でビルドが必要
- Cloudflare は初使用（学習コストを最小化したい）
- 運営側の継続コストをゼロに近づけたい
- 設定はリポジトリで管理する（ダッシュボード依存を避ける）

## 検討した選択肢

### デプロイ先

#### 案A: Cloudflare Pages（採用）

Cloudflare のグローバル CDN 上に静的ファイルをホストする。

`wrangler.toml` は Cloudflare の CLI ツール `wrangler` の設定ファイル。Cloudflare Pages では以下を記述する：

```toml
name = "karasu"                              # Pages プロジェクト名（= .pages.dev サブドメイン名）
pages_build_output_dir = "packages/app/dist"
compatibility_date = "2025-01-01"
```

アカウントID・API トークンは `wrangler.toml` には書かず、GitHub Secrets（`CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN`）で管理して GitHub Actions 経由で渡す。

**メリット**
- 無料枠が十分広い（500 ビルド/月、帯域無制限）
- GitHub Actions から `wrangler pages deploy` で完結、追加サービス不要
- PR ごとのプレビュー URL が自動生成される（有効化する方針）
- `wrangler.toml` でリポジトリ管理が可能

**デメリット**
- Cloudflare アカウントと API トークンの初期設定が必要
- wrangler の学習コストが若干ある

#### 案B: GitHub Pages

**メリット**: GitHub のみで完結、追加アカウント不要

**デメリット**: PR プレビューなし、モノレポ対応が煩雑、カスタムドメイン設定が面倒

#### 案C: Vercel

**メリット**: モノレポ対応、PR プレビューあり

**デメリット**: 無料枠の制限が厳しい（帯域 100GB/月）、Vercel 側の設定依存が大きい

---

### 認証方針

#### 案A: 認証なし（現フェーズ）

静的 SPA のみのフェーズは認証不要。コストが発生しないため誰でもアクセスできても実害なし。

#### 案B: Cloudflare Access（当初検討）

Cloudflare Zero Trust の機能。GitHub OAuth などで認証ゲートをコード変更なしに設置できる。

- 無料枠：最大 50 ユーザー
- 有料：$7/ユーザー/月 前後

**デメリット**: AI 連携を BYOK 方式にすることで不要になるため、複雑性を増すだけになる。

#### 案C: BYOK（採用）

ユーザーが自分の Claude API キーを UI に入力して使う方式。

- API キーの所有 = 実質的な認証として機能する
- 運営側に API コストが発生しない
- 認証基盤（Cloudflare Access 等）が不要

**対象ユーザーとの相性**: karasu のターゲットは開発者であり、Claude API キーを持っているか容易に取得できる層と一致する。

---

### BYOK の実装方式

#### ストレージ方針（採用）

```
デフォルト: sessionStorage（タブを閉じたら消える、漏洩リスクが低い）
設定画面でオプトイン: localStorage（セッションをまたいで保持）
```

デフォルトを sessionStorage にすることで XSS によるキー漏洩リスクを低減しつつ、
利便性を重視するユーザーは設定画面から localStorage への保存を選択できる。

#### localStorage のキー設計

将来の複数プロバイダー対応を見越してネームスペースを切る：

```
karasu.ai.anthropic.apiKey   ← API キー本体（session or local）
karasu.ai.settings.persist   ← "session" | "local"（localStorage に保存）
```

`karasu.ai.settings.persist` 自体は localStorage に保存することで、
「保存する」設定が次回起動時も引き継がれる。

#### API 呼び出し

- `@anthropic-ai/sdk` の `dangerouslyAllowBrowser: true` オプションで CORS 対応済み
- クライアントサイドのみで完結、バックエンド不要

#### 案B: バックエンドプロキシ経由

- サーバーが必要になり、インフラが複雑化する → 現フェーズでは過剰

---

### ドメイン

`wrangler.toml` の `name` フィールドがそのまま `.pages.dev` のサブドメインになる：

```
name = "karasu"  →  https://karasu.pages.dev
```

`karasu.pages.dev` が取得済みの場合は `karasu-tools.pages.dev` 等の代替名を使う。
プロジェクト名はアカウント作成時の `wrangler pages project create` で確定する。

カスタムドメインは当面不要、`*.pages.dev` で運用する。

## 比較

| 観点 | Cloudflare Pages | GitHub Pages | Vercel |
|------|-----------------|--------------|--------|
| 無料枠 | 広い（帯域無制限） | あり | 帯域制限あり |
| PR プレビュー | あり | なし | あり |
| モノレポ対応 | 設定で可能 | 難しい | 設定で可能 |
| リポジトリ管理 | wrangler.toml | — | vercel.json |
| 初期コスト | アカウント作成のみ | 不要 | アカウント作成のみ |

| 観点 | 認証なし | Cloudflare Access | BYOK |
|------|----------|------------------|------|
| 導入コスト | ゼロ | 設定が必要 | UI 実装のみ |
| 運営コスト | ゼロ | Free 枠内ならゼロ | ゼロ |
| AI コスト責任 | 運営側 | 運営側 | ユーザー側 |
| 対象ユーザー適合性 | — | — | 開発者層に高い |

## 現時点の方針

以下の構成を採用する：

```
Cloudflare Pages（静的ホスト、*.pages.dev）
  + GitHub Actions（main マージ時に自動デプロイ + PR プレビューデプロイ有効）
  + BYOK（ユーザーが Claude API キーを入力して AI 機能を利用）
  + 認証なし（BYOK が実質的な認証を兼ねる）
```

### フェーズ分け

**フェーズ1（デプロイ基盤）**: 認証なしで静的 SPA をデプロイ

追加ファイル：
- `wrangler.toml` — Cloudflare Pages プロジェクト設定（アカウントID は含めない）
- `.github/workflows/deploy.yml` — ビルド + デプロイ workflow
- `packages/app/public/_redirects` — SPA ルーティング（`/* /index.html 200`）

GitHub Secrets（リポジトリ外で管理）：
- `CLOUDFLARE_API_TOKEN` — デプロイ用 API トークン
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare アカウントID

**フェーズ2（BYOK AI 連携）**: API キー入力 UI + クライアントサイド Anthropic API 呼び出し

実装要素：
- API キー入力コンポーネント（sessionStorage にデフォルト保存）
- 設定画面：localStorage への永続化オプトイン（セキュリティ注意文言を表示）
- `dangerouslyAllowBrowser: true` を使った SDK 初期化

### コスト見通し

| 項目 | コスト |
|------|--------|
| Cloudflare Pages | 無料（500 ビルド/月、帯域無制限） |
| Cloudflare Zero Trust | 不要（BYOK 採用のため） |
| 運営側 API コスト | ゼロ（ユーザー負担） |
