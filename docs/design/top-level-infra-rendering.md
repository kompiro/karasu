# トップレベル infra ブロック（database / queue / storage）の描画

- **日付**: 2026-04-19
- **ステータス**: 検討中
- **関連**: Issue #702, [AT-0057](../acceptance/0057-top-level-service.md), [docs/design/top-level-service-rendering.md](top-level-service-rendering.md), [ADR-20260405-05](../adr/20260405-05-database-as-first-class-node.md)

## 背景・課題

`karasu translate --from db schema.sql` はトップレベルの `database` ブロック（`system` の外）を含む `.krs` を生成する。パーサーは `database` / `queue` / `storage` トークンを内部的に処理できるが、`parseFile()` の switch 文にこれらのトップレベルケースが存在しないため、現状では **パース時にエラーとなり、preview は空のまま**になる。

同種の問題を `service` に対して解決したのが Issue #681 / PR #695 である。PR #695 では `withUnassignedSystem()` というヘルパーを導入し、トップレベルの `service` / `domain` を `__unassigned__` という仮想 system に包んでレンダリングする方式が採用された。

本ドキュメントは、同じ方式を `database` / `queue` / `storage` に拡張することを設計する。

## 制約・前提

- パーサーの文法（`database` が `system` 子としてのみ有効）は **変えない**。拡張するのはトップレベル `parseFile()` の受理ルールと `KrsFile` の型定義のみ。
- `withUnassignedSystem()` の方式（PR #695 が採用）を踏襲し、`extractView` のシグネチャは **変更しない**。
  - `extractView` の `unassignedServices` / `unassignedDomains` 引数は既にレガシー（レンダラー本線は `withUnassignedSystem` 経由）であり、これ以上引数を増やさない。
- AT-0057（top-level service）と矛盾しない振る舞いにする。
- `translate --from db` が生成する `.krs` がそのまま preview で見えること（イシューの再現ケース）。

## 変更対象の整理

### 1. `packages/core/src/types/ast.ts` — `KrsFile` 型拡張

既存パターン（`services: ServiceNode[]`, `domains: DomainNode[]`）に倣い、3 つの独立フィールドを追加する。

```ts
export interface KrsFile {
  // ... 既存 ...
  databases: DatabaseNode[];
  queues: QueueGroupNode[];
  storages: StorageNode[];
}
```

#### 案比較: 別フィールド vs 統合フィールド

| 観点 | 別フィールド（採用） | 統合フィールド `infraNodes` |
| --- | --- | --- |
| 既存パターンとの一貫性 | ◎ `services`, `domains` と同形 | △ 新しいパターンを導入 |
| 型安全性 | ◎ 各フィールドで kind が確定 | △ union 型になる |
| 将来の拡張 | ◎ 新 infra kind を独立追加できる | △ 統合フィールドの union が広がる |
| コード量 | △ 3 フィールド追加 | ◎ 1 フィールドで済む |

**判断**: 既存パターンとの一貫性・型安全性を優先し、別フィールドを採用する。

### 2. `packages/core/src/parser/parser.ts` — `parseFile()` 拡張

`switch` 文に `Database` / `Queue` / `Storage` のケースを追加し、`parseInfraBlock()` に委譲する。

```ts
case TokenType.Database:
  file.databases.push(this.parseInfraBlock(token, "database") as DatabaseNode);
  break;
case TokenType.Queue:
  file.queues.push(this.parseInfraBlock(token, "queue") as QueueGroupNode);
  break;
case TokenType.Storage:
  file.storages.push(this.parseInfraBlock(token, "storage") as StorageNode);
  break;
```

`buildNodePathIndex` も `databases` / `queues` / `storages` を走査し、子ノード（`table`, `queue-item`, `bucket`）までパスインデックスを構築する。

### 3. `packages/core/src/view/unassigned-system.ts` — infra ノード組み込み

`synthesizeUnassignedSystem()` に infra ブロックを追加する。

```ts
export function synthesizeUnassignedSystem(krsFile: KrsFile): SystemNode | null {
  const services  = krsFile.services  ?? [];
  const databases = krsFile.databases ?? [];
  const queues    = krsFile.queues    ?? [];
  const storages  = krsFile.storages  ?? [];
  const domains   = krsFile.domains   ?? [];
  const children: KrsNode[] = [...services, ...databases, ...queues, ...storages, ...domains];
  if (children.length === 0) return null;
  // ... 既存の pseudo-system 生成 ...
}
```

#### 並び順の根拠

`services > databases > queues > storages > domains`

- `service` は論理ノードの中でも「境界」を表すため先頭
- infra ノードは実装的な基盤要素として services の直後
- `domain` は論理集約の概念なので末尾（AT-0040 の既存順序との整合）

### 4. `packages/core/src/resolver/warnings.ts` — unassigned infra 警告

`detectUnassignedDomains` / `detectUnassignedServices` と同パターンで3関数を追加する。

```ts
function detectUnassignedDatabases(file: KrsFile): Warning[] { ... }
function detectUnassignedQueues(file: KrsFile): Warning[] { ... }
function detectUnassignedStorages(file: KrsFile): Warning[] { ... }
```

`types/warnings.ts` に warning kind を追加:

```ts
| "unassigned-database"
| "unassigned-queue"
| "unassigned-storage"
```

### 5. テスト

| ファイル | 追加内容 |
| --- | --- |
| `view/unassigned-system.test.ts` | `database` / `queue` / `storage` が pseudo-system に含まれること |
| `resolver/warnings.test.ts` | `unassigned-database` 等の warning が出ること |
| `renderer/drill-down-svg.test.ts` | top-level database のみのファイルが「No diagram」でないこと |

### 6. AT — AT-0058: top-level infra rendering

`docs/acceptance/0058-top-level-infra.md` を新設。

- TC-1: `database` + `system` が Unassigned フレームで並列表示される
- TC-2: `unassigned-database` 警告が表示される
- TC-3: zero-system ファイル（`database` のみ）が描画される
- TC-4: `system` 内の `database` は unassigned 警告を出さない
- TC-5: `translate --from db` の出力が preview でそのまま表示される（end-to-end）

TC-1〜TC-4 は自動化、TC-5 は手動検証。

## スコープ外

- `queue` / `storage` の SVG スタイル調整（既存スタイルが当たれば十分）
- `extractView` のシグネチャ変更（`withUnassignedSystem` 方式で不要）
- パーサーで `database` を非-system ブロック内に書けるようにする変更

## 未解決の問い

なし（上記で方針確定）。
