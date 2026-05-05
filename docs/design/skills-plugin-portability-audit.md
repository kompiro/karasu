# Skills Plugin Portability Audit

- **日付**: 2026-05-02
- **ステータス**: 完了
- **関連**: #1075（親）, #1084（このタスク）, #1086（このマトリクスを使う decouple ステップ）

## 背景

`.claude/skills/` 配下のうち portable とした 8 skill を `kompiro/claude-skills` plugin として外出しするため、各 skill のプロジェクト固有な前提を洗い出す。

## 監査対象

| Skill | 主目的 | Plugin 化 |
|---|---|---|
| `commit` | Conventional Commits でコミット | ✅ |
| `ship` | push → PR → CI → cleanup | ✅ |
| `start-dev` | Issue 起点の worktree + PR ワークフロー | ✅ |
| `design-doc` | `docs/design/` に設計ドキュメントを残す | ✅ |
| `acceptance-test` | `docs/acceptance/` に AT 記録を作成 | ✅ |
| `qa` | AT から QA チェックリストを生成 | ✅ |
| `review-docs` | リンク切れ・整合性レビュー | ✅ |
| `sync-docs` | コード現状にドキュメントを追従 | ✅ |
| `svg-icon` | karasu アイコン作成 | ❌（karasu 固有） |
| `update-examples` | `examples/` 編集 + `examples.ts` 同期 | ❌（karasu 固有） |

## 観点

- **P (Path)**: ハードコードされたパス
- **B (Branch)**: ブランチ・worktree 慣習
- **M (Monorepo)**: monorepo レイアウト前提
- **L (Language)**: 自然言語前提（日本語/英語）
- **K (Karasu doc)**: karasu 固有のドキュメント参照
- **T (Tooling)**: ツール前提（package manager, linter, formatter, CI 等）
- **C (CLAUDE.md)**: skill が読みに行く `CLAUDE.md` の規約キー
- **D (Docs structure)**: 標準ドキュメント構造（`docs/design/`, `docs/adr/`, `docs/acceptance/`）の存在前提

## マトリクス

### `commit`

| 観点 | 検出 | 対応方針 |
|---|---|---|
| P | なし（純粋に `git` 操作のみ） | — |
| B | `main`/`master` ブランチ上での実行を拒否 | そのまま portable |
| M | コミット計画の例として `packages/core` `packages/app` パスが登場（飾り） | 例を一般化（`src/foo.ts` 等） |
| L | skill 本体は日本語、commit subject は英語と明記 | subject は英語ルールを残し、skill 本体の説明は英語 + 多言語トリガーで OK |
| T | なし（外部ツール非依存） | — |

**結論**: ほぼそのまま portable。例示パスのみ一般化する。

### `ship`

| 観点 | 検出 | 対応方針 |
|---|---|---|
| P | クリーンアップで `cd /workspaces/karasu` を絶対パスでハードコード | `git rev-parse --show-toplevel` 経由で main worktree に戻る形に |
| P | worktree 検出を `.worktrees/` 部分一致で行う | `.claude/worktrees/` ベースに変更（#1085 で確定） |
| B | branch == `main` で拒否 | portable |
| M | `pnpm install` を強制実行 | パッケージマネージャは host 設定から検出（`packageManager` フィールド or lock file） |
| L | skill 本体は日本語、PR Description は英語チェック | 英語チェックは設定可能化（プロジェクトの言語ポリシー次第） |
| K | `.github/PULL_REQUEST_TEMPLATE.md` のセクション構成参照 | template が無い場合の fallback を持つ |
| K | Cloudflare Pages preview URL 構築（`*.karasu.pages.dev`） | **karasu 固有**。plugin から削除。preview URL 表示は karasu 側ラッパで補う |
| K | ADR-20260413-01 への参照（preview workflow 説明） | plugin からは削除 |
| T | `gh pr checks --watch` / `gh pr view` | portable（GitHub repo 前提） |
| T | `/review` スキル呼び出し | external 依存。plugin の README に記載 or optional 化 |
| C | Issue ラベル `status: implementing` 等 | **karasu 固有のラベル運用**。`CLAUDE.md` に label set を定義し、無い場合はラベル操作をスキップする方針 |
| D | `docs/design/` ADR 昇格手順は含まず（cleanup の一部にあり） | portable（後述） |

**結論**: 最大の修正対象。preview URL ハードコードと ADR 昇格周りを削るか optional 化。

### `start-dev`

| 観点 | 検出 | 対応方針 |
|---|---|---|
| P | `git worktree add .worktrees/<機能名>` | `.claude/worktrees/<branch-name>` に変更 |
| P | クリーンアップで `cd /workspaces/karasu` 絶対パス | `git rev-parse --show-toplevel` |
| B | `feat/`, `fix/`, `docs/`, `chore/`, `refactor/` 命名規則 | 一般的な慣習なので portable |
| M | `pnpm install` 強制 | host 検出 |
| M | `pnpm test` / `pnpm run lint` / `pnpm run format:check` | host の `package.json` scripts を尊重、無ければ skip |
| K | `docs/design/` `docs/spec/` `docs/acceptance/` 参照 | 各ディレクトリの存在チェックを噛ませて optional 化 |
| K | `.github/PULL_REQUEST_TEMPLATE.md` のセクション構成 | fallback テンプレート用意 |
| K | Cloudflare Pages preview URL（`*.karasu.pages.dev`） | **karasu 固有**。削除 |
| K | `.claude/rules/adr.md` ADR auto-merge ルール | optional 化（auto-merge 設定がある repo のみ実行） |
| K | ADR 昇格（cleanup 内） | Plugin に含める。`docs/adr/` と `YYYYMMDD-NN-description.md` 命名を採用する repo のみ有効、未採用なら no-op |
| L | skill 本体は日本語、PR/Issue は英語 | 英語ルールを `CLAUDE.md` 設定可能化 |
| T | `gh issue edit` でラベル更新 | label set が無ければ no-op |
| C | `status: ready/blocked/implementing/designing/designed/in-review` ラベル | `CLAUDE.md` の `labels:` フィールドで定義、未定義なら skip |
| D | `docs/process.md` 参照（CLAUDE.md 経由） | 任意 |

**結論**: 修正範囲が最も広い。worktree 切替、ラベル運用 optional 化、preview/ADR 系を削除。

### `design-doc`

| 観点 | 検出 | 対応方針 |
|---|---|---|
| P | `docs/design/` 直下にファイル配置 | portable（標準ディレクトリとして提示） |
| P | ADR 配置先を `docs/design/adr/` と記述 — ただし karasu の実際の配置は `docs/adr/`（記述ミス） | **要修正**。実態に合わせて `docs/adr/` に統一 |
| B | `docs/design-<title>` 命名 | portable |
| K | ADR テーブル比較 | portable な概念 |
| C | `status: designing/designed` ラベル更新 | `start-dev` と同じく optional 化 |

**結論**: 軽微。ADR パスの記述ミスは karasu でもバグなので修正対象。

### `acceptance-test`

| 観点 | 検出 | 対応方針 |
|---|---|---|
| P | `docs/acceptance/` 配下、`NNNN-` 連番 4 桁 | portable な慣習として提示 |
| M | `packages/` 配下を `type: product`、それ以外を `type: tool` の判定 | **karasu 固有**。`type` 判定ルールは optional / configurable に |
| K | Playwright `packages/e2e/tests/` 直接参照 | テストフレームワーク名はパラメータ化、サンプルパスは一般化 |
| K | AT-0004 / AT-0014 等 karasu 固有の AT への参照 | plugin からは例として残してよいが「karasu の例」と明示 |
| K | #916/#918/#919/#920 等 karasu Issue 番号 | 削除 |
| K | `pnpm at:check-coverage` コマンド | コマンド名は plugin から削除し、「coverage 検査ツールを併用するとよい」と一般化。実体は karasu 側に残す |
| L | skill 本体は日本語、ファイル名は英語 kebab-case | portable |

**結論**: 中程度。`type: product/tool` 判定ロジックと karasu 固有の Issue/AT 参照を削除。

### `qa`

| 観点 | 検出 | 対応方針 |
|---|---|---|
| P | `docs/acceptance/*.md` 読み込み | portable |
| P | `docs/qa/YYYY-MM-DD-checklist.md` 出力 | portable |
| M | bash コードブロック実行（自動検証） | portable（AT 内のコマンドを実行する仕組み自体は汎用） |
| C | `type: product/tool` フロントマター判定 | `acceptance-test` と整合させる（optional） |

**結論**: 軽微。`type` 判定だけ揃えれば portable。

### `review-docs`

| 観点 | 検出 | 対応方針 |
|---|---|---|
| P | `docs/**/*.md` および `CLAUDE.md` | portable |
| P | `docs/review/YYYY-MM-DD-review.md` 出力 | portable |
| K | CLAUDE.md ドキュメント表という規約 | karasu 慣習。汎用化するなら「`CLAUDE.md` に記載されたパスの実在チェック」と一般化 |
| K | ADR ↔ Design Doc 対応 | portable な概念 |
| K | Design Doc ↔ AT 対応 | portable |
| K | AT 番号重複・実装ファイル参照（packages/）チェック | `acceptance-test` の慣習に依存。AT を採用していない repo では skip |

**結論**: 軽微。各チェック項目を「対応ディレクトリが存在する場合のみ実行」に変更。

### `sync-docs`

| 観点 | 検出 | 対応方針 |
|---|---|---|
| P | `packages/core/src/` `packages/app/src/` 直接参照 | **karasu 固有のレイアウト**。`CLAUDE.md` の「対象ドキュメント」表から動的に判定する形に |
| K | 対象ドキュメント一覧（`README.md`, `docs/concepts.md`, `docs/spec/syntax.md` 等） | **karasu 固有**。`CLAUDE.md` の「ドキュメント表」をパースして対象を決める汎用化が必要 |
| K | .krs 構文・スタイルなど karasu 固有の調査観点 | サブエージェントのプロンプトを「`CLAUDE.md` のドキュメント表に書かれた各項目について実装現状を調査せよ」に一般化 |

**結論**: 大きい。skill の調査観点を karasu の語彙から `CLAUDE.md` 駆動に一般化する必要がある。`sync-docs` は plugin 化のハードルが最も高い候補。

## まとめ — Plugin 化の難易度

| 難易度 | 対象 |
|---|---|
| 🟢 低（ほぼそのまま） | `commit`, `qa`, `review-docs`, `design-doc` |
| 🟡 中（パス・ラベル系の optional 化） | `acceptance-test`, `start-dev`, `ship` |
| 🔴 高（karasu 語彙からの脱却） | `sync-docs` |

## 共通化すべき抽象化ポイント

#1086（decouple）で実装する横断的な仕組み案:

1. **Worktree path**: `.claude/worktrees/<branch-name>` を skill 全体で統一（#1085 で検証）。
2. **ラベル運用**: `CLAUDE.md` の `labels:` セクション（仮）で `ready / blocked / implementing / designing / designed / in-review` の利用有無を宣言。skill は宣言された range のラベルしか操作しない。
3. **言語ポリシー**: `CLAUDE.md` の `language:` セクション（仮）で commit subject / PR description / Issue 本文の言語を定義。skill のチェック処理はこれを参照。
4. **package manager**: lock file（`pnpm-lock.yaml` / `package-lock.json` / `yarn.lock`）または `package.json` の `packageManager` フィールドから検出。無ければ install ステップを skip。
5. **ドキュメント構造**: `docs/design/` `docs/adr/` `docs/acceptance/` `docs/qa/` `docs/review/` の有無を実行時にチェック。無いものはその skill のサブステップを skip。
6. **テンプレート**: `.github/PULL_REQUEST_TEMPLATE.md` 不在時の fallback PR 本文テンプレを plugin 内に持つ。
7. **ADR 昇格ワークフロー**: Plugin に含める（optional）。skill は `docs/adr/` と `YYYYMMDD-NN-description.md` 命名規則の存在を実行時にチェックし、無ければ no-op。validator / lefthook / schema 等の周辺ツールは plugin の対象外（`kompiro/adr-tools` 等の独立リポジトリの管轄）。
8. **karasu 固有部分の切り出し**: Cloudflare Pages の preview URL 表示と `pnpm at:check-coverage` 等の karasu 専用コマンドは plugin 本体からは除去し、karasu 側に残す。

## 削除対象（plugin 化時に外す karasu 固有要素）

- `*.karasu.pages.dev` の preview URL 構築ロジック
- ADR-20260413-01 への参照（karasu 固有 ADR 番号）
- `.claude/rules/adr.md` への直接参照（auto-merge ルールは optional 化して plugin に内包）
- karasu 固有の Issue 番号（#916, #918 など）
- `pnpm at:check-coverage` 等の karasu 固有スクリプト名（カバレッジ検査の概念は一般化して残す）
- `cd /workspaces/karasu` 等の絶対パス

## Plugin に含めるが optional 化する要素

- ADR 昇格ワークフロー（`/start-dev` cleanup 内）— `docs/adr/` ディレクトリと命名規則を採用する repo でのみ有効
- ADR PR の auto-merge 設定 — `gh pr merge --auto --squash` が許可されている repo でのみ有効

## 次ステップ

#1086（decouple）でこのマトリクスに従い、karasu のままで動かしながら一般化を進める。
