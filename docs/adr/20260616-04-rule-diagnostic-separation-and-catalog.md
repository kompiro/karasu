---
id: ADR-20260616-04
title: 規則と診断を分離し、診断カタログで完全性を担保する
status: accepted
date: 2026-06-16
topic: parser
related_to:
  - ADR-20260514-02
scope:
  packages: [core, i18n, lsp]
assumptions:
  - "file: docs/spec/diagnostics.md"
  - "file: packages/core/src/types/diagnostics-catalog.test.ts"
  - "symbol: packages/core/src/types/ast.ts :: DiagnosticParamsByCode"
  - "grep: docs/spec/diagnostics.md :: edge-source-mismatch"
  - "file: docs/test-perspectives/TPL-20260616-02-diagnostics-catalog-completeness.md"
---

# ADR-20260616-04: 規則と診断を分離し、診断カタログで完全性を担保する

- **日付**: 2026-06-16
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1567](https://github.com/kompiro/karasu/issues/1567)（notation gap stocktaking）
  - 受け皿 Issue: [#1314](https://github.com/kompiro/karasu/issues/1314)（v1.0 spec freeze）
  - 確立 PR: [#1629](https://github.com/kompiro/karasu/pull/1629)（診断カタログ新設）, [#1630](https://github.com/kompiro/karasu/pull/1630)（#1623 edge origin scope）, [#1637](https://github.com/kompiro/karasu/pull/1637)（#1624 top-level-declaration）
  - 統治 ADR: [ADR-20260514-02](20260514-02-style-prescription-stance.md)（流派が smell と呼ぶ構造は `info` で事実通知 — register モデルの土台）
  - 関連 TPL: [TPL-20260616-02](../test-perspectives/TPL-20260616-02-diagnostics-catalog-completeness.md)（カタログ ↔ コードの完全性）, [TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)（register は事実か流派判断かで決める）, [TPL-20260610-02](../test-perspectives/TPL-20260610-02-spec-promised-diagnostics-implemented.md)（spec が約束する診断は実装されている）, [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)（spec ↔ source-of-truth の同期）

## 背景

notation gap stocktaking（#1567）から派生した #1623 / #1624 の実装中に、karasu の
診断面に関する構造的な事実が浮かび上がった。

- 「edge はその所属ブロックの id を起点にする」という **規則** は、すでに
  `edge-source-mismatch` という **メカニズム名の診断** で強制されていた。同様に
  「id の一意性」「cross-reference の解決（warn-don't-error）」など、**1 つの規則が
  複数のメカニズム名診断で強制される**パターンが repo 全体に繰り返し現れる。
- 診断コード（`edge-source-mismatch` 等）の文字列は LSP・app・下流ツールが消費する
  **安定 API** である。規則の言い回し（例: `edge-origin-scope`）に合わせて rename
  すると消費側が壊れる。
- 一方で、診断コードと規則を対応づける一覧がどこにも無く、ユーザーが診断コードから
  「何の規則違反か」を辿る手段が欠けていた。spec は規則を散文で約束するが、診断
  コードの全体像は型定義（`DiagnosticParamsByCode` / `WarningKind`）にしか無かった。

v1.0 spec freeze（#1314）では診断 register も凍結対象になるため、この対応関係を
明文化し、drift しない形で固定する必要があった。

## 決定

**規則（概念）と診断（名前付きメカニズム）を別レイヤーとして併存させ、
`docs/spec/diagnostics.md` を両者を対応づける診断カタログとする。診断コードは安定
API として規則名に合わせて rename しない。カタログの完全性は meta-test で双方向に
強制する。**

個別の判断:

- **規則 = 概念、診断 = メカニズム**。1 つの規則は複数の診断で強制されうる
  （例:「宣言・edge の配置 scope」規則 ⊃ `edge-source-mismatch` / `top-level-declaration` /
  `service-outside-system` …）。規則名と診断名は altitude が異なる。
- **診断コードは rename しない**。`edge-source-mismatch` を `edge-origin-scope` に
  改名するような変更は API 破壊であり、特に freeze 直前には行わない。規則は spec の
  見出し・散文で表現し、診断コードはそのまま参照する。
- **register は事実 vs 流派**（`error` / `warning` / `info`）を ADR-20260514-02 /
  TPL-20260514-08 の判定樹に従って割り当て、カタログに明記する。
- **完全性を test で縛る**。`packages/core/src/types/diagnostics-catalog.test.ts` が
  `DiagnosticParamsByCode` と `WarningKind` の全メンバーを型ソースから抽出し、en/ja
  両カタログに `code` として現れることを assert する。新規コードはカタログ項目なしに
  出荷できない（TPL-20260616-02）。
- **en/ja parity** は `scripts/lint/spec-structure-sync.ts` の `SPEC_PAIRS` に
  カタログ対を登録して担保する。

## 理由

- **安定 API の保護**: 診断コードは consumer 契約。規則の言い回しに引きずられた
  rename は壊れるだけで価値が無い。概念は規則名、契約はコード、と分離するのが筋。
- **辿れる診断**: カタログがあると、LSP の hover や review で診断コードを見た人が
  対応する規則を 1 箇所で引ける。spec の散文（規則）と型定義（コード）の橋渡しになる。
- **drift しない**: 「並列に存在するものは drift する」（TPL-20260511-02）を診断面に
  広げ、コード ↔ カタログを meta-test で双方向に縛る。spec freeze の安定面を機械的に
  守れる。
- **register の一貫性**: fact vs style（ADR-20260514-02）をカタログ上で明示すること
  で、新規診断の register 判断がカタログを索引に行える。

## 却下した案

- **診断コードを規則名に rename する**（`edge-source-mismatch` → `edge-origin-scope`
  等）: LSP / consumer の API 破壊。freeze 直前の churn として不適。規則名と診断名は
  そもそも別レイヤーであり、一致させる必要が無い。
- **規則だけ spec に書き、カタログを作らない**: 診断コードから規則を辿れず、
  「なぜ違反か」がユーザーに伝わらない。
- **カタログを手動同期（test 無し）**: 新規コード追加時にカタログ更新が漏れ、
  silent drift する。スナップショットではなく型ソースからの抽出比較にしたのは、
  カタログ側の表現（表・節構成）を自由に保ちつつ完全性だけ縛るため。
