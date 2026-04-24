---
id: ADR-20260409-06
title: トップレベル service の Named Import — スタブ補完 + エッジ参照による自動メンバーシップ
status: accepted
date: 2026-04-09
topic: parser
depends_on:
  - ADR-20260409-05
  - ADR-20260405-03
scope:
  packages:
    - core
---

# ADR-20260409-06: トップレベル service の Named Import — スタブ補完 + エッジ参照による自動メンバーシップ

- **日付**: 2026-04-09
- **ステータス**: 決定済み
- **関連**: Issue #412, [ADR-20260409-05](20260409-05-directory-import.md), [ADR-20260405-03](20260405-03-wildcard-import-two-pass-resolution.md)

## 背景

`examples/ec-platform/05-multifile/` では `ECommerce` と `Payment` をいずれの `system` ブロックにも属さないトップレベルの `service` として定義し、`system ECPlatform` から named import で取り込むパターンを示していた。

```krs
// ecommerce.krs
service ECommerce { label "ECサイト"; domain Order { ... } }

// system.krs
import { ECommerce } from "./ecommerce.krs"
system ECPlatform {
  service ECommerce   // スタブ（ボディなし）
  ...
}
```

**期待**: `ECPlatform` の system 図に `ECommerce` がドメイン付きで表示される。  
**実際**: 表示されない、またはドメイン詳細が欠落する。

### 根本原因

`mergeNamedImport` は `importedFile.services`（トップレベル service）でヒットすると `mergedFile.services` に追加していた。一方 `system.krs` のパーサーは `service ECommerce`（ボディなし）を `ECPlatform.children` に空のスタブとして格納していた。レンダラーは `system.children` を使って描画するため、ドメインを持たないスタブが表示されていた。

## 決定

トップレベル service の named import に対して、以下の優先順位で system への組み込みを試みる：

1. **スタブあり（後方互換）**: `system.children` に同 ID のスタブがあれば、タグ・アノテーションを保持してその定義で補完する
2. **エッジ参照あり（主方式）**: スタブはないが `system.edges` で参照されていれば、child として追加する
3. **どちらでもない**: トップレベル service としてそのまま `mergedFile.services` にマージする

### タグ・アノテーションの優先ルール（スタブあり時）

| フィールド | 優先 |
|---|---|
| `tags` | スタブ側（`[external]` / `[deprecated]` 等は利用側の意図） |
| `annotations` | スタブ側 |
| `children`（domain 等） | 定義側 |
| `edges` | 定義側 |
| `label` / `description` / `properties` | 定義側 |

```ts
for (const service of importedFile.services) {
  if (service.id !== id) continue;
  let mergedIntoSystem = false;
  for (const system of mergedFile.systems) {
    const stubIndex = system.children.findIndex((c) => c.id === id && c.kind === "service");
    if (stubIndex >= 0) {
      const stub = system.children[stubIndex] as ServiceNode;
      system.children[stubIndex] = {
        ...service,
        tags: stub.tags.length > 0 ? stub.tags : service.tags,
        annotations: stub.annotations.length > 0 ? stub.annotations : service.annotations,
      };
      mergedIntoSystem = true;
    } else if (system.edges.some((e) => e.from === id || e.to === id)) {
      system.children.push(service);
      mergedIntoSystem = true;
    }
  }
  if (!mergedIntoSystem) mergedFile.services.push(service);
}
```

### スタブの廃止方針

スタブ（`service ECommerce` body なし宣言）は後方互換として動作するが、**主方式はエッジ参照による自動メンバーシップ**とする。将来的にスタブに deprecation warning を出し、最終的に除去することを検討する。

## 理由

- **タグ・アノテーションのスタブ優先**: `[external]` はレンダリング上「システム境界の外に配置する」という意味を持ち、利用側（system.krs）で指定するのが自然。定義側のタグで上書きするとユーザーの意図が失われる
- **エッジ参照による自動メンバーシップ**: `system.edges` で `A -> B` と書くだけで、スタブを書かなくてもサービスがメンバーとして追加される。ファイル分割が軽量になる
- **後方互換維持**: 既存の named import テスト（system 内ノードの取り込み）や既存コードの動作を壊さない
- **複数 system 対応**: `ECPlatform.ECommerce` と `Legacy.ECommerce` は完全修飾名で別エンティティとして識別されるため、全 system を走査して各 system が独立に同一サービスを参照できる
- **`view-extract.ts` を変更しない**: レンダラー層に import 解決ロジックを漏らさない。責務は `ImportResolver` に集約する

## 却下した案

### 案1: スタブを imported 定義で単純置換

スタブ側の `[external]` / `[deprecated]` タグが上書きされてしまい、レンダリング上の意図が失われる。

### 案3: スタブなしの named import をエラー化

後方互換性が壊れ、「system に属さないサービスを shared library として export するだけ」のユースケースを潰す。

### 案4: レンダラー側（`view-extract.ts`）でトップレベル service を補完

責務が分散し、レンダラー層が `mergedFile.services` を参照する新たな依存が生まれる。テストが複雑化する。
