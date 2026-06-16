# AT: Landing Page on GitHub Pages

> **⚠️ Retired (2026-06-16)** — この手書きランディングページ（`site/`）は #1575 の
> ドキュメントサイト（`packages/docs-site/`、Astro Starlight）に置き換えられ、`site/`
> は削除された。`pages.yml` は `packages/docs-site/dist` をデプロイする。以下の手動確認
> 項目はもう適用されない。後継は [AT-1575](1575-docs-site.md)、決定は
> [ADR-20260616-03](../adr/20260616-03-docs-site-ssg.md) を参照。記録として残す。

- **日付**: 2026-05-20
- **関連 Issue**: [#1403](https://github.com/kompiro/karasu/issues/1403)
- **対象ファイル**: ~~`site/`~~（削除済み）, `.github/workflows/pages.yml`

## 受け入れ条件（retired — 当時の記録）

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
- [ ] Get started に ブラウザ版リンクと CLI インストール手順（`npm install -g karasu`）が表示される
- [ ] ページ内にリポジトリ（GitHub）への外部リンクが含まれていない

### 体裁

- [ ] 幅 720px 未満（モバイル幅）でカードが 1 カラムに折り返り、レイアウトが崩れない
- [ ] ロゴ・図が欠けずに表示される
