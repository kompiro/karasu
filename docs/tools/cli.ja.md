# karasu CLI の使い方

> [English](cli.md) · **日本語**（このファイル）

`karasu` CLI は karasu のコマンドライン側です。主な用途は 2 つあります。

- **ローカルでの編集** — 編集しながら `.krs` ファイルをブラウザでプレビューし、
  フォーマットと lint を保つ。
- **自動化でのレンダリング** — スクリプトや CI から `.krs` を SVG（または
  draw.io）に変換し、コミットした図をモデルと同期させ続ける。

インストールは不要です。公開パッケージ名は **`karasu`** なので、どのコマンドも
`npx` でその場で実行できます。

```bash
npx --yes karasu@latest <command> [args]
```

CI では予期せぬ変化を避けるためバージョンを固定（`karasu@0.1.0`）してください。
以下では簡潔さのため `npx --yes` 接頭辞を省きます。`karasu render …` は
`npx --yes karasu@latest render …` を意味します。

## どんなときに CLI を使うか

| やりたいこと | 使うコマンド |
| --- | --- |
| 編集に合わせて実ファイルの `.krs` をライブ更新したい | [`karasu serve`](#karasu-serve--ライブプレビュー) |
| ドキュメント・README・CI 用に SVG を生成したい | [`karasu render`](#karasu-render--krs--svg) |
| `.krs` / `.krs.style` をフォーマット・検証したい | [`fmt` / `tidy-style` / `lint-style`](#コマンドリファレンス) |
| 既存システムを `.krs` に取り込みたい | [`translate`](#コマンドリファレンス) |
| 2 つのリビジョン間の差分を確認したい | [`diff`](#コマンドリファレンス) |

エディタに追従するプレビューではなく、クリックして操作するグラフィカルな体験が
よければ[アプリの使い方](app.ja.md)を参照してください。

## `karasu serve` — ライブプレビュー

`serve` はディレクトリ内の `.krs` ファイルを監視し、保存のたびにブラウザで
再描画します。編集は普段使いのエディタで続けたまま、プレビューだけが追従します。
**ローカルでの編集**時に使います。

```bash
# .krs ファイルのあるディレクトリで
karasu serve

# ディレクトリとポートを指定する場合
karasu serve ./architecture --port 4000
```

```
karasu serve
  Directory : /path/to/architecture
  Preview   : http://localhost:3000

Watching for .krs file changes...
```

| 引数 / オプション | 既定値 | 意味 |
| --- | --- | --- |
| `[dir]` | `.` | `.krs` を監視するディレクトリ |
| `-p, --port <number>` | `3000` | プレビューサーバーが待ち受けるポート |

表示された URL を開いて編集します。保存すると手動リロードなしで図が再描画され
ます。`serve` は**プレビュー専用**で、エディタは内蔵しません。プレビューペイン
（ビュー・ナビゲーション・診断・エクスポート）や URL とファイルの対応は
[アプリの使い方](app.ja.md)で詳しく説明しています。

## `karasu render` — `.krs` → SVG

`render` は **ブラウザなしで** `.krs` ファイルを SVG（または draw.io XML）に
変換します。CI での図のレンダリング、ドキュメントへの埋め込み、最新の SVG の
コミットなど、**自動化**のためのコマンドです。既定では stdout に書き出すため、
リダイレクトやパイプで結果を受け取ります。

```bash
# stdout にパイプしてファイルへリダイレクト
karasu render index.krs > docs/arch.svg

# ファイルへ直接書き込む
karasu render index.krs --output docs/arch.svg

# 単一ビューを描画する
karasu render index.krs --view deploy --output deploy.svg

# ライトテーマを使う（既定: dark）
karasu render index.krs --theme light --output arch-light.svg

# パイプで最適化する — 一時ファイル不要
karasu render index.krs | svgo - -o docs/arch.svg

# レイアウトの逃げ道として draw.io（mxGraph XML）へエクスポート
karasu render index.krs --format drawio --output arch.drawio
```

| オプション | 既定値 | 意味 |
| --- | --- | --- |
| `-o, --output <path>` | stdout | stdout の代わりにファイルへ出力する |
| `--view <type>` | 全ビュー束ね | `system` \| `deploy` \| `org` のいずれか |
| `--format <format>` | `svg` | `svg`、または `drawio`（ビュー / ドリルダウン階層ごとに 1 ページ） |
| `--theme <theme>` | `dark` | `dark` \| `light` — 図のカラーテーマ（svg のみ） |
| `--include-matrix` | off | `<output-stem>.matrix.svg` も書き出す（`--format svg` と `--output` が必要） |

`render` は `@import` をエントリファイルからの相対で解決するため、複数ファイルの
モデルでもトップレベルのファイルを指定するだけで済みます。ファイルが無い場合や
パースエラーの場合は終了コード `1` で終わります（警告のみなら `0`）。そのため
CI ステップの成否判定に使えます。すぐ使える GitHub Actions ワークフローについて
は[GitHub Actions 連携](../github-actions.md)を参照してください。

## コマンドリファレンス

`serve` と `render` で日常の用途はほぼカバーできます。CLI にはこのほか、ファイル
を整える・既存システムを `.krs` に取り込む・変更を確認するためのコマンドも
あります。各コマンドの全オプションと例は `karasu <command> --help` で確認でき
ます。

| コマンド | 機能 |
| --- | --- |
| `serve [dir]` | ディレクトリの `.krs` をライブプレビュー付きで配信 |
| `render <file>` | `.krs` を SVG または draw.io にレンダリング |
| `matrix <file>` | ユースケース × リソースの CRUD マトリクスを出力（`md` / `csv` / `svg`） |
| `fmt [files...]` | `.krs` を in-place でフォーマット（CI 用 `--check`、パイプ用 `--stdin`） |
| `tidy-style [files...]` | `.krs.style` を整える: 重複ルールをまとめ、プロパティを軸ごとにグループ化 |
| `lint-style [files...]` | `.krs.style` のプロパティ値をスキーマに照らして lint |
| `translate <file>` | インフラ設定や API 仕様を `.krs` スキャフォールドに変換（`--from compose` \| `k8s` \| `openapi` \| `db`） |
| `apply <file>` | stdin の `.krs` を適用 — 同 id のノードは置換、無ければ追記 |
| `append <file>` | stdin の `.krs` を新しいトップレベルブロックとして末尾に追記 |
| `insert <parent-id> <file>` | stdin の `.krs` を指定ノードの最後の子として挿入 |
| `remove <node-id> <file>` | 指定 id のノードを `.krs` から in-place で削除 |
| `diff <before> <after>` | 2 つの `.krs` リビジョン間の差分 SVG を描画（どちらの側も `-` で stdin 可） |

`translate` と Unix パイプの `apply` を組み合わせると、インフラ側の変更を既存の
モデルに取り込めます。

```bash
# compose ファイルを変換して既存の deploy.krs にマージする
karasu translate --from compose docker-compose.yml | karasu apply deploy.krs
```

## 関連項目

- [アプリの使い方](app.ja.md) — `karasu serve` とプレビューペインを共有する
  グラフィカルなプレビュー / プレイグラウンド。
- [GitHub Actions 連携](../github-actions.md) — `karasu render` で CI 上に図を
  生成する。
- [コアコンセプト](../concepts.ja.md) — 各ビューが描画する論理 / 物理 / 組織の
  3 次元。
- [構文リファレンス](../spec/syntax.ja.md) と
  [タグ・アノテーション](../spec/tags-annotations.ja.md) — CLI がパースする `.krs`
  言語。
