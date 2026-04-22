# ADR-20260422-05: トップレベル infra ブロック（database / queue / storage）を `(Unassigned)` で描画する

- **日付**: 2026-04-22
- **ステータス**: 決定済み
- **関連**:
  - Issue #702, PR #716 (Design Doc), PR #723 (実装), PR #743 (infra-only validateOwnsReferences)
  - ADR-20260405-05 (`20260405-05-database-as-first-class-node.md`) — database / queue / storage をファーストクラスノードに昇格
  - ADR-20260422-04 (`20260422-04-top-level-service-rendering.md`) — `(Unassigned)` 擬似システム方式の先行採用
  - Design Doc: `docs/design/top-level-infra-rendering.md`（本 ADR で削除）
  - AT-0058 (`docs/acceptance/0058-top-level-infra.md`)
  - `packages/core/src/types/ast.ts`, `packages/core/src/parser/parser.ts`
  - `packages/core/src/view/unassigned-system.ts`, `packages/core/src/resolver/warnings.ts`

## 背景

`karasu translate --from db schema.sql` はトップレベルの `database` ブロック（`system` の外）を含む `.krs` を生成する。しかし `parseFile()` の `switch` 文にトップレベル `database` / `queue` / `storage` のケースが存在せず、**パース時にエラーとなり preview が空**になっていた。

同じ穴を `service` / `domain` に対して塞いだのが ADR-20260422-04 の `withUnassignedSystem()` 方式である。本 ADR はその方式を infra 3 種に拡張する。

## 決定

**`database` / `queue` / `storage` をトップレベルで受理し、`withUnassignedSystem()` に組み込んで `(Unassigned)` 擬似システム配下で描画する。**

- `KrsFile` に 3 フィールドを **独立** に追加: `databases: DatabaseNode[]`, `queues: QueueGroupNode[]`, `storages: StorageNode[]`（既存 `services` / `domains` パターンに倣う）。
- `parseFile()` の `switch` に `Database` / `Queue` / `Storage` ケースを追加し、`parseInfraBlock()` に委譲。`buildNodePathIndex` も子ノード（`table`, `queue-item`, `bucket`）まで走査する。
- `synthesizeUnassignedSystem()` は children を `services > databases > queues > storages > domains` の順で並べる。
- `resolver/warnings.ts` に `detectUnassignedDatabases` / `detectUnassignedQueues` / `detectUnassignedStorages` を追加（`unassigned-service` / `unassigned-domain` と対称）。warning kind も `unassigned-database` / `unassigned-queue` / `unassigned-storage` を追加。
- `translate --from db` の出力がそのまま preview で見えることを AT-0058 TC-5 で end-to-end に確認する。
- パーサー文法（`database` 等が `system` の子としても有効な元の規則）は **変更しない**。拡張するのはトップレベル受理ルールと `KrsFile` 型のみ。

## 理由

- **ADR-20260422-04 との方式統一**。同じ `withUnassignedSystem` ヘルパーに infra を足すだけで描画・drill-down・warnings がすべて乗る。新しい分岐を作らない。
- **別フィールド採用の根拠**（vs 統合フィールド `infraNodes`）:
  - 既存 `services` / `domains` パターンとの一貫性を保ち、AST を触るツール（formatter / LSP / CLI mutation）での扱いが自然。
  - 各フィールドで kind が確定し型安全。
  - 将来新 infra kind を追加する際に独立拡張できる。
- **独立した unassigned-* warning**。ユーザーにどの種類が未配属かを正確に伝え、Warning Panel のグルーピングとも整合する。
- **`extractView` のシグネチャを触らない**。`extractView` の `unassignedServices` / `unassignedDomains` 引数は `withUnassignedSystem` 導入後はレガシーであり、infra のために引数を増やすと API 退化が加速する。
- **translate 起点のユーザー導線を閉じる**。`translate --from db` の出力が preview で見えないと、「DB スキーマから karasu に取り込む」フロー自体が成立しない。

## 却下した案

### 統合フィールド `infraNodes: InfraNode[]`（union 型）

コード量は減るが、既存パターンと食い違い、union type による分岐を全コンシューマに強いる。将来の infra kind 追加が union 拡張を通じて波及する。

### パーサーで `database` を非 system ブロック内に書けるようにする文法変更

パーサー規則に影響が大きい。本件はトップレベル受理のみで解決するため不要。

## 実装への影響

1. **更新** `packages/core/src/types/ast.ts` — `KrsFile` に `databases` / `queues` / `storages` 追加。
2. **更新** `packages/core/src/parser/parser.ts` — `switch` に 3 ケース追加、`buildNodePathIndex` walk 拡張。
3. **更新** `packages/core/src/view/unassigned-system.ts` — infra ノードを children に合流（`services > databases > queues > storages > domains` 順）。
4. **更新** `packages/core/src/resolver/warnings.ts` + `types/warnings.ts` — 3 つの unassigned-* 検出関数と warning kind。
5. **追加修正** `validateOwnsReferences` を infra-only ファイルでも走らせる（PR #743）。
6. **テスト** — `view/unassigned-system.test.ts`, `resolver/warnings.test.ts`, `renderer/drill-down-svg.test.ts`。
7. **AT** — `docs/acceptance/0058-top-level-infra.md`。TC-1〜TC-4 は自動化、TC-5（`translate --from db` 連携）は手動検証。
