---
id: ADR-20260424-01
title: ADR knowledge graph — machine-readable frontmatter + tooling
status: accepted
date: 2026-04-24
topic: adr-tooling
related_to:
  - ADR-20260410-03
  - ADR-20260423-01
assumptions:
  - "grep: package.json :: @kompiro/adr-tools"
  - "file: docs/adr/TEMPLATE.md"
  - "file: docs/adr/effective.md"
  - "file: docs/adr/graph.md"
---

# ADR-20260424-01: ADR knowledge graph — machine-readable frontmatter + tooling

- **日付**: 2026-04-24
- **ステータス**: 決定済み
- **関連**:
  - Issue #788（Phase 1）, #790（Phase 2）, #799（Phase 3）, #816（本昇格 Issue）
  - PR #789（Phase 1 design doc）→ #791 / #792 → Phase 2 #793〜#798 → Phase 3 #801 / #802 / #805 / #806 / #808 / #809 / #810 / #814 / #819
  - 前身: `docs/design/adr-knowledge-graph.md`（本 ADR で削除）
  - [ADR-20260410-03](20260410-03-structural-krs-patch.md) — テキスト→構造化データへの段階移行の先行事例
  - [ADR-20260423-01](20260423-01-adr-body-ref-check.md) — body↔frontmatter 参照一貫性の follow-up
  - `scripts/adr/*.ts`, `docs/adr/TEMPLATE.md`, `docs/adr/effective.md`, `docs/adr/graph.md`, `docs/adr/graph/*.md`

## 背景

`docs/adr/` は 100 本を超えて人間の目視では整合性を保てない規模になり、次の 5 つの問題が顕在化した:

1. accepted ADR が暗黙に superseded/deprecated に依存していても検出できない
2. supersede 双方向の整合が人手頼み (`Superseded by` の書き漏れ)
3. あるモジュールに関わる現役 ADR だけを抽出する手段が README 目視のみ
4. ADR が依拠する前提がコード変更で崩れても沈黙したまま
5. AI へ渡す ADR コンテキストが全件 or 人間選別しかなく粗すぎる

Phase 1 設計ドキュメントが 2026-04-22 に合意され、以降 Phase 2（全 ADR 移行）と Phase 3（ツール整備）を段階的に実装。

## 決定

ADR を **典型的な型システムを持つ知識グラフ** として扱い、以下の要素で機械的に管理する:

### スキーマ — YAML frontmatter

必須: `id` / `title` / `status` / `date` / `topic`
任意: `supersedes` / `superseded_by` / `depends_on` / `related_to` / `conflicts_with` / `refines` / `scope.{packages,concerns}` / `assumptions` / `authors`

### 統制語彙

- `status`: `proposed | accepted | deprecated | superseded | not_adopted`
- `topic` (15 値): `core-concepts | parser | resolver | renderer | edges | styling | navigation | app-ui | project | chat-ai | cli | vscode | testing | build | adr-tooling` — README.md セクション見出しと同期
- `scope.concerns` (7 値): `accessibility | ci | dependencies | deployment | i18n | performance | security` — **トピックと直交する横断関心事**。旧名 `scope.domains` は karasu 本体の `domain` モデリング要素と衝突するため #814 でリネーム

### 関係性セマンティクス

| 関係 | 方向 | 意味 |
|---|---|---|
| `supersedes` / `superseded_by` | 双方向（バリデータが強制） | 時間軸の置き換え |
| `depends_on` | 一方向 | 前提。サイクル不可、accepted が superseded/deprecated/not_adopted に依存するのはエラー |
| `related_to` | 参照のみ | 意思決定には影響しない |
| `conflicts_with` | 双方向 | 同時採用不可 |
| `refines` | 一方向 | 抽象→具体。サイクル不可 |

### ツール層 (`scripts/adr/`)

| CLI | 役割 |
|---|---|
| `pnpm adr:validate` | スキーマ + 関係整合 + body↔frontmatter 参照チェック |
| `pnpm adr:extract <effective\|slice\|closure>` | 読み出しクエリ (3 軸 `--package` / `--concern` / `--topic`) |
| `pnpm adr:visualize` | トピックグループ化 overview + ghost ノード付きトピック別詳細 |
| `pnpm adr:regenerate [--check]` | `effective.md` / `graph.md` / `graph/<topic>.md` を再生成、CI で drift を検出 |
| `pnpm adr:check-assumptions` | `assumptions` 文字列を working tree に対して評価。`file:` / `symbol:` / `grep:` の 3 形式 |

これらは lefthook pre-push と `.github/workflows/adr-validate.yml` の両方に組み込み、ADR/scripts 変更時のみ走る。

### AI コンテキストへの影響

`docs/adr/effective.md` (自動生成、トピック別の accepted+非 superseded 一覧) を `CLAUDE.md` が第一参照として指す。AI に「resolver を触ってほしい」と頼むと、トピック slice で絞られた有効 ADR だけが文脈に入る設計。

## 理由

- **frontmatter を正本、その他は生成物** — effective.md / graph.md / graph/*.md はすべて `--write-all` で再生成され、`--check` で drift を検出するため、人間が個別にメンテする必要がない。
- **controlled vocabulary** — topic と concerns を enum 化することで、タイポで slice クエリが静かに壊れる事態を防ぐ。
- **segregation of topic vs concerns** — topic は「ADR のトピック」(排他的カテゴリ)、concerns は「トピックと直交する横断関心事」。重複を避けるため concerns の値は意図的に狭く (7 件)。
- **assumptions** — ADR が依拠する前提を構造化文字列 (`file:` / `symbol:` / `grep:`) で記述することで、コードリネームや削除に対して CI が失敗するようになり、ADR が沈黙したまま古くなる問題を防ぐ。
- **incremental migration** — Phase 1 はバリデータ + 代表 6 本、Phase 2 は全 111 本を 5 回に分けて移行、Phase 3 はツール整備と rename。各段階で CI green を保ちつつ進めた。

## 却下した案

- **別ファイルでメタデータ管理** (`20260422-05.meta.yaml`) — 本文との drift 不可避、GitHub 上の「1 ADR = 1 ファイル」単純性を損なう
- **中央レジストリ** (`docs/adr/index.yaml`) — PR コンフリクトが起きやすく、ADR 追加のたびに更新を忘れる
- **単一の `related` バッグ** — supersede/depends_on 区別不能で検証ルールが書けない
- **連番 ID** (ADR-0001 …) — 100 本超の再採番と本文リンクの一括書き換えが発生
- **日本語ステータス語彙** — 英日混在 (`Superseded by ADR-X`) で既にブレあり、機械処理で正規化が必要
- **既存 `adr-tools` / `log4brains` 採用** — ファイル名規則 (`YYYYMMDD-NN`) と日本語 prose header に合わず、設定より改修が多くなる見込み

## 実装トレイル

| Phase | PR | 内容 |
|---|---|---|
| 1 | #789 | Design Doc マージ |
| 1 | #791 | validator.ts + 代表 6 ADR 移行 |
| 1 | #792 | self-review polish |
| 2 | #793 / #794 / #795 / #796 / #798 | 全 111 ADR をトピック別に移行 (core-concepts → parser/resolver/edges → renderer → styling/navigation/app-ui → project/chat-ai/cli/vscode/testing/build) |
| 3 | #801 | A: missing frontmatter と broken-status deps を error に昇格 |
| 3 | #802 | B/C/D: extractor (effective / slice / closure) |
| 3 | #805 | topic frontmatter + controlled vocabulary |
| 3 | #806 | E: topic-based Mermaid visualizer |
| 3 | #808 | body↔frontmatter 参照チェック + `adr-tooling` topic 新設 |
| 3 | #809 | G: regenerate + CI drift check + CLAUDE.md リンク |
| 3 | #810 | F: assumption-drift checker (`file:` / `symbol:` / `grep:`) |
| 3 | #814 | H: `scope.domains` → `scope.concerns` rename + controlled vocabulary |
| 3 | #819 | slice に `--topic` 軸追加 |

## 実装への影響

- 新規 ADR: `docs/adr/TEMPLATE.md` を起点にして `pnpm adr:validate` でローカル検証。
- supersede: 新旧両側の frontmatter を更新 (バリデータが双方向整合を強制)。
- コード変更で ADR の assumption が崩れる場合: 同じ PR で ADR を更新するか、そもそも変更を見送る (CI が落ちる)。
- ADR 編集後は `pnpm adr:regenerate` を忘れずに (忘れても CI の `--check` が落ちる)。
