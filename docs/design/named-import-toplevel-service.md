# Named Import of Top-Level Services into System Blocks

- **日付**: 2026-04-09
- **ステータス**: 検討中
- **関連**: Issue #412, [directory-import.md](directory-import.md), [multi-file-wildcard-import.md](multi-file-wildcard-import.md)

## 背景・課題

`examples/ec-platform/05-multifile/` では、`ECommerce` と `Payment` をいずれの `system` ブロックにも属さないトップレベルの `service` として定義し、`system ECPlatform` から named import で取り込むパターンを示している。

```krs
// ecommerce.krs
service ECommerce {
  label "ECサイト"
  domain Order { ... }
  domain Catalog { ... }
}

// system.krs
import { ECommerce } from "./ecommerce.krs"

system ECPlatform {
  service ECommerce   // スタブ（ボディなし）
  ...
}
```

**期待**: `ECPlatform` の system 図に `ECommerce` がドメイン付きで表示される。

**実際**: `ECommerce` がダイアグラムに表示されない、またはドメイン詳細が欠落する。

### 根本原因

`mergeNamedImport` は imported identifier を以下の順序で探索する:

1. `importedFile.systems[*].children` — システム内子ノードとして検索 → `mergeNodeIntoSystems` でマージ
2. `importedFile.systems` — system ブロック自体として検索 → system ごと追加
3. `importedFile.services` — トップレベル service として検索 → `mergedFile.services` に追加
4. `importedFile.deploys` — deploy ノードとして検索 → deploy ブロックにマージ

`ecommerce.krs` の `ECommerce` はトップレベル service なので 3. にヒットし、`mergedFile.services`（トップレベル）に追加される。

一方、`system.krs` のパーサーは `service ECommerce`（ボディなし）を `ECPlatform.children` にスタブとして格納しており、このスタブは空のまま残る。

レンダラーは `system.children` を使って描画するため、ドメインを持たないスタブが表示される。

## 制約・前提

- `ImportResolver` の 2 パス構成（Pass 1: ファイルロード, Pass 2: 同期マージ）は変更しない
- `mergeNamedImport` の既存動作（system 内ノードの named import）は壊さない
- パーサー・AST 型は変更しない
- `service X`（ボディなし）はパーサー上「スタブ参照」として機能する — タグやアノテーションを付与できる

## 検討した選択肢

### 案1: スタブを imported 定義で置換（採用候補）

`mergedFile.systems[*].children` に同 ID のスタブが存在する場合、そのスタブを imported service の完全定義で置換する。スタブが見つからない場合は従来通り `mergedFile.services` に追加する。

```ts
for (const service of importedFile.services) {
  if (service.id === id) {
    let mergedIntoSystem = false;
    for (const system of mergedFile.systems) {
      const stubIndex = system.children.findIndex(
        (c) => c.id === id && c.kind === "service",
      );
      if (stubIndex >= 0) {
        system.children[stubIndex] = service;
        mergedIntoSystem = true;
      }
    }
    if (!mergedIntoSystem) {
      mergedFile.services.push(service);
    }
    found = true;
  }
}
```

**メリット**:
- 変更箇所が最小（`mergeNamedImport` のみ）
- 既存の named import テスト（service inside system）への影響なし
- 直感的: import した定義がスタブを「実体化」する

**デメリット**:
- スタブ側のタグ（例: `service ECommerce [external]`）が上書きされる
- スタブのタグを保持したい場合、追加ロジックが必要になる

### 案2: スタブのタグを保持してマージ

スタブを置換するのではなく、imported service のフィールドをスタブにマージし、スタブ側のタグ・アノテーションを優先する。

```ts
// スタブのタグは保持しつつ、children/edges/label 等を imported 定義で補完
const stub = system.children[stubIndex];
system.children[stubIndex] = {
  ...service,           // imported 定義を基底に
  tags: stub.tags,      // スタブのタグを上書き
  annotations: stub.annotations,
};
```

**メリット**:
- `service ECommerce [external]` のようなスタブ側のタグが保持される
- より柔軟な構成（「外部サービスとして参照するが定義は別ファイル」）が可能

**デメリット**:
- どのフィールドを優先するかの仕様決定が必要（label? description? links?）
- 複雑さが増す

### 案3: スタブなしの named import を service 追加ではなくエラーにする

トップレベル service を named import した際に、対応するスタブが system 内に見つからない場合はエラーとする。

**メリット**: 意図の曖昧さを排除

**デメリット**:
- 後方互換性の破壊（現在は `mergedFile.services` への追加が動作する）
- 「system に属さないサービスを shared library として export するだけ」のユースケースを潰す

### 案4: レンダラー側でトップレベル services をシステム内で解決

レンダラー（または `view-extract.ts`）が `system.children` を構築する際に、スタブに対応する top-level service を `mergedFile.services` から補完する。

**メリット**: `mergeNamedImport` を変更しない

**デメリット**:
- 責務が分散する（import 解決はレンダラーの関心ではない）
- `view-extract.ts` が `mergedFile.services` を参照する新たな依存が生まれる
- テストが複雑になる

## 比較

| 観点 | 案1（スタブ置換） | 案2（タグ保持マージ） | 案3（エラー化） | 案4（レンダラー側解決） |
|------|----------------|-------------------|--------------|----------------------|
| 変更箇所の少なさ | ◎ | ○ | ○ | △（2箇所） |
| スタブのタグ保持 | △（上書き） | ◎ | N/A | ◎ |
| 後方互換性 | ◎ | ◎ | ✗ | ◎ |
| 責務の明確さ | ◎ | ◎ | ◎ | ✗ |
| 実装コスト | 低 | 中 | 低 | 中 |

## 現時点の方針

**案1（スタブ置換）** を採用する。

現時点でスタブにタグを付けるユースケース（例: `service ECommerce [external]`）は `05-multifile` の例には存在せず、複雑さを増す理由がない。タグ保持が必要になった時点で案2への拡張は容易。

置換ロジックは `mergeNamedImport` 内で完結し、責務が明確で既存テストへの影響も最小。

## 未解決の問い

- スタブ側に `[external]` などのタグを付けたい場合、将来的に案2へ移行する必要が出るか？
- 複数の system ブロックに同一 ID のスタブがある場合、すべて置換してよいか（現状は `for` ループで全て置換する）？
