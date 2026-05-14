---
id: ADR-20260514-02
title: karasu はスタイル流派を規定せず、流派が smell と呼ぶ構造は `info` 診断で事実通知する
status: accepted
date: 2026-05-14
topic: core-concepts
related_to:
  - ADR-20260430-01
  - ADR-20260511-02
  - ADR-20260405-05
  - ADR-20260514-01
scope:
  packages: [core, lsp, app]
assumptions:
  - "grep: docs/concepts.md :: What karasu visualizes vs. what it doesn't prescribe"
  - "grep: docs/concepts.ja.md :: karasu が「描く」もの、「規定しない」もの"
  - "file: docs/test-perspectives/TPL-20260514-07-diagnostic-register-fact-vs-style.md"
---

# ADR-20260514-02: karasu はスタイル流派を規定せず、流派が smell と呼ぶ構造は `info` 診断で事実通知する

- **日付**: 2026-05-14
- **ステータス**: 決定済み
- **関連**:
  - 親 Issue: [#1386](https://github.com/kompiro/karasu/issues/1386) — Design: karasu's position on style-prescriptive warnings (Database-per-Service and friends)
  - 設計 PR: [#1388](https://github.com/kompiro/karasu/pull/1388)（旧 `docs/design/karasu-position-on-style-prescriptions.md` — 本 ADR に集約して削除）
  - concept 反映 PR: [#1390](https://github.com/kompiro/karasu/pull/1390) — `docs/concepts.md` / `docs/concepts.ja.md` への "What karasu visualizes vs. what it doesn't prescribe" 節追加
  - 連携 Issue: [#1385](https://github.com/kompiro/karasu/issues/1385) — cross-file `database` / `queue` / `storage` reopen（`infra-redeclared-across-files` の発行点）
  - 親文脈: [#1381](https://github.com/kompiro/karasu/issues/1381) — multi-file split / [ADR-20260514-01](20260514-01-multi-file-import-semantics.md)
  - 派生 TPL: [TPL-20260514-07](../test-perspectives/TPL-20260514-07-diagnostic-register-fact-vs-style.md)（事実 vs 流派判断による register 選択）
  - 同系統 ADR: [ADR-20260430-01](20260430-01-security-modeling-stance.md)（セキュリティ / 脅威モデリングを core に取り込まない）, [ADR-20260511-02](20260511-02-no-runtime-authz-modeling.md)（実行時認可を core に取り込まない）, [ADR-20260405-05](20260405-05-database-as-first-class-node.md)（database を first-class に — 共有 DB を表現可能にする前提）

## 背景

karasu の `docs/concepts.md` "Goals and non-goals" は、ツールが扱う範囲を「ゆっくり変化する構造的事実（何が存在し、どう関係し、誰が所有するか）」に限定するフィルタを定義している。一方、karasu の語彙はすでにいくつかの場所で **スタイル流派への暗黙的な立場**を取っていた:

- `[external]` annotation — 「ours / theirs」の境界
- `domain-dispersal` warning — DDD の領域結合への nudge
- `duplicate-node-in-system` error の database への適用 — S3 children dedup の副作用で「shared DB」を書けない（偶発的）

最後の制約は `docs/design/import-semantics-redesign.md`（ADR-20260514-01）の system reopen 設計で取り除かれることになり、その除去にあたって「shared DB を見たら karasu は何か言うのか」「言うとすればどう言うのか」を決める必要があった。同じ問いが `[external]` / `domain-dispersal` にも遡及して問われる。スコープ filter だけからは答えが導けない第二の軸—**スタイル prescription への立場**—を明文化する必要があった。

## 決定

**karasu は architecture を「視覚化」するが、スタイル流派を「規定」しない。** スタイル流派の観点で smell とされる構造は、`info` 診断で事実だけを通知する。

具体的には次の 3 原則を採用する:

1. **Smell は表現できる** — 構造として妥当な記述は、スタイル上の理由で render を拒否しない。共有 DB、複数 service にまたがる domain、system 内を指す `[external]` も書いたとおりに描く。
2. **Smell は静かに知らせる** — resolver が「ある流派なら smell と呼ぶ構造」を検出したら、新しい `info` severity で事実先行の文言 + 流派文脈 1 行 + concept 節へのリンクを発行する。「直すべき」とは言わない。
3. **Recommended pattern は仕様ではなくドキュメントで示す** — `docs/concepts.md` の "What karasu visualizes vs. what it doesn't prescribe" 節（#1390 で追加）に該当 diagnostic を一覧し、将来の追加判断はその節の決定樹に照らして行う。

判定樹（concept 節と TPL-20260514-07 で双方向リンク済み）:

- karasu モデル自身の事実（id 未宣言、`realizes` が指す先なし 等）→ `error` または `warning`
- ある外部流派が smell と呼ぶ構造（共有 DB、領域分散 等）→ `info`、事実先行の文言
- 流派固有の prescription（"Hexagonal ならこうする" 等）→ **診断を出さない**（スコープ外）

個別決定:

- **(a) `info` severity の新設**: resolver / LSP / Editor の表示パイプラインに `DiagnosticSeverity.Information` を通す。実装は #1385 の infra reopen 実装 PR で行う。
- **(b) 警告抑制目的の `[shared]` タグは導入しない**: 抑制は editor / LSP の severity 設定で対応する。構文の学習コストを増やさない。
- **(c) `domain-dispersal` の register / 文言変更**: 本 ADR の決定に従い `warning` → `info` に下げ、文言を事実先行に書き換える。破壊的（i18n / AT / examples 影響）なため **別 PR** で段階的に実施する。

`[shared]` を「意味の追加」（共有 DB であることを図上で太枠表示する等）として再導入するかは別議論として残す。

## 理由

- **karasu の重心（structural facts）を守る**: スタイル prescription を core 診断に固定すると、Hexagonal / Clean Architecture / DDD layered… と他流派の提案が累積し、毎回原理から議論し直すコストが累積する。事実だけ surface して判断はユーザーに委ねるほうが、karasu のスコープ filter と整合する。
- **`info` という第三段階が必要**: `warning` は「直すべき」のニュアンスが強く、流派依存の判断には適さない。`info` は「気付かせる」ニュアンスで事実通知に合い、monaco / VS Code の `DiagnosticSeverity.Information` に素直にマップできる。
- **既存 ADR の系譜**: ADR-20260430-01（セキュリティ）、ADR-20260511-02（実行時認可）は同じ「外部の規律が推奨する shape を karasu の語彙に固定しない。ただし基礎となる事実は表現できる」立場を取っている。本 ADR はそれをスタイル流派の軸に拡張したもの。
- **抑制タグを増やさない**: `[external]` / `[deprecated]` / `[shared]` … と並ぶと、ユーザーは「どれが構造で、どれが警告抑制か」を区別しづらくなる。抑制は editor / LSP の責務に置くことで、構文の学習コストを抑える。
- **proactive な TPL 化に乗る**: 本立場は `docs/concepts.md` に文書化され、TPL-20260514-07 が新規 diagnostic 追加 PR の checklist として機能する。これにより同種の判断（次の流派 prescription 提案）は原理から再導出できる。

## 却下した案

- **案 A — 何もしない**: infra reopen を error から黙って通すだけ。偶発的に書かれた共有 DB を検出する手段がなくなり、design 議論が無いまま「現状がデフォルト」化する。却下。
- **案 B — `warning` で出す**: "Database-per-Service principle suggests..." と明示する案。流派 prescription を core に固定し、共有 DB が意図的なケース（移行期、低トラフィック、レガシー）で誤報になる。ADR-20260430-01 / ADR-20260511-02 の方針と矛盾する。却下。
- **`[shared]` を抑制タグとして導入**: 「意図的な共有」を構文で示せるようにする案。抑制は editor / LSP で対応可能で、構文の学習コストを増やすほうの不利益が大きい。却下。
- **`info` を新設せず既存 `warning` に押し込む**: register を 2 段階で運用し続ける案。文言で「直さなくてもよい」を伝えられず、`domain-dispersal` の混乱が解消しない。却下。

## 影響範囲

- **`docs/concepts.md` / `docs/concepts.ja.md`** — 既に #1390 で "What karasu visualizes vs. what it doesn't prescribe" 節を追加済み。本 ADR が同節の決定根拠となる。
- **resolver**: `info` severity を追加（#1385 実装 PR 内）。`infra-redeclared-across-files` を info で発行。
- **LSP / Editor**: `DiagnosticSeverity.Information` をマップ（resolver 変更と同 PR で対応）。
- **i18n**: `info` カテゴリの文字列キーを追加（resolver 変更と同 PR）。
- **`domain-dispersal`**: register を `warning` → `info` に下げ、文言を事実先行に変更（**別 PR**）。AT / examples / i18n キーも同 PR で追従する。
- **TPL**: [TPL-20260514-07](../test-perspectives/TPL-20260514-07-diagnostic-register-fact-vs-style.md) が新規 diagnostic 追加 PR の checklist として運用される。
