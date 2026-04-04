# GitHub Markdown レンダリングサービス

- **日付**: 2026-04-04
- **ステータス**: 提案
- **関連**: [Issue #123](https://github.com/kompiro/karasu/issues/123)

## 目的

GitHub の README・PR・Issue 内の `.krs` コードブロックや、任意のファイル参照を SVG 画像として表示できるようにする。
GitHub Markdown の公式拡張ではなく、外部レンダリングサービスへの画像 URL 埋め込みで実現する。

## 参考: mermaid.ink パターン

[mermaid.ink](https://mermaid.ink) はクエリパラメータに Mermaid 定義を受け取り、SVG/PNG を返す公開サービスである。
GitHub Markdown では `![...](https://mermaid.ink/svg/...)` のように `<img>` として埋め込む。

karasu も同じパターンを採用する。

## 完成イメージ

```markdown
<!-- ファイル参照（推奨） -->
![System diagram](https://karasu-render.example.com/render?src=https://raw.githubusercontent.com/owner/repo/main/system.krs)

<!-- インライン（短いコード向け） -->
![diagram](https://karasu-render.example.com/render?code=c3lzdGVtIEVDUGxhdGZvcm0...&view=system)
```

## エンドポイント設計

### `GET /render`

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `src` | URL | `src` か `code` のどちらか | `.krs` ファイルの公開 URL（GitHub Raw 等）を fetch してレンダリングする |
| `code` | base64 文字列 | `src` か `code` のどちらか | `.krs` ソースコードを Base64 エンコードしたもの |
| `view` | `system` \| `deploy` \| `org` | 任意 | ビュー種別（省略時は全体 SVG） |

#### レスポンス

| 条件 | Status | Content-Type | Body |
|---|---|---|---|
| 正常 | 200 | `image/svg+xml` | SVG 文字列 |
| パラメータ不足 | 400 | `text/plain` | エラーメッセージ |
| `src` の fetch 失敗 | 502 | `text/plain` | エラーメッセージ |
| パース・コンパイルエラー | 422 | `text/plain` | エラーメッセージ |

#### セキュリティ制約

`src` パラメータは任意の URL を受け付けるため、SSRF を防ぐために以下を制限する:

- `http:` / `https:` のみ許可（`file:`, `ftp:` 等は拒否）
- ループバックアドレス（`127.0.0.1`, `::1`, `localhost`）への接続を禁止
- プライベートアドレス（RFC 1918: `10.*`, `172.16-31.*`, `192.168.*`）への接続を禁止
- リダイレクト先が上記制約を満たすか検証する（最大リダイレクト 5 回）

## 実装方針

### 実装場所

`packages/cli/src/serve.ts` の既存 HTTP サーバーに `/render` エンドポイントを追加する。
`serve` コマンドはすでにローカルプレビュー用サーバーとして機能しており、
`compileProject` / `buildAllViewsSvgProject` を通じて core のレンダラーを呼び出せる。

ローカルでの確認と公開ホスティングを同一コードベースで賄える。

### 公開ホスティング

このドキュメントのスコープ外とする。
候補: Fly.io, Cloudflare Workers（Workers では Node.js FS API 制約があるため要確認）

### インライン `.krs` の扱い

`?code=` パラメータは Base64 Standard Encoding（`+` / `/` を含む）を想定する。
URL 内で問題が生じる場合は Base64url（`-` / `_`）も許容する。

`.krs` はファイルシステムなしでも `compileProject` の単一ファイルモードで処理できる（`FileSystemProvider` のスタブを利用）。

### キャッシュ

MVP ではキャッシュなし。`src` 参照時は毎リクエスト fetch する。
将来的に `Cache-Control` や ETag を活用して外部 CDN でのキャッシュを有効化する。

## 検討した選択肢

### A: `serve.ts` に追加（採用）

- 既存 HTTP サーバーを再利用し、実装コストが低い
- ローカル動作確認がそのままできる
- `compileProject` を直接呼べる

### B: 新パッケージ `packages/server` を作成

- CLI のローカルサーバーとは分離でき責務が明確になる
- 公開ホスティング専用の設定（CORS, Rate limit 等）を入れやすい
- ただし MVP では過剰。採用率が上がって運用が必要になった段階で分離を検討する

### C: GitHub Actions で SVG を事前生成してコミット

- GitHub の外部サービス依存なし
- ただし都度コミットが必要でリアルタイム性がない
- `src` 参照方式と組み合わせた補完策として記録しておく

## 未解決の問い

1. **レート制限**: 公開サービスとして公開した場合、無制限アクセスを許可するか
2. **`src` の Content-Type 検証**: `.krs` 拡張子チェックで十分か、MIME チェックも必要か
3. **SVG サニタイズ**: `core` が生成する SVG に `<script>` は含まれないが、`src` 経由で悪意ある `.krs` を渡された場合の考慮が必要か（GitHub 側が `<img>` として扱うため基本安全）