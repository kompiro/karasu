# AT: Landing Page on GitHub Pages

- **日付**: 2026-05-20
- **関連 Issue**: [#1403](https://github.com/kompiro/karasu/issues/1403)
- **対象ファイル**: `site/`, `.github/workflows/pages.yml`

## 受け入れ条件

LP は静的 HTML/CSS のみで構成され、ビルド・ランタイムロジックを持たないため
自動テストは設けない。すべて手動確認でカバーする。

## 前提セットアップ（リポジトリ管理者が一度だけ実施）

- [ ] Settings → Pages で Source を **GitHub Actions** に設定する
- [ ] 初回デプロイ完了後、Settings → 概要の `homepageUrl` を Pages URL に設定する

## 手動確認チェックリスト

### デプロイ

- [ ] `main` マージ後、`Pages` ワークフローが成功する
- [ ] 発行された GitHub Pages URL でランディングページが表示される

### 表示内容

- [ ] Hero にプロダクト名・タグライン・1行説明が表示される
- [ ] 「Try it in your browser」ボタンが `https://karasu.pages.dev/` を開く
- [ ] 三面構造（logical / physical / organizational）を説明する 3 枚のカードが表示される
- [ ] 「See it in action」に `.krs` ソースとレンダリング済み図（`assets/example.svg`）が並んで表示される
- [ ] 表示されている `.krs` ソースが `site/example/landing.krs` の内容と一致する
- [ ] Get started に ブラウザ版リンクと CLI インストール手順が表示される
- [ ] docs（concepts / syntax / examples）への外部リンクがすべて正しく開く

### 体裁

- [ ] 幅 720px 未満（モバイル幅）でカードが 1 カラムに折り返り、レイアウトが崩れない
- [ ] ロゴ・図が欠けずに表示される
