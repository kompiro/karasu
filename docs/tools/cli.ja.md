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

ファイルの代わりにディレクトリを渡すこともできます。`karasu render docs/model`
は `serve` が開くのと同じエントリ `docs/model/index.krs` をレンダリングし、診断の
位置も `docs/model/index.krs:<行>:<列>` と表示します。`index.krs` が無いディレクトリ
を渡すと、そのことを伝えて終了コード `1` で終わります。`check`・`matrix`・
`coverage`・`team-dependencies`・`subtree` も同じようにディレクトリを受け付けます。

## コマンドリファレンス

`serve` と `render` で日常の用途はほぼカバーできます。CLI にはこのほか、ファイル
を整える・既存システムを `.krs` に取り込む・変更を確認するためのコマンドも
あります。各コマンドの全オプションと例は `karasu <command> --help` で確認でき
ます。

| コマンド | 機能 |
| --- | --- |
| `serve [dir]` | ディレクトリの `.krs` をライブプレビュー付きで配信 |
| `render <file>` | `.krs` を SVG または draw.io にレンダリング |
| `check <file>` | 何も書き出さずに `.krs` プロジェクトを検証し、error が 1 つでもあれば終了コード `1`。`render` と同じコンパイルを通すので、通ったファイルは描画できる。`fmt` より先に実行する（`fmt` はパースできないファイルを位置を示さずに拒否する） |
| `matrix <file>` | ユースケース × リソースの CRUD マトリクスを出力（`md` / `csv` / `svg`） |
| `team-dependencies <file>` | `owns` × 論理エッジからチーム間の依存と、囲みを跨ぐ所有を導出して出力（`md` / `csv`） |
| `fmt [files...]` | `.krs` を in-place でフォーマット（CI 用 `--check`、パイプ用 `--stdin`） |
| `tidy-style [files...]` | `.krs.style` を整える: 重複ルールをまとめ、プロパティを軸ごとにグループ化 |
| `lint-style [files...]` | `.krs.style` のプロパティ値をスキーマに照らして lint |
| `translate <file>` | インフラ設定や API 仕様を `.krs` スキャフォールドに変換（`--from compose` \| `k8s` \| `openapi` \| `db`） |
| `apply <file>` | stdin の `.krs` を適用 — 同 id のノードは置換、無ければ追記 |
| `append <file>` | stdin の `.krs` を新しいトップレベルブロックとして末尾に追記 |
| `insert <parent-id> <file>` | stdin の `.krs` を指定ノードの最後の子として挿入 |
| `remove <node-id> <file>` | 指定 id のノードを `.krs` から in-place で削除 |
| `diff <before> <after>` | 2 つの `.krs` リビジョン間の差分 SVG を描画（どちらの側も `-` で stdin 可） |
| `capabilities` | この CLI が受け付けるコマンド・フラグと、廃止した名前を一覧（skill やスクリプトからは `--json`。[下記](#karasu-capabilities-この-cli-が受け付けるもの)） |
| `skill install [name]` | karasu の agent skill（省略時はすべて）を `.claude/skills/` か `--dir <path>` にコピー。Claude Code の plugin を入れられないエージェント向け（[下記](#karasu-skill-agent-skill-を入れる)） |
| `skill path [name]` | インストール済み CLI が skill を置いている場所を表示 |

`translate` と Unix パイプの `apply` を組み合わせると、インフラ側の変更を既存の
モデルに取り込めます。

```bash
# compose ファイルを変換して既存の deploy.krs にマージする
karasu translate --from compose docker-compose.yml | karasu apply deploy.krs
```

## `karasu capabilities`: この CLI が受け付けるもの

CLI を呼ぶ skill やスクリプトは、版を決め打ちせずに、受け付けるものを CLI に
問い合わせられます。`karasu capabilities --json` の出力:

```json
{
  "schemaVersion": 1,
  "name": "karasu",
  "version": "0.8.0",
  "languageVersion": "1.0",
  "commands": [
    {
      "name": "render",
      "arguments": ["<file>"],
      "options": [
        { "flags": "-o, --output <path>", "long": "--output", "short": "-o", "takesValue": true }
      ]
    }
  ],
  "deprecations": [
    {
      "kind": "flag",
      "name": "--out",
      "command": "render",
      "replacement": "--output",
      "since": "0.8.0",
      "removal": "1.0.0",
      "status": "deprecated"
    }
  ]
}
```

（値は例です。）`skill` のように下にコマンドを持つコマンドは、それを同じ形で
`subcommands` に並べます。`schemaVersion` が変わるのは、フィールドの意味が変わるか無くなる
ときだけです。フィールドは版を上げずに増えることがあります。`--json` を付けない
と、同じ内容をプレーンテキストで出力します。

### 名前の変更と削除

CLI が名前を変えた・廃止したコマンドやフラグは、次の major リリースまで古い名前
でも動きます（CLI は 1.0.0 まで `0.x` で、それまでは古い名前を削除しません）。
古い名前で呼ぶと代わりが実行され、stderr に 1 行出ます:

```text
karasu: deprecated: 'render --out' -> 'render --output' (since 0.8.0, removal 1.0.0)
```

古い名前を削除する major リリース以降は、同じ形式で `karasu: removed:` から
始まる行を出して終了コード `1` で失敗します。呼び出し側は何を使えばよいかを
引き続き知ることができます。この行の形式は固定で翻訳しないので、エージェントは
`^karasu: (deprecated|removed): '(.+)' -> '(.+)' \(since (\S+), removal (\S+)\)$`
で照合できます。

## `karasu skill`: agent skill を入れる

CLI は karasu の agent skill（[`karasu-skills`](https://www.npmjs.com/package/karasu-skills)
パッケージ）を同梱しているので、Claude Code に限らず、skill のディレクトリを読む
エージェントならどれでも使えます:

| Skill | 何をするか |
| --- | --- |
| `karasu-author` | 自分のシステムのモデルを、会話しながら 1 層ずつ作り・更新する。変更のたびに `karasu check` で検証する |
| `reverse-architecture` | 既存のリポジトリをリバースエンジニアリングしてモデルにする |

```bash
# すべての skill を ./.claude/skills にコピー
npx karasu skill install

# 1 つの skill を、エージェントが skill を読むディレクトリにコピー
npx karasu skill install karasu-author --dir .agents/skills
```

skill は `<dir>/<name>/` に `SKILL.md` と同梱の reference と一緒に入ります。
インストール済みの skill は上書きしません。`--force` を付けると、この CLI が
持つ版で置き換えます。コピーせずにエージェントに場所を教えたいときは
`karasu skill path <name>` で場所を表示できます。

Claude Code では代わりに plugin を入れてください。`/plugin` メニューから更新できます:

```text
/plugin marketplace add kompiro/karasu
/plugin install karasu@karasu
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
