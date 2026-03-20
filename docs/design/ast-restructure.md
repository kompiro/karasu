# AST 再構成 — Discriminated Union とプロパティブロック

- **日付**: 2026-03-20
- **ステータス**: ドラフト
- **関連**: [.krs 構文リファレンス](../spec/syntax.md), [タグ・アノテーション](../spec/tags-annotations.md), [コアコンセプト](../concepts.md)

## 背景・課題

### 構文上の課題

現在のノード宣言は位置引数で label と description を並べる構文になっている。

```
service ECommerce "ECサイト" "商品管理と注文処理" [external]
```

この構文には以下の問題がある。

1. **label と description の区別が曖昧** — 2つの文字列リテラルが並ぶだけで、どちらが何の役割かが構文上わかりにくい
2. **description の表現力不足** — 単一行の文字列しか書けず、Markdown による詳細記述ができない
3. **要素ごとのプロパティ拡張が困難** — user の `role` は追加できたが、service の `team` や domain の参照リンクなど、種別固有のプロパティを位置引数で増やすと構文が破綻する

### AST 型の課題

現在の `KrsNode` は単一の interface ですべての種別を表現している。

```typescript
export interface KrsNode {
  kind: LogicalNodeKind;
  id?: string;
  label: string;
  description?: string;
  role?: string;          // user 専用だが型上はすべてのノードに存在
  tags: string[];
  annotations: string[];
  children: KrsNode[];
  edges: KrsEdge[];
  loc: SourceRange;
}
```

- `role` のような種別固有フィールドが全ノードに露出する
- 新しいプロパティを追加するたびに optional フィールドが増え、型の意味が薄れる
- パーサーやレンダラーで `kind` に応じた分岐を書いても、型が narrowing されない

## 制約・前提

- 既存の親子関係 (`system > service > domain > usecase > resource`, `user` は system 直下) は変更しない
- 物理図 (`deploy` ブロック) の構文は変更しない
- タグ・アノテーションの仕組みは変更しない
- エッジ宣言の構文は変更しない
- 後方互換を完全に保つ必要はない（まだプレリリース段階のため）

## 設計

### 1. 構文変更: プロパティブロックの導入

label は位置引数のまま残し、description を含むすべてのプロパティをブロック `{ }` 内に移動する。

#### Before

```
service ECommerce "ECサイト" "商品管理と注文処理" [external]
```

#### After

```
service ECommerce "ECサイト" [external] {
  description "商品管理と注文処理"
}
```

description が不要、かつ子ノードもプロパティも持たない場合は、従来通りボディなしの1行宣言が可能。

```
service Payment "決済サービス" [external]
```

#### 複数行 description

`"""` （トリプルクォート）で囲むことで複数行の Markdown テキストを記述できる。

```
service ECommerce "ECサイト" {
  description """
    商品管理と注文処理を担当するサービス。

    ## 責務
    - 商品カタログの管理
    - 注文の受付と処理
    - 在庫の照会
  """
}
```

- `"""` の直後の改行は無視する
- 閉じ `"""` のインデント位置を基準として、共通の先頭空白を除去する（Python の `textwrap.dedent` と同じ挙動）
- 図上では先頭100文字程度をサマリとして表示し、クリック/ホバーで全文を表示する（レンダリング側の設計は別 Design Doc で扱う）

### 2. 種別ごとのプロパティ定義

#### 共通プロパティ（全種別）

| プロパティ | 構文 | 型 | 説明 |
|-----------|------|-----|------|
| `description` | `description "..."` / `description """..."""` | string | 詳細説明（Markdown対応） |
| `link` | `link "<URL>" "<ラベル>"` | 複数可 | 関連資料へのリンク |

`link` は同一ブロック内に複数記述可能。deploy ノードの `runtime` / `realizes` と同じ単一行プロパティの形式。

#### service 固有プロパティ

| プロパティ | 構文 | 型 | 説明 |
|-----------|------|-----|------|
| `team` | `team "<チーム名>"` | string | 開発チーム名（逆コンウェイの法則支援） |

```
service ECommerce "ECサイト" {
  description "商品管理と注文処理"
  team "EC開発チーム"
  link "https://wiki.example.com/ec" "設計Wiki"
  link "https://figma.com/file/xxx" "画面設計"

  domain "受注" { ... }
}
```

#### user 固有プロパティ

| プロパティ | 構文 | 型 | 説明 |
|-----------|------|-----|------|
| `role` | `role "<ロール名>"` | string | 業務上の役割（既存） |

構文変更なし。既存の `role` はそのまま維持。

#### domain 固有プロパティ

現時点で固有プロパティなし。`link` で関連資料を記述する。

```
domain "受注" {
  link "https://miro.com/board/123" "ドメインモデル図"
  link "https://confluence.example.com/order" "業務フロー定義"

  usecase "注文を受け付ける" { ... }
}
```

#### usecase 固有プロパティ

現時点で固有プロパティなし。`link` で関連図を記述する。

```
usecase "注文を受け付ける" {
  link "https://example.com/seq/order" "シーケンス図"
  link "https://example.com/activity/order" "アクティビティ図"

  resource "注文テーブル" [table]
  resource "在庫API" [external, api]
}
```

#### resource 固有プロパティ

現時点で固有プロパティなし。resource の種別はタグで表現する。

### 3. resource 種別のタグ化

resource の種別（テーブル、ファイル、API 等）はタグとして表現する。タグはアーキテクチャ上の分類であり、`.krs.style` でスタイルを制御できる。

| タグ | 意味 | デフォルト shape |
|------|------|-----------------|
| `[table]` | RDB テーブル | `cylinder` |
| `[file]` | ファイル / CSV / ログ | `box`（将来: file shape） |
| `[api]` | 外部 API エンドポイント | `hexagon` |
| `[queue]` | メッセージキュー | `queue` |
| `[storage]` | オブジェクトストレージ / Blob | `cloud` |

複数タグの併用可。

```
resource "在庫API" [external, api]
resource "注文テーブル" [table]
resource "通知キュー" [queue]
```

### 4. system に属さない service

ファイルトップレベルに `service` を直接記述可能にする。

```
// トップレベル service（所属システム未定）
service Monitoring "監視サービス" {
  description "配置先のシステムが検討中"
}

system "ECプラットフォーム" {
  service ECommerce "ECサイト"
  ...
}
```

- `KrsFile` に `services: ServiceNode[]` フィールドを追加する
- レンダラーはトップレベル service を仮想的な「無所属」グループとして描画する
- 将来的に system に移動する際は、カット&ペーストで完了する

### 5. 物理図からの service 逆参照

deploy ノードの `realizes` は既に service を参照している。service 側に `team` があれば「どのチームがどのデプロイ単位を持っているか」を `realizes` の逆引きで自動解決できる。追加構文は不要。

```
// 論理図
service ECommerce "ECサイト" {
  team "EC開発チーム"
}

// 物理図
deploy "本番環境" {
  oci "order-service" {
    realizes ECommerce    // → team "EC開発チーム" が推論可能
  }
}
```

## AST 型設計: Discriminated Union

### 型定義

```typescript
import type { SourceRange } from "./tokens.js";

// ─── 共通 ─────────────────────────────────────────

export type LogicalNodeKind =
  | "system" | "service" | "domain" | "usecase" | "resource" | "user";

export interface LinkEntry {
  url: string;
  label?: string;
  loc: SourceRange;
}

interface BaseNodeFields {
  id?: string;
  label: string;
  tags: string[];
  annotations: string[];
  children: KrsNode[];
  edges: KrsEdge[];
  loc: SourceRange;
}

interface CommonProperties {
  description?: string;
  links: LinkEntry[];
}

// ─── 種別ごとの型 ──────────────────────────────────

export interface SystemNode extends BaseNodeFields {
  kind: "system";
  properties: CommonProperties;
}

export interface ServiceNode extends BaseNodeFields {
  kind: "service";
  properties: CommonProperties & {
    team?: string;
  };
}

export interface DomainNode extends BaseNodeFields {
  kind: "domain";
  properties: CommonProperties;
}

export interface UsecaseNode extends BaseNodeFields {
  kind: "usecase";
  properties: CommonProperties;
}

export interface ResourceNode extends BaseNodeFields {
  kind: "resource";
  properties: CommonProperties;
}

export interface UserNode extends BaseNodeFields {
  kind: "user";
  properties: CommonProperties & {
    role?: string;
  };
}

// ─── Union ─────────────────────────────────────────

export type KrsNode =
  | SystemNode
  | ServiceNode
  | DomainNode
  | UsecaseNode
  | ResourceNode
  | UserNode;

// ─── エッジ（変更なし） ────────────────────────────

export type EdgeKind = "sync" | "async";

export interface KrsEdge {
  from: string;
  to: string;
  label?: string;
  kind: EdgeKind;
  tags: string[];
  loc: SourceRange;
}

// ─── ファイル ──────────────────────────────────────

export interface KrsFile {
  styleImports: string[];
  nodeImports: ImportDeclaration[];
  systems: SystemNode[];
  services: ServiceNode[];    // トップレベル service（無所属）
  deploys: DeployBlock[];
}
```

### 型の利用パターン

#### パーサーでの構築

```typescript
function parseService(): ServiceNode {
  // ... label, tags, annotations をパース ...
  const properties: ServiceNode["properties"] = {
    links: [],
  };

  if (hasBlock) {
    while (!isBlockEnd()) {
      switch (currentKeyword()) {
        case "description":
          properties.description = parseDescription();
          break;
        case "team":
          properties.team = parseStringLiteral();
          break;
        case "link":
          properties.links.push(parseLink());
          break;
        case "domain":
          children.push(parseDomain());
          break;
      }
    }
  }

  return { kind: "service", id, label, tags, annotations, children, edges: [], properties, loc };
}
```

#### レンダラーでの narrowing

```typescript
function renderNodeDetails(node: KrsNode): string {
  // 共通プロパティは narrowing 不要でアクセス可能
  const desc = node.properties.description;
  const links = node.properties.links;

  // 種別固有のプロパティは switch で narrowing
  switch (node.kind) {
    case "service":
      if (node.properties.team) {
        // TypeScript が ServiceNode["properties"] に narrowing
        renderTeam(node.properties.team);
      }
      break;
    case "user":
      if (node.properties.role) {
        renderRole(node.properties.role);
      }
      break;
  }
}
```

#### ヘルパー関数（共通プロパティ抽出）

```typescript
// 全ノード共通のプロパティに型安全にアクセスするヘルパー
function getCommonProperties(node: KrsNode): CommonProperties {
  return node.properties;
}

// 型ガード
function isServiceNode(node: KrsNode): node is ServiceNode {
  return node.kind === "service";
}
```

### LayoutNode への影響

`LayoutNode` にも `kind` を追加し、レンダラーが種別に応じたレイアウト・描画を行えるようにする。

```typescript
export interface LayoutNode {
  kind: LogicalNodeKind;   // 追加
  id: string;
  label: string;
  properties: KrsNode["properties"];  // AST のプロパティをそのまま保持
  x: number;
  y: number;
  width: number;
  height: number;
  ghost?: boolean;
}
```

- `description`, `role` の個別フィールドは廃止し、`properties` に統一する
- `measureNode` は `properties.description` / `properties.links` の有無でサイズを計算する
- link アイコンの表示分のスペースを確保する

## Lexer / Parser への変更

### 新規トークン

| トークン | キーワード |
|---------|-----------|
| `Description` | `description` |
| `Team` | `team` |
| `Link` | `link` |
| `TripleQuote` | `"""` |

`Role` トークンは既存。

### resource タグ用の新規トークン

追加不要。タグは文字列として lexer が処理する既存の仕組みをそのまま使う。

### パーサー変更の概要

1. **ノード宣言**: `<kind> [id] "<label>" [tags] [annotations] [{ ... }]` — description の位置引数を廃止
2. **プロパティブロック**: `{ }` 内でプロパティキーワード (`description`, `team`, `link`, `role`) または子ノード宣言を受け付ける
3. **トリプルクォート**: `"""` 〜 `"""` 間を単一の文字列トークンとして扱う
4. **トップレベル service**: ファイル直下の `service` 宣言を `KrsFile.services` に格納する

### 後方互換に関するメモ

位置引数の description（`service ECommerce "ECサイト" "説明"`）は**廃止**する。
プレリリース段階のため、移行コストより構文の明確さを優先する。
パーサーが位置引数 description を検出した場合はエラーとし、移行ガイドを示す diagnostic メッセージを出す。

```
error: 位置引数の description は廃止されました。
       description プロパティを使用してください:
       service ECommerce "ECサイト" { description "説明" }
```

## 完全な構文例

```
@import "default.krs.style"

// トップレベル service（無所属）
service Monitoring "監視サービス" {
  description "配置先のシステムが未定"
  team "SRE チーム"
}

system "ECプラットフォーム" {
  user Customer "顧客" [human] {
    role "商品を購入する一般ユーザー"
    link "https://example.com/persona/customer" "ペルソナ定義"
  }
  user Admin "管理者" [human] {
    role "システムを運用する担当者"
  }
  user PriceBot "価格最適化Bot" [ai] {
    role "競合価格を監視し自動で価格を調整する"
  }

  service ECommerce "ECサイト" {
    description """
      商品管理と注文処理を担当するサービス。

      ## 責務
      - 商品カタログの管理
      - 注文の受付と処理
      - 在庫の照会
    """
    team "EC開発チーム"
    link "https://wiki.example.com/ec" "設計Wiki"
    link "https://figma.com/file/xxx" "画面設計"
  }
  service Payment "決済サービス" [external]
  service Inventory "在庫管理" [external]

  Customer  -> ECommerce "商品を購入する"
  Admin     -> ECommerce "システムを管理する"
  PriceBot  -> ECommerce "価格を更新する"
  ECommerce -> Payment   "決済を処理する"
  ECommerce --> Inventory "在庫を同期する"
}

service ECommerce "ECサイト" {
  domain "受注" {
    description "注文の受付からキャンセルまでの業務"
    link "https://miro.com/board/123" "ドメインモデル図"
    link "https://confluence.example.com/order-flow" "業務フロー定義"

    usecase "注文を受け付ける" {
      description """
        顧客がカートの内容を確定し、注文を作成する。
        在庫の引き当てと決済の事前確認を行う。
      """
      link "https://example.com/seq/order" "シーケンス図"

      resource "注文テーブル" [table]
      resource "在庫API" [external, api]
      resource "決済API" [external, api]
    }
    usecase "注文をキャンセルする" {
      link "https://example.com/seq/cancel" "シーケンス図"
      resource "注文テーブル" [table]
    }
    usecase "注文状況を照会する"
  }
  domain "発注" {
    usecase "仕入先に発注する"
    usecase "発注状況を確認する"
  }
}
```

## 未解決の問い

- `link` のラベルを省略した場合の表示: URL をそのまま表示するか、ドメイン名だけ表示するか
- `team` を将来的にリスト型にする可能性（複数チームが共同で1 service を持つケース）
- domain / usecase に種別固有プロパティが必要になった場合の拡張パターン（CommonProperties の拡張 vs 専用 interface の追加）
