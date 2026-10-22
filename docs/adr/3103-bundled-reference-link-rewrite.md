---
id: ADR-3103
title: skill に同梱する reference は、相対リンクだけを書き換えたコピーにする
status: accepted
date: 2026-10-19
topic: chat-ai
refines: [ADR-2901]
related_to: [ADR-1681]
scope:
  packages: [cli]
  concerns: [deployment]
assumptions:
  - "symbol: scripts/lint/skill-reference-bundle-sync.ts :: bundledContent"
  - "symbol: scripts/lint/skill-reference-bundle-sync.ts :: REPOSITORY_BLOB_URL"
  - "grep: scripts/lint/skill-reference-bundle-sync.test.ts :: links in the bundled copies"
  - "file: docs/test-perspectives/TPL-3103-shipped-doc-links-resolve-where-installed.md"
  - "file: docs/acceptance/3103-skill-reference-links.md"
---

# ADR-3103: skill に同梱する reference は、相対リンクだけを書き換えたコピーにする

- **日付**: 2026-10-19
- **ステータス**: 決定済み
- **関連**:
  - Issue #3103（起点。#3102 のレビューで CodeRabbit が指摘した）、実装 PR #3267。Design Doc は書かず、選択肢は Issue と実装 PR の中でユーザーが決めた
  - [ADR-2901](2901-karasu-authoring-skill.md)（skill の配布と drift guard。「`docs/` の原本とバイト単位で一致」を本 ADR で「リンク以外は一致」に改める）
  - [ADR-1681](1681-cli-pack-only-bundle.md)（出荷物の中身を決定論的に保つ。書き換えも決定論的な変換にした）
  - TPL: [TPL-3103](../test-perspectives/TPL-3103-shipped-doc-links-resolve-where-installed.md)（新規、retrospective。#1779 の VS Code Marketplace README の画像も同じ根）
  - AT: `docs/acceptance/3103-skill-reference-links.md`
  - コード: `scripts/lint/skill-reference-bundle-sync.ts`（`bundledContent`）

## 背景

ADR-2901 は skill ごとの `reference/` を `docs/` の原本の**バイト単位のコピー**とし、`skill-reference-bundle-sync` がその一致を検査すると決めた。
コピーは `packages/skills/skills/{karasu-author,reverse-architecture}/reference/` に 4 本ずつある（`syntax.md` / `notation-cookbook.md` / `tags-annotations.md` / `diagnostics.md`）。

原本の相対リンク（`../test-perspectives/TPL-….md`、`../adr/….md` など）は repo の `docs/` を前提に解決される。
`karasu-skills` パッケージが出荷するのは `.claude-plugin/` と `skills/` だけなので、skill を入れた先ではリンク先が 1 つも存在しなかった。
4 本で 179 本のリンクがこの状態だった（`syntax.md` だけで 63 本）。

バイト単位の一致を検査しているため、コピーの側でリンクを 1 本直すと drift guard が落ちる。
原本と同じ PR では直せないので、決定として扱った。

## 決定

コピーを作るときに相対リンクだけを書き換え、それ以外は原本と一致させる。

1. **書き換える範囲**: リンク先が相対パスのもの（scheme を持たない、`#…` でも `/…` でもない）で、fenced code の外にあるもの。原本のディレクトリを基準に解決してから書き換える。
2. **同梱している原本へのリンク**: 隣のコピーを指す（`../spec/syntax.md` → `syntax.md`）。すでにその形で読めるリンク（`docs/spec/` からの `./syntax.md` など）はそのまま残す。
3. **それ以外へのリンク**: GitHub 上の原本を指す（`https://github.com/kompiro/karasu/blob/main/<path>`、`REPOSITORY_BLOB_URL`）。anchor とリンクの title は保つ。
4. **drift guard**: `check()` は各コピーを「書き換えた原本」と文字列で比べ、`write()`（`--write`）はその書き換えた原本を書く。検査は文字列比較のまま変えない。
5. **リンクの柵**: `skill-reference-bundle-sync.test.ts` の `links in the bundled copies` が実際のコピーを読み、すべてのリンクが同梱の中で解決するか、repo に存在するファイルを GitHub で指すことを確かめる。
6. 同梱の README と AT-2912 AT-C の「バイト単位で同一」は「リンク以外は同一」に改めた。

## 理由

- skill を入れた先で、リンクが辿れる。同梱のファイル同士は手元で開け、それ以外は GitHub の原本で読める。
- 出典（どの TPL / ADR が規定の根拠か）がコピーにも残る。エージェントが規定の経緯を確かめたいときに辿れる。
- 書き換えは原本から決定論的に決まる変換なので、drift guard は文字列比較のまま保てる。「コピーを手で直さない」という ADR-2901 の運用も変わらない。
- 変更は sync スクリプト 1 か所で済み、原本の書き手はリンクを repo の相対パスで書き続けられる。

## 却下した案

- **リンクを落とす（strip）**: `> Related TPLs:` 注釈や ADR へのリンクをコピーから外す。エージェントが参照を読むときに経緯はあまり要らないが、出典が消え、原本との差分が「リンク」から「段落の有無」に広がる。どこまで落とすかの線引きも必要になる。
- **バイト単位の一致を保ち、リンク切れを受け入れる**: 同梱の README が「意図した trade-off」として書いていた現状。skill を入れた先で 179 本のリンクがすべて切れたままになり、#1779（Marketplace README の相対パスの画像）と同じ失敗を繰り返す。
- **`docs/` の該当ツリーも同梱する**: リンク先の TPL / ADR は数百ファイルあり、skill が必要とする文法とは関係がない。パッケージを大きくするだけで、同梱の外を指すリンクは結局残る。

## 影響

- `karasu-skills` の reference は原本と「リンクだけ違う」コピーになる。原本を編集したら、これまでどおり `pnpm run lint:skill-reference-bundle-sync --write` で作り直す。
- GitHub のリンクは `main` を指すので、出荷した版より新しい内容を表示しうる（リンク先のファイルが後で消えれば 404 になる）。版で固定するかは決めずに残した。
