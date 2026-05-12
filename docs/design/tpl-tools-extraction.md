# tpl-tools の standalone リポジトリ切り出し

- **日付**: 2026-05-12
- **ステータス**: 検討中
- **関連**: #1357（このタスク）, #1074（adr-tools 切り出しの先行事例）, [ADR-20260509-04](../adr/20260509-04-test-perspective-library.md)（TPL 運用の決定）, [ADR-20260512-03](../adr/20260512-03-reference-data-single-source.md)（reference-data の single-source 設計）

## 背景

`scripts/tpl/` には Test Perspective Library（TPL）を扱うツール群（合計 ~1100 LOC）が置かれている:

| ファイル | 役割 |
|---|---|
| `validate.ts` / `cli.ts` | TPL frontmatter とファイル名規約・README インデックスの検証 |
| `related.ts` / `related-cli.ts` | `topic` / `scope.packages` でフィルタした関連 TPL 一覧の算出・整形 |
| `review-body.ts` | DesignDoc/PR 用の「関連 TPL」セクション本文生成 |
| `*.test.ts` | 上記の vitest |

これは karasu のプロダクトコードではなく「Markdown + frontmatter のドキュメント群を扱う汎用ツール」であり、adr-tooling と同様に独立トピックである（memory: *adr-tooling topic*）。`@kompiro/adr-tools`（#1074）を GitHub Packages に切り出した先行事例があるため、TPL ツールも同じ方針で `kompiro/tpl-tools` → `@kompiro/tpl-tools` に切り出す。

## 設計判断

### 1. adr-tools に同梱せず、独立パッケージにする

検討: TPL ツールを `@kompiro/adr-tools` に同梱するか、独立 package にするか。

**決定: 独立 package（`@kompiro/tpl-tools`）。**

- TPL は ADR と語彙もライフサイクルも異なる（concept → proactive TPL → development → bug → retrospective TPL、`topic` / `scope.packages` / `status: active|deprecated` という TPL 固有スキーマ）。adr-tools に混ぜると「ADR ツール」から「kompiro の開発方法論ツール一式」へスコープが膨らみ、adr-tools のリリースが TPL 都合で動く。
- adr-tools は他プロジェクトで「ADR だけ」採用しうる汎用性がある。TPL 概念はまだ karasu/kompiro 固有の方法論なので、汎用ツールに混ぜない。

### 2. `loadConfig` も自前で持つ（adr-tools に依存しない）

現状 `scripts/tpl/cli.ts` は `loadConfig` を `@kompiro/adr-tools` から import している。共有しているのは実質これだけ。

**決定: tpl-tools は自前の config ローダを持ち、`@kompiro/adr-tools` への依存を持たない。**

- publish 済みパッケージ同士を数十行の helper のために依存させると、adr-tools のバージョンを上げないと tpl-tools が動かないという時間結合が生まれる。
- TPL の設定が ADR の設定形式に引きずられる。本来 TPL 固有のキーを自由に持ちたい。
- 「ADR は使わず TPL だけ」採用パスで余計な依存が入る。
- 将来 frontmatter-docs 系ツールが 3 つ目・4 つ目に増えたら、その時点で `@kompiro/frontmatter-tools`（仮）的な土台を抜く。今は YAGNI。

### 3. `topics` 語彙の参照先（要検討ポイント）

TPL validator は「許可された `topic` 一覧」を **`adr.config.json` の `topics`** から読んでいる（ADR-20260512-03: reference-data は単一ソース）。tpl-tools を adr-tools から切り離すと、この語彙ソースの扱いが論点になる。

**決定: tpl-tools 内に `adr.config.json` をハードコードしない。** tpl-tools は「reference-data 設定ファイルのパス（および読むべきキー）を呼び出し側から受け取り、その中の `topics` を読む」インターフェースとし、ファイル名の既定値も持たない（パス未指定なら `topics` 検証はスキップ）。karasu 側の wiring（`package.json` の `tpl:*` script / lefthook / CI）が `--config adr.config.json`（または同等の指定）を渡す。

これにより:

- ADR-20260512-03 の single-source 原則は karasu スコープで維持される（karasu では `adr.config.json` が唯一のソースであり続ける）。
- tpl-tools は `adr.config.json` というファイル名・存在に依存しない（ADR を採用しないプロジェクトでもそのまま使える）。
- adr-tools 側の変更も karasu の設定ファイル移行も不要（非破壊）。

> 将来「`topics` を ADR と無関係な中立ファイル名に移す」案（例: `reference-data.json`）も考えられるが、それは adr-tools 側を触るタイミングで別途検討する。今回の tpl-tools 切り出しはその判断と独立に進められる。

## 移行フェーズ（案）

adr-tools 切り出し（#1074 系の Phase 1〜4）の構造を踏襲する。

1. **Phase 1 — リポジトリ作成・publish**: `kompiro/tpl-tools` を作成し、`scripts/tpl/` の中身を移植。`loadConfig`（adr-tools 依存）を、reference-data 設定ファイルのパスを引数で受け取る自前実装に置換（`@kompiro/adr-tools` import を除去、`adr.config.json` のハードコードもしない）。`@kompiro/tpl-tools` を GitHub Packages に publish（バージョン `0.0.x`）。CLI bin（`tpl validate` / `tpl related` / `tpl review-body` 相当、`--config <path>` オプション付き）を提供。
2. **Phase 2 — karasu を consumer に切り替え**: `package.json` に `@kompiro/tpl-tools` を追加（`.npmrc` + `NODE_AUTH_TOKEN` は adr-tools と同じ経路、追加設定不要）。`scripts/tpl/` を削除し、`package.json` の `tpl:*` scripts を `pnpm exec tpl ... --config adr.config.json`（karasu 側で参照先を指定）に置換。`lefthook.yml` の `tpl-validate` と `.github/workflows/tpl-validate.yml` を新 CLI 呼び出しに更新（`glob` から `scripts/tpl/**` を除去）。`pnpm run test:scripts` から TPL 分が消えることを確認。
3. **Phase 3（任意）— ドキュメント追従**: `docs/test-perspectives/README.md`・`CLAUDE.md`・関連 ADR のツール参照を更新。`docs/process.md` に TPL ツールが外部 package である旨を追記。
4. **Phase 4 — ADR 昇格**: 切り出し完了後、この DesignDoc を ADR 化（adr-tooling / reference-data 周辺の既存 ADR と整合させる）。

> 各 Phase は別 PR・別 Issue に分割してよい（#1357 を親に子 Issue を切る運用は adr-tools と同じ）。

## 影響範囲・リスク

- **CI**: `tpl-validate` workflow は現状「informative-only（required ではない）」なので、切り替え時の required check への影響なし。
- **lefthook**: pre-push hook で `pnpm run tpl:validate` が走る。CLI 置換後も同名 script を維持すれば hook 側の変更は最小。
- **`adr.config.json` 依存**: 上記「設計判断 3」の通り tpl-tools 側はファイル名に依存せず、karasu の wiring が `--config adr.config.json` を渡すだけなので、karasu 側の設定ファイル変更は不要。
- **テスト**: TPL validator のテストは新リポジトリへ移る。karasu 側 `packages/`（`scripts/` の vitest）からは消えるため、`test:scripts` の対象縮小を確認する（TPL 専用テストが消えるだけで他 scripts のテストは残る）。
- **オフライン / token なし環境**: adr-tools と同様、`NODE_AUTH_TOKEN` 無しでは install できない。CI / devcontainer は既に対応済み（adr-tools 導入時に整備）。

## 関連 TPL

このタスクはツールの移設であり .krs / app の振る舞いを変えないため、直接該当する TPL は無い。強いて挙げれば「設定の単一ソース」を扱う [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)（spec doc ⇄ reference-data sync）の精神に沿って、`topics` 語彙の参照を二重定義にしない（設計判断 3）。
