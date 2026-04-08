# resource shape 自動推論とインフラノード Icon Mode 対応

- **日付**: 2026-04-07
- **ステータス**: 検討中
- **関連**:
  - [resource と database の設計](resource-and-database.md) — `database`/`queue`/`storage` の語彙設計
  - [アイコンモード](icon-mode.md) — Icon Mode の基本設計
  - Issue #351 (実装済み): System 図インフラノード表示・自動エッジ導出

## 背景・課題

Issue #351 で `database`/`queue`/`storage` が System 図にファーストクラスノードとして登場し、
`resource OrderDB.OrderTable` のようなドット記法参照が UseCase 図等に現れるようになった。

この実装を踏まえ、以下の2つの課題が残っている。

### 課題 1: resource ノードの shape が参照先種別を反映しない

`resource OrderDB.OrderTable` はパーサーが `ref = { parent: "OrderDB", child: "OrderTable" }` を付与するが、
ノードのタグは空のままである。そのため、`resource[table]` / `resource[queue]` / `resource[storage]` スタイルルールが
適用されず、すべてのドット記法 resource がデフォルトの box 形状で描画される。

既存スタイルルール（Icon Mode 含む）:
```
resource[table]   { shape: cylinder; }           /* default theme */
resource[table]   { shape: url("database"); }    /* icon theme */
resource[queue]   { shape: queue; }              /* default theme */
resource[queue]   { shape: url("queue-card"); }  /* icon theme */
resource[storage] { shape: cloud; }              /* default theme */
resource[storage] { shape: url("cloud-card"); }  /* icon theme */
```

### 課題 2: `database`/`queue`/`storage` が Icon Mode で Card 表示されない

`icon-theme.ts` に `database` / `queue` / `storage` の node kind 向けエントリが存在しない。
そのため Icon Mode 時もシリンダー・キュー形状・クラウド形状のまま描画され、
他のノード（service / domain / usecase）と見た目が揃わない。

加えて、`resource[queue]` → `url("queue-card")` と `resource[storage]` → `url("cloud-card")` が参照する
SVG ファイルが `packages/core/icons/` に存在せず、現状 Icon Mode で resource[queue/storage] の
レンダリングが破綻している。

## 制約・前提

- `packages/core` は Pure TypeScript（FS アクセスなし）
- AST ノードの直接変更は行わない（パーサー出力は不変として扱う）
- `resource` ノードに明示的なタグが付与されている場合は、それを自動推論より優先する
- `queue-card` / `cloud-card` SVG は新規作成が必要

## 検討した選択肢（課題 1: shape 自動推論の実装レイヤー）

### 案 A: `resolveStyles()` で補完（スタイルリゾルバー層）

`ViewSlice` に `resourceInferredTagsMap: Map<string, string>` を追加し、
`resolveStyles()` がこのマップを参照してタグなし resource ノードのスタイル計算時に補完する。

```
resolveStyles(systems, stylesheets, { resourceInferredTagsMap })
```

- **Pro**: スタイル解決の意味論が一箇所に集まる
- **Con**: `resolveStyles()` のインターフェース変更が必要。呼び出し元（app / cli / vscode）すべてへの波及

### 案 B: ビュー抽出層でコピーノードを生成（採用方針）

`extractView()` 内で、タグが空かつ `ref` を持つ `resource` ノードに対して、
参照先の sub-resource kind から推論したタグを付与したコピーノードを `childNodes` に含める。
スタイルリゾルバーへの変更は不要。

```ts
// resource OrderDB.OrderTable → ref.parent="OrderDB", ref.child="OrderTable"
// TableNode の kind="table" → 推論タグ "table"
// 明示タグがある場合はそのまま
```

- **Pro**: 変更スコープが `view-extract.ts` のみ。`resolveStyles()` 無変更
- **Pro**: `resourceLabelMap` / `resourceKindMap` と同一レイヤーで管理できる
- **Con**: `childNodes` にコピーノード（AST 非直接参照）が混入する

`resourceLabelMap` と同様に `ViewSlice` に `resourceInferredTagsMap: Map<string, string>` を追加し、
`svg-renderer.ts` の style 適用時に補完することも考えられるが、
renderer 内で node の tags を上書きするより、ビュー層でコピーを作るほうが責務が明確。

## kind → タグ名のマッピング

| sub-resource kind | 推論タグ | 既存スタイルルール |
|---|---|---|
| `table` | `table` | `resource[table]` |
| `queue-item` | `queue` | `resource[queue]` |
| `bucket` | `storage` | `resource[storage]` |

`queue-item` → `queue`、`bucket` → `storage` は既存のタグ名との整合を優先する。
将来的に `resource[queue-item]` / `resource[bucket]` を追加することは妨げない。

## 課題 2 の方針: Icon Mode 対応

### `database`/`queue`/`storage` の icon-theme エントリ追加

既存の SVG アイコンを活用する：

| node kind | SVG | 備考 |
|---|---|---|
| `database` | `url("database")` | `packages/core/icons/database.svg` 既存 |
| `queue` | `url("queue")` | `packages/core/icons/queue.svg` 既存 |
| `storage` | `url("cloud")` | `packages/core/icons/cloud.svg` 既存 |

`icon-theme.ts` への追記:
```
database { shape: url("database"); }
queue    { shape: url("queue");    }
storage  { shape: url("cloud");    }
```

### `queue-card` / `cloud-card` SVG の新規作成

`resource[queue]` / `resource[storage]` 向けの Card 形式アイコンが存在しない。
既存の `database.svg` / `queue.svg` / `cloud.svg` は 160×100 の Card 形式で統一されているため、
同フォーマットで以下を作成する：

| ファイル名 | 表現するもの | ベース |
|---|---|---|
| `queue-card.svg` | queue サブリソース（メッセージキュー内の個別キュー） | `queue.svg` をベースにピクトグラム調整 |
| `cloud-card.svg` | bucket（ストレージ内の個別バケット） | `cloud.svg` をベースにピクトグラム調整 |

なお `database` の resource[table] は既存の `url("database")` で代替可能か検討が必要。
テーブルは DB の中の概念であり、DB アイコンそのものより「テーブル」を示すピクトグラムが望ましい可能性がある。

## 現時点の方針

| 課題 | 方針 |
|---|---|
| resource shape 自動推論 | **案 B**: ビュー抽出層でコピーノード生成 + `resourceInferredTagsMap` |
| `database`/`queue`/`storage` Icon Mode | `icon-theme.ts` に 3 エントリ追加 |
| `queue-card`/`cloud-card` SVG | 新規作成（160×100 Card 形式） |
| `resource[table]` の Icon Mode アイコン | `url("database")` 流用 or 専用 SVG（別途判断） |

## 未解決の問い

- `resource[table]` → `url("database")` 流用で視覚的に許容できるか（DB アイコンとテーブルアイコンの区別が必要か）
- `queue-card` / `cloud-card` のピクトグラムデザインをどう決めるか
