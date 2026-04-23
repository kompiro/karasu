---
id: ADR-20260404-06
title: "GitHub Markdown レンダリングサービス — `serve.ts` の `/render` エンドポイント"
status: accepted
date: 2026-04-04
topic: build
scope:
  packages:
    - cli
  domains:
    - cli
---

# ADR-20260404-06: GitHub Markdown レンダリングサービス — `serve.ts` の `/render` エンドポイント

- **日付**: 2026-04-04
- **ステータス**: 決定済み
- **関連**: Issue #123

## 背景

GitHub の README・PR・Issue 内の `.krs` コードブロックや、リポジトリに置いた `.krs` ファイルを SVG 画像として表示したいニーズがあった。GitHub Markdown の公式拡張ではなく、[mermaid.ink](https://mermaid.ink) のように外部レンダリングサービスへの画像 URL 埋め込みで実現する必要があった。

```markdown
<!-- ファイル参照（推奨） -->
![System diagram](https://karasu-render.example.com/render?src=https://raw.githubusercontent.com/owner/repo/main/system.krs)

<!-- インライン（短いコード向け） -->
![diagram](https://karasu-render.example.com/render?code=c3lzdGVt...&view=system)
```

## 決定

### 1. `packages/cli/src/serve.ts` に `/render` エンドポイントを追加

`serve` コマンドはすでにローカルプレビュー用サーバーとして機能しており、`compileProject` / `buildAllViewsSvgProject` を通じて `core` のレンダラーを呼び出せる。ローカル確認と公開ホスティングを同一コードベースで賄える。

### 2. エンドポイント仕様

`GET /render`:

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `src` | URL | `src` か `code` のどちらか | `.krs` ファイルの公開 URL（GitHub Raw 等）を fetch してレンダリング |
| `code` | base64 文字列 | `src` か `code` のどちらか | `.krs` ソースコードを Base64 エンコードしたもの |
| `view` | `system` \| `deploy` \| `org` | 任意 | ビュー種別（省略時は全体 SVG） |

レスポンス：

| 条件 | Status | Content-Type | Body |
|---|---|---|---|
| 正常 | 200 | `image/svg+xml` | SVG 文字列 |
| パラメータ不足 | 400 | `text/plain` | エラーメッセージ |
| `src` の fetch 失敗 | 502 | `text/plain` | エラーメッセージ |
| パース・コンパイルエラー | 422 | `text/plain` | エラーメッセージ |

### 3. SSRF 対策

`src` パラメータは任意 URL を受け付けるため、以下の制約を `isSafeUrl()` で強制する：

- `http:` / `https:` のみ許可（`file:`, `ftp:` 等は拒否）
- ループバックアドレス（`127.0.0.1`, `::1`, `localhost`）への接続禁止
- プライベートアドレス（RFC 1918: `10.*`, `172.16-31.*`, `192.168.*`）への接続禁止
- リダイレクト先が上記制約を満たすか検証（最大リダイレクト 5 回）

### 4. インライン `.krs` の扱い

`?code=` パラメータは Base64 Standard Encoding（`+` / `/` を含む）を想定する。URL 内で問題が生じる場合は Base64url（`-` / `_`）も許容。`.krs` は `compileProject` の単一ファイルモード（`FileSystemProvider` スタブ）で処理する。

### 5. キャッシュ

MVP ではキャッシュなし。`src` 参照時は毎リクエスト fetch する。将来的に `Cache-Control` や ETag を活用して外部 CDN でキャッシュを有効化する。

### 6. 公開ホスティング

本 ADR のスコープ外。候補: Fly.io、Cloudflare Workers（Workers では Node.js FS API 制約があるため要確認）。

## 理由

- **`serve.ts` 拡張**: 既存 HTTP サーバーを再利用し、実装コストが低い。ローカル動作確認がそのままできる。`compileProject` を直接呼べる
- **mermaid.ink パターン踏襲**: 既に広く使われているパターンで、GitHub Markdown での `<img>` 埋め込みが動作することが確認されている
- **SSRF 対策必須**: `src` に任意 URL を受け付けるためセキュリティ対策を埋め込み時点で必須とし、`isSafeUrl()` として別関数に切り出してテスト可能にする
- **キャッシュを MVP で入れない**: 実運用データが集まる前にキャッシュ戦略を決めるのは early optimization。外部 CDN の `Cache-Control` で後から追加できる

## 却下した案

### 案B: 新パッケージ `packages/server` を作成

CLI のローカルサーバーとは分離でき責務が明確になるが、MVP には過剰。採用率が上がって運用が必要になった段階で分離を検討する。

### 案C: GitHub Actions で SVG を事前生成してコミット

外部サービス依存なしの利点はあるが、都度コミットが必要でリアルタイム性がない。`src` 参照方式と組み合わせた補完策として記録しておく。

## 残課題

- **レート制限**: 公開サービスとして運用する場合、無制限アクセスを許可するか
- **`src` の Content-Type 検証**: `.krs` 拡張子チェックで十分か、MIME チェックも必要か
- **SVG サニタイズ**: `core` が生成する SVG に `<script>` は含まれないが、`src` 経由で悪意ある `.krs` を渡された場合の考慮（GitHub 側が `<img>` として扱うため基本安全）
