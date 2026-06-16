# docs-site Examples gallery（ビルド時レンダリングでコード + 図を併置）

- **日付**: 2026-06-16
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1628](https://github.com/kompiro/karasu/issues/1628)（docs site Phase 2 — 本 Design Doc はうち「Examples gallery」項目）
  - 親 ADR: [ADR-20260616-03](../adr/20260616-03-docs-site-ssg.md)（docs-site SSG 選定。Phase 2 で examples gallery を予定と明記）
  - 関連: [ADR-20260616-02](../adr/20260616-02-guide-embedded-diagrams.md)（guide の hero スニペット → 併置 SVG。#1574）
  - 関連 TPL: [TPL-20260616-01](../test-perspectives/TPL-20260616-01-docs-pipeline-link-anchor-resolution.md)（docs 取り込みパイプラインの link/anchor 解決）, [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)（正典 ↔ 再掲の片方向同期）
  - コード: `packages/docs-site/scripts/`, `examples/`, `packages/core/src/index.ts`（`compileProject` / `buildAllViewsSvgProject`）, `packages/cli/src/matrix.ts`（`NodeFileSystemProvider`）, `scripts/guide/gen-guide-diagrams.ts`

## 背景・課題

Phase 1 で `docs/`（guides / spec / concepts）から docs サイトを生成した。`examples/` には 14 のサンプル `.krs` プロジェクトがあるが、サイト上には載っていない。ユーザーが「コードと、そこから生成される図」を並べて見られる Examples gallery を追加し、karasu の出力（実際の auto-layout 図）を手早く確認できるようにしたい。

`examples/` を single source of truth に保ったまま、各サンプルを **コード + レンダリング図** で見せるページ群を docs サイトに生成するのが本設計のスコープ。Phase 2 の他項目（playground 埋め込み・switcher 移行・search 強化）は扱わない。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| examples 構成 | 14 ディレクトリに `.krs`。エントリ名は不揃い（`index.krs` / `system.krs` / `01-system.krs` / `editor.krs`）。`github-actions/` は `.krs` を持たない（CI ワークフロー例）。`examples/README.md` が Getting Started / Themed Scenarios / Feature Samples の 3 群に整理 |
| multi-file | `multi-file-system/`・`deploy/` 等は `import` で複数ファイルを跨ぐ。`ec-platform/` は段階チュートリアル（`01-system.krs`…`06-deploy/`）で単一エントリを持たない |
| レンダリング API | core に `compileProject(path, fs, opts)` と `buildAllViewsSvgProject(path, fs, …)`（import 解決込みで全ビュー SVG 化、async）。単一ファイルは `compile()` + `buildAllViewsSvg()` |
| FS 抽象 | core は `FileSystemProvider` interface を取る。`packages/cli/src/matrix.ts` に Node 実装 `NodeFileSystemProvider`（~30 行）があり流用できる |
| 既存の図生成 | `scripts/guide/gen-guide-diagrams.ts` が guide の `krs` fence を **committed SVG** にして drift check（#1574 / ADR-20260616-02）。examples とは別系統 |
| docs-site sync | `packages/docs-site/scripts/sync.ts` が `docs/` → Starlight content collection を生成（gitignore）。`check-links` が in-site link/anchor をビルド時検証（TPL-20260616-01） |

## 制約・前提

- **`examples/` が single source of truth**。サイト用に `.krs` を複製しない。SVG は **ビルド時に毎回レンダリング**し、コミットしない（生成物は gitignore）。→ examples を編集すれば次ビルドで反映、drift 構造が生まれない（TPL-20260510-18 と同じ「sidecar を持たない」発想）。
- **bilingual**（en / ja）。図（SVG）は言語非依存なので共有し、説明文・ページ chrome だけローカライズする。
- **multi-file は `compileProject` + `NodeFileSystemProvider` で import 解決**して描画する。
- **対象は manifest で明示列挙**する（エントリ名が不揃い・どのビューを出すかが example ごとに違うため）。`github-actions/` は除外。
- **PR CI 安全性**: docs-site build は PR CI に乗らない（`pages.yml` のみ）。全 example のレンダリングが通ることを **vitest の smoke test** で PR 時に担保する。
- **out of scope**: playground 埋め込み・switcher 移行・search 強化（#1628 の別項目）。pixel-perfect な図の調整は非目標（auto-layout が karasu の実出力）。

## 検討した選択肢

### 案1: ビルド時レンダリング（採用）

docs-site の sync 時に manifest を辿り、各 example を `compileProject` / `buildAllViewsSvgProject` で SVG 化して gallery ページに inline 埋め込みする。SVG はコミットしない。

**メリット**

- examples が唯一の正典。SVG は毎ビルド派生 → **drift し得ない**（committed SVG のような「古い SVG が残る」事故がない）。
- `examples/` リポジトリが SVG で汚れない。drift guard 面が増えない。

**デメリット**

- GitHub 上で example の SVG を直接プレビューはできない（サイトでのみ見える）。Phase 1 で `examples/` リンクは GitHub に飛ばす方針なので許容。
- レンダリングがビルド時間に乗る（`pages.yml` のみ。14 example × 数ビュー程度なので軽微）。

### 案2: committed SVG + drift check（guide diagrams と同方式）

`scripts/` に gen スクリプトを足し、example SVG をコミット + `--check` を lefthook/CI に載せる。

**メリット**: GitHub でも SVG プレビュー可。guide diagrams と方式が揃う。

**デメリット**: コミット物（14×複数ビューの SVG）が増え、**drift guard 面がもう一つ増える**。gallery はサイト専用面なので committed にする動機が弱い。

## 現時点の方針

**案1（ビルド時レンダリング）を採用する** — examples を正典に保ったまま SVG を派生にでき、drift 構造も guard 面も増えない。guide diagrams が committed なのは GitHub 素読みの markdown に埋めるためで、サイト専用の gallery には当てはまらない。

### 実装の指針

1. **manifest**（`packages/docs-site/scripts/examples-manifest.ts`）: example ごとに `{ dir, entry, views, group, title{en,ja}, blurb{en,ja} }` を列挙。`github-actions` は載せない。確定事項:
   - **`ec-platform`**: `03-domains.krs`（フル drill-down の system ビュー）を代表として **1 ページ**にする（素の `01-system.krs` より見栄えが良い）。
   - **`feature-samples`**: **1 ページにまとめ**、各サンプルを section（見出し + コード + 小さな図）で縦並びにする（`examples/README.md` の表と整合）。
   - **どのビューを出すか**は example ごとに manifest で明示（`deploy-only` は deploy、`org-only` は org 等）。
2. **レンダラ**（sync から呼ぶ）: **read-only な FileSystemProvider**（`readFile` / `readDir` / `exists` のみ。`matrix.ts` の実装を参考に **docs-site 内に複製**する。core は `node:*` 非依存の Pure TS を保つため core には置かない — `FileSystemProvider` interface が core にあるのは実装を環境別パッケージに置くため）+ `compileProject` / `buildAllViewsSvgProject` で manifest の各 example を SVG 化。空ビュー（内容の無い view）は出さない。
3. **ページ生成**: sync 時に gallery ページを content collection へ生成。
   - index `/examples/`（en）/ `/ja/examples/`: README の 3 群でグルーピングした一覧。サイドバーに "Examples" 群を追加。
   - 各 example `/examples/<name>/`: タイトル + blurb、該当ビューの SVG、entry ファイルのソース（`krs` ハイライト）、multi-file は「全ファイルを GitHub で見る」リンク、`examples/<dir>/` への GitHub リンク。
4. **smoke test**（`packages/docs-site/scripts/.../*.test.ts`）: manifest の全 example が例外なくレンダリングでき、想定ビューが非空であることを assert（PR CI に乗る）。
5. **check-links**: gallery ページの in-site リンクを既存 guard の検証対象に含める（gallery ルートを published set に加える）。
6. **AT**: `docs/acceptance/1628-examples-gallery.md`。TC は manifest 全 example のレンダリング成功 / index と各ページの到達（en+ja）/ multi-file（`multi-file-system`）の import 解決 / `krs` ハイライト / 空ビュー非表示。
7. **ADR 昇格**: 実装完了後 `docs/adr/<date>-NN-docs-site-examples-gallery.md` に昇格し、本 Design Doc を同 PR で削除。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（サイトに gallery 面が増えるのみ）。`examples/` の編集体験は不変。
- ドキュメント更新: 必要なら `docs/process.md` に gallery の生成手順を 1 行追記。
- テスト・examples への影響: examples の `.krs` は変更しない。新規 smoke test を追加。

## 決定済み（当初の未解決を確定）

- **`ec-platform`**: `03-domains.krs`（フル drill-down の system ビュー）で 1 ページ。
- **`feature-samples`**: 1 ページにまとめ、各サンプルを section（コード + 図）で縦並び。
- **`NodeFileSystemProvider` の置き場所**: docs-site 内に read-only 複製（core の Pure TS 方針を壊さないため core には置かない）。

## 未解決の問い / 決めないこと

- search 強化・versioned docs・playground 埋め込みは本 Design Doc では決めない（#1628 の別項目）。
