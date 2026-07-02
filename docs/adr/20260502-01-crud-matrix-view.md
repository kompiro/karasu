---
id: ADR-20260502-01
title: CRUD マトリクスビュー（usecase × resource）を派生プロジェクションとして提供する
status: accepted
date: 2026-05-02
topic: cli
related_to:
  - ADR-20260430-03
  - ADR-20260430-04
scope:
  packages:
    - core
    - cli
    - app
assumptions:
  - "file: packages/core/src/view/crud-matrix-extract.ts"
  - "file: packages/core/src/view/crud-matrix-format.ts"
  - "file: packages/core/src/render/matrix-svg.ts"
  - "file: packages/cli/src/matrix.ts"
  - "file: packages/app/src/components/CrudMatrixPanel.tsx"
  - "symbol: packages/core/src/view/crud-matrix-extract.ts :: extractCrudMatrix"
  - "symbol: packages/core/src/view/crud-matrix-format.ts :: formatMatrixAsMarkdown"
  - "symbol: packages/core/src/view/crud-matrix-format.ts :: formatMatrixAsCsv"
  - "symbol: packages/core/src/render/matrix-svg.ts :: renderMatrixAsSvg"
---

# ADR-20260502-01: CRUD マトリクスビュー（usecase × resource）を派生プロジェクションとして提供する

- **日付**: 2026-05-02
- **ステータス**: 決定済み
- **実装**: PR #1073（Issue #1062）
- **関連**:
  - Design Doc: crud-matrix-view.md（昇格元、削除済み）
  - ADR-20260430-03: usecase 内 resource の `operations` プロパティ
  - ADR-20260430-04: usecase view edge の read/write 差別化
  - 受け入れテスト: `docs/acceptance/1062-crud-matrix-view.md`

## 背景

ADR-20260430-03 で `usecase` 内 `resource` に CRUD verbs（`operations`）が乗り、ADR-20260430-04 で usecase view 上のエッジに write/read の視覚軸が入った。しかしどちらも **in-place reading**（usecase ビューを開いて目で追う）に最適化されており、システム移行の動線である「resource X を切り出すと、どの usecase が壊れるか／何個 read で済むか」（列スキャン）と「usecase Y は何種類の resource に触っているか」（行スキャン）には集約された表示が要る。

## 決定

`usecase × resource` の CRUD マトリクスを、**新しい `.krs` 構文ではなく派生プロジェクション**として提供する。出力面は CLI（md/csv/svg）と app の専用タブの 2 系統。

### 構造

- **抽出**: `extractCrudMatrix(systems, options): CrudMatrix` を `packages/core/src/view/crud-matrix-extract.ts` に置く。`view-extract.ts` などの既存 derived view と同じパターン。
- **整形**: `formatMatrixAsMarkdown` / `formatMatrixAsCsv` / `renderMatrixAsSvg` の純関数に分離。
- **CLI**: `karasu matrix [file] --format md|csv|svg`（default `md`）。`--service` / `--infra` / `--external` / `--writes-only` / `--omit-empty` / `--no-totals` フラグ。
- **render co-export**: `karasu render --include-matrix` で system 図 SVG と同じディレクトリに `<stem>.matrix.svg` を出力。
- **App**: `DiagramTabBar` に `CRUD` タブを追加。Matrix モード時は preview-toolbar（Icon Mode / All Layers 等）は描画しない。
- **セル表記**: 認識済み verb を CRUD 順に頭文字連結（`CR`, `CRU`, ...）。`?` 単独は「関係はあるが `operations` 未宣言」、`R?` 等の `?` suffix は「装飾無しの unrecognized verb 混在」。write を含むセルは accent 色背景。
- **Σ 集計**: 行末・列末に CRUD 別のカウントを表示（`ΣC ΣR ΣU ΣD`）。CRUD カバレッジ穴（"create はあるが delete が無い resource" 等）の発見を容易にする。
- **空行・空列**: 全 format で **default は show**。`--omit-empty` で省略可能。format ごとに default を変えるとユーザーが混乱するため一貫させる。

## 理由

- **`.krs` 文法を汚さない** — system / deploy / org のいずれも構文宣言を持たない derived view であり、本機能を新しい view kind にすると一貫性が崩れる。フィルタ保存ニーズは CLI flag preset / panel state 永続化で別途解決可能。
- **複数面サポートのコストが低い** — 同じ `CrudMatrix` データから md / csv / svg を projection するだけ。grep する動線（CSV/MD）と眺める動線（SVG）の両方が migration analysis では現実に必要。
- **頭文字連結は CRUD マトリクスの慣習表記** — 学習コストゼロ。アイコン化は色覚・印刷・縮小に弱く、karasu の SVG-first 方針と相性が悪い。
- **`?` セル / `?` suffix で「未決定の許容」を維持** — ADR-20260430-03 の方針をマトリクス UX にも引き継ぐ。一律「verb 必須」にすると incremental なドキュメント整備を阻害する。
- **default show-empty** — 移行分析の "未宣言の進捗を見たい" 要求に応える。`--omit-empty` で大規模図にも対処可能。
- **App panel の filter を最小限**（service / infra dropdown のみ）にし、複雑な絞り込みは CLI に寄せる。"UI は preview、本番作業は CLI" の住み分けと整合。

## 却下した案

### 新しい view kind として `.krs` 構文を追加

system / deploy / org のいずれも構文宣言を持たない derived view であることと整合せず、パーサ・LSP・spec の改修コストに見合わない。フィルタ保存ニーズは CLI flag preset で個別に解決できる。

### SVG 出力のみ／CSV 出力のみに絞る

migration analysis は **grep する動線**と **眺める動線**の両方が現実に必要で、片方だけだと運用で詰まる。実装コストは共有データから projection するだけで小さい。

### セルを 4 サブセル分割（C/R/U/D の格子）

情報密度は均一になるが、80% のセルは `R` のみで overkill。視覚的にも grid が密になりすぎる。

### Unrecognized verb を warning だけ出して捨てる／自動的に CRUD に正規化する

ADR-20260430-03 が AST に保持する決定を覆すことになり、translate アダプタの round-trip が壊れる。マッピング辞書を karasu 側で持つ案は責務肥大 + 曖昧判断のオーナーシップ問題が出るため却下。代わりに **verb 装飾構文** をユーザーに提供する方向（follow-up Issue として切り出し）。

### format 別にデフォルトを変える（CSV のみ show-empty、md/svg は omit）

ユーザーが「同じ system でも format により行数が違う」と混乱するため、**全 format で default 一致**とした。

## Follow-up

- **verb 装飾構文（1:N CRUD マッピング、`replace:create,delete` 形式）** — ADR-20260430-03 の syntax 拡張として別 Issue で議論。本マトリクスは装飾無しでも動作（unrecognized verb を `?` suffix で表示）。装飾構文 landed 後に suffix が自然に減る。
- **App panel の状態永続化** — service / infra dropdown の選択や Matrix タブへの復帰位置を local storage 等で保存する案。別 Issue で扱う。
