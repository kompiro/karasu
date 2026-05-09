---
id: ADR-20260509-04
title: テスト観点ライブラリ（Test Perspective Library, TPL）の運用開始
status: accepted
date: 2026-05-09
topic: testing
related_to:
  - ADR-20260324-01
  - ADR-20260326-04
scope:
  packages:
    - core
    - app
    - cli
    - lsp
    - vscode
assumptions:
  - "file: docs/test-perspectives/README.md"
  - "file: docs/test-perspectives/TEMPLATE.md"
---

# ADR-20260509-04: テスト観点ライブラリ（Test Perspective Library, TPL）の運用開始

- **日付**: 2026-05-09
- **ステータス**: 決定済み
- **関連**:
  - Issue #1192
  - [ADR-20260324-01](20260324-01-manual-qa-over-e2e.md)（手動QA優先方針）
  - [ADR-20260326-04](20260326-04-app-testing-strategy.md)（`packages/app` のテスト戦略）
  - `docs/test-perspectives/`（本ADRで導入するライブラリの実体）

## 背景

`bug` ラベルの付いた Issue を振り返ると、その多くが「テスト観点（test perspectives）の漏れ」によって発生している。たとえば次のようなパターンが繰り返し観測されている。

- top-level の宣言（`KrsFile.systems` 外の orphan ノード）が一部の機能でだけ無視される（#1160）
- formatter が round-trip を破壊する変換を行う（#1101 / #1058）
- 列挙型のメンバーを追加した際、消費側の更新が漏れる（#1094）
- IME composition のような連続操作中に DOM が再描画されて状態が壊れる（#1053）
- データ表示の暗黙フィルタによって特定の値が描画されない（#999）

これらは個別バグとして都度修正してきたが、構造的なパターンとして**再発する性質**を持つ。修正のたびに学習を捨てており、新機能の DesignDoc 作成時や受け入れテスト設計時に過去の失敗から得た観点が参照されない状態になっていた。

## 決定

`docs/test-perspectives/` 配下に **テスト観点ライブラリ（Test Perspective Library, TPL）** を新設し、運用を開始する。

- 1 観点 = 1 ファイル（`TPL-YYYYMMDD-NN-<slug>.md`）。frontmatter スキーマは ADR と語彙を共有する（`topic` / `scope.packages` / `related_to`）
- 本文構成は「観点 / 想定される失敗モード / チェックリスト（3〜5項目）/ 既知の対処パターン / 関連テスト」
- 言語は日本語（docs/ の他ドキュメントと同じ）
- 追加判断は 3-Yes ルール:
  1. 同じ root cause が別の機能でも発生しうるか
  2. 構造的なパターンとして再発する可能性があるか
  3. 既存 TPL でカバーされていない観点か
- ADR とは役割を分ける:
  - **ADR**: 過去の判断（"我々はこう決めた"）
  - **TPL**: 未来の検証（"これを検証すべき"）

CLAUDE.md には TPL のパスと「DesignDoc 作成時 / 新機能実装時 / bug 修正時に参照すること」を明記する。

## 理由

- **再発防止コストの削減**: 一度学習した観点を構造化された形で残し、将来の DesignDoc / AT 作成者が自動的に参照できるようにする
- **ADR との役割分離が明確**: 判断の記録（ADR）とは独立した「観点のカタログ」として並立させた方が、用途が混ざらない
- **frontmatter 共有による相互参照**: ADR と同じ `topic` 語彙を使うことで、`topic: parser` で検索すれば関連 ADR と関連 TPL を同時に見つけられる
- **段階的に育てる**: いきなり validator や全件バックフィルを行うのではなく、過去 5 件の bug Issue から始めてテンプレートの実用性を検証する。Issue #1192 のスコープはこの **bootstrap** のみとする

## 却下した案

- **個別 Issue として処理し続ける**: 学習が散逸し続けるため却下
- **ADR の中に観点を埋め込む**: ADR は判断の記録という性質が強く、「未来の検証チェックリスト」を混在させると ADR の役割が肥大化する。語彙を共有しつつも別ディレクトリに分けることで責務を明確にした
- **CLAUDE.md に直接観点を列挙する**: 件数が増えると CLAUDE.md が肥大化し、loaded into every context の負荷が無視できなくなる。ライブラリ化して必要時のみ参照する形を採った
- **frontmatter validator / linter を最初から導入**: スキーマがまだ実用検証されていない段階で固定化するとフォーマット変更コストが上がる。最初の 5 エントリを書いた retrospective を経てから validator 化を検討する（Issue #1192 の out of scope）
