# AT-1595: 移行 intent パラメータの消費者（until 解釈 + 表示）

[ADR-20260615-04](../adr/20260615-04-migration-intent-fields.md) で言語層に追加された移行 intent パラメータ（`@deprecated(until: …)` / `@experimental(until: …)` / `@migration_target(from: …)`）の **消費者側**（[#1595](https://github.com/kompiro/karasu/issues/1595)）の受け入れ基準。スコープは (1) `until` 値解釈ヘルパ（core）と (2) NodeDetailPanel での表示。explicit-threshold filter / export は本スコープ外。

関連 TPL: [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)（受理した語彙は効果を持つ — 表示で `until` / `from` に効果を与える）。

## 受け入れ条件（自動）

### until 解釈ヘルパ — `packages/core/src/annotations/migration-intent.test.ts`

- [x] `until` が日付（`YYYY-MM-DD`）/ 年月（`YYYY-MM`）/ 四半期（`YYYY-Qn`）としてパースでき、その期間の下限を指す正規化 `sortKey`（例 `2026-Q3` → `2026-07-01`）を持つ machine-usable 値として解釈される

  > ✅ Automated — `migration-intent.test.ts` › `interpretUntil (#1595)` の date / month / quarter ケース

- [x] 精度をまたいだ `sortKey` が辞書順で正しく比較できる（filter の基礎）

  > ✅ Automated — `migration-intent.test.ts` › `produces sortKeys that compare correctly across precisions`

- [x] パースできない値（`"sometime next year"`）や範囲外（`2026-13` / `2026-02-30` / `2026-Q5`）は opaque として verbatim 保持され、エラーにならない（graceful degradation）

  > ✅ Automated — `migration-intent.test.ts` › opaque / out-of-range ケース

- [x] `until` を runtime 評価しない（現在日付と比較しない）— ヘルパは現在日付を一切読まない

  > ✅ Automated — `interpretUntil` / `getMigrationIntent` のシグネチャに現在日付入力が無く、`sortKey` は書かれた値のみから算出される（テストは固定値で決定的）

- [x] `getMigrationIntent` が `annotationParams` から `until`（`@deprecated` 優先、無ければ `@experimental`）と `from`（`@migration_target`）を抽出し、認識キーが無ければ `undefined` を返す

  > ✅ Automated — `migration-intent.test.ts` › `getMigrationIntent (#1595)`

### 表示 — `packages/app/src/components/NodeDetailPanel.test.tsx`

- [x] machine-usable な `until` が `data-until-kind="machine"` 付きで raw 値とともに表示される

  > ✅ Automated — `NodeDetailPanel.test.tsx` › `migration intent` › `shows a machine-usable until value with its kind`

- [x] opaque な `until` が `data-until-kind="opaque"` 付きで verbatim 表示される

  > ✅ Automated — `NodeDetailPanel.test.tsx` › `migration intent` › `shows an opaque until value verbatim and marks it opaque`

- [x] `@migration_target(from: …)` の移行元が表示される

  > ✅ Automated — `NodeDetailPanel.test.tsx` › `migration intent` › `shows the migration source (from)`

- [x] intent を持たないノードでは移行セクションを描画しない

  > ✅ Automated — `NodeDetailPanel.test.tsx` › `migration intent` › `renders no migration section when the node carries no intent`

## 受け入れ条件（手動）

- [ ] `index.krs` に `service Legacy @deprecated(until: "2026-Q3") @migration_target(from: NewSvc)` を含むモデルを app で開き、`Legacy` ノードをクリックすると詳細パネルに「🕒 Migration intent」セクションが現れ、`until: 2026-Q3` と `from: NewSvc` が表示されることを確認する
