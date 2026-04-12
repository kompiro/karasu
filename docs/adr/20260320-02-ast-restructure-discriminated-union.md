# ADR-0060: AST 再構成 — Discriminated Union とプロパティブロック

- **日付**: 2026-03-20
- **ステータス**: 決定済み
- **関連**: [docs/spec/syntax.md](../spec/syntax.md), [docs/spec/tags-annotations.md](../spec/tags-annotations.md)

## 背景

従来のノード宣言は位置引数で label と description を並べる構文（`service ECommerce "ECサイト" "商品管理と注文処理" [external]`）で、label と description の区別が曖昧、description の表現力が不足（単一行のみ）、要素ごとのプロパティ拡張が困難という問題があった。また AST 型 `KrsNode` は単一 interface で全種別を表現しており、`role` のような種別固有フィールドが全ノードに露出し、新しいプロパティを追加するたびに optional フィールドが増えて型の意味が薄れていた。パーサーやレンダラーで `kind` に応じて分岐しても型が narrowing されない問題もあった。

## 決定

### 1. 構文: プロパティブロック

label は位置引数のまま残し、description を含むすべてのプロパティをブロック `{ }` 内に移動する。複数行 Markdown は `"""..."""`（トリプルクォート）で記述でき、閉じ `"""` の位置を基準に共通の先頭空白を除去する。位置引数の description は**廃止**し、パーサーがエラーを出して移行方法を示す。

```krs
service ECommerce "ECサイト" [external] {
  description """
    商品管理と注文処理を担当するサービス。

    ## 責務
    - 商品カタログの管理
  """
  team "EC開発チーム"
  link "https://wiki.example.com/ec" "設計Wiki"
}
```

### 2. 共通プロパティと種別固有プロパティ

全種別共通: `description`, `link`（複数可）。service 固有: `team`。user 固有: `role`（既存）。domain / usecase / resource は現時点で固有プロパティなし。resource の種別（table / queue / api / storage 等）はタグで表現する。

### 3. AST 型: Discriminated Union

```typescript
interface BaseNodeFields { id?: string; label: string; tags, annotations, children, edges, loc }
interface CommonProperties { description?: string; links: LinkEntry[] }

interface SystemNode extends BaseNodeFields { kind: "system"; properties: CommonProperties }
interface ServiceNode extends BaseNodeFields { kind: "service"; properties: CommonProperties & { team?: string } }
interface UserNode extends BaseNodeFields { kind: "user"; properties: CommonProperties & { role?: string } }
// domain / usecase / resource も同様

type KrsNode = SystemNode | ServiceNode | DomainNode | UsecaseNode | ResourceNode | UserNode;
```

`LayoutNode` にも `kind` を追加し、`description` / `role` の個別フィールドは廃止して `properties` に統一する。

### 4. トップレベル service

ファイル直下の `service` 宣言を `KrsFile.services: ServiceNode[]` に格納する。レンダラーは無所属グループとして描画し、将来 system に移動する際はカット&ペーストで完了する。

### 5. 新規トークン

`Description`, `Team`, `Link`, `TripleQuote`（`Role` は既存）。resource タグは既存の文字列トークン機構をそのまま使う。

## 理由

- **Discriminated Union + `properties` サブオブジェクト**: `switch (node.kind)` で `node.properties` が種別ごとに narrowing される。`ServiceNode["properties"]` の `team` 等の固有フィールドが型安全にアクセスできる
- **位置引数 description の廃止**: プレリリース段階であり、移行コストより構文の明確さを優先。パーサーが検出した時点で明示的なエラー diagnostic を出して移行を促す
- **`"""` トリプルクォート**: Python の `textwrap.dedent` と同じ挙動でインデントを扱うため、ブロック内の `description` が Markdown として自然に書ける
- **resource 種別のタグ化**: `[table]` / `[api]` などのタグ表現は `.krs.style` でスタイル制御でき、構文・型の両方をシンプルに保てる
- **トップレベル service**: 「配置先のシステムが未定」という段階的な設計フローを許容し、`KrsFile.services` に明示的に格納することで未所属状態が型で表現される

## 却下した案

### 後方互換としての位置引数 description 維持

`service ECommerce "ECサイト" "説明"` と `service ECommerce "ECサイト" { description "説明" }` を両方サポートする案。パーサーが複雑化し、「どちらを使えばいいか」がユーザーを迷わせる。プレリリース段階のため廃止の方が将来コストが低い。

### 単一 `KrsNode` interface を維持して `properties: Record<string, any>` とする

型安全性が完全に失われ、`role` / `team` が使える種別が型から読み取れなくなる。
