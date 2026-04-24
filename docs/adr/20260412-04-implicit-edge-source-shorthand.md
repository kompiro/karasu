---
id: ADR-20260412-04
title: ブロック内エッジの暗黙 source 簡略記法
status: accepted
date: 2026-04-12
topic: parser
depends_on:
  - ADR-20260411-02
related_to:
  - ADR-20260410-02
scope:
  packages:
    - core
---

# ADR-20260412-04: ブロック内エッジの暗黙 source 簡略記法

- **日付**: 2026-04-12
- **ステータス**: 決定済み
- **関連**: Issue #496, Issue #477, [ADR-20260411-02](20260411-02-deprecated-domain-migration-coexistence.md), [ADR-20260410-02](20260410-02-krs-formatter.md)

## 背景

ブロック内でエッジを宣言する際、source を明示的に書く必要があり冗長だった：

```krs
domain Contract {
  Contract -> Billing      // source が自明で冗長
  Contract --> Shipping
}
```

source は親ブロックの ID と同一で文脈から自明なため、簡略記法が欲しい：

```krs
domain Contract {
  -> Billing               // Contract -> Billing と等価
  --> Shipping             // Contract --> Shipping と等価
}
```

この課題は ADR-20260411-02（#477: 移行期のドメイン共存）の受け入れテスト作成時に発見された。

## 決定

### 1. 適用範囲: `service` と `domain`（案 A-2）

`service` / `domain` ブロック内で `-> Target` / `--> Target` を許容する：

```krs
service ECommerce {
  -> Payment "delegates payment"    // ECommerce -> Payment
}

domain Contract {
  -> Billing                        // Contract -> Billing
}
```

- **`system` は対象外**: 内部に複数の service を持ち、source が自明でない
- **`usecase` / `resource` は対象外**: 現状のモデリングでエッジ宣言のユースケースがない。将来 `parentId` を渡すだけで拡張できる設計

### 2. sync / async 両対応

`->` / `-->` の両方をサポートする。パーサー条件は `token.type === TokenType.Arrow || token.type === TokenType.DashedArrow` で同一分岐で処理できる。

### 3. 既存明示記法の `from` を親 ID に制限

明示記法で `from ≠ parentId` の場合はエラーにする：

```krs
domain Contract {
  Contract -> Billing      // OK: from === parentId
  OtherDomain -> Billing   // ERROR: from !== parentId
  -> Billing               // OK: 簡略記法（from = parentId で補完）
}
```

`system` ブロック内のエッジは `from` が複数 service のいずれかを指すため、この制約を適用しない。

### 4. パーサー変更

- `parseBlockContentsWithProperties()` に `parentId?: string` パラメータを追加
- `Arrow` / `DashedArrow` で始まる行を検出し、`parseEdge(parentId)` を呼ぶ
- `parseEdge()` に `implicitFrom?: string` パラメータを追加（省略時は現在の動作）
- 明示記法で `from ≠ parentId` の場合にエラー診断を出す
- `parseNodeDecl()` から呼び出し時に `id` を渡す（`system` は渡さない）

### 5. AST 構造は不変

AST の `KrsEdge` 構造は明示記法と簡略記法で**同一**（パーサーが `edge.from` に親 ID を補完する）。下流への影響：

- `view-extract.ts`（`deriveImplicitServiceEdges` など）: 変更不要
- `svg-renderer.ts`: 変更不要
- LSP: 変更不要
- `formatter.ts`: `renderEdge()` を変更し、ブロック内エッジは簡略記法で出力する（`format()` は冗長な `Contract -> Billing` を `-> Billing` に正規化）

## 理由

- **構文の曖昧性なし**: ブロック内の行頭トークンは `label` / `description` / `link` / `team` / `role` / `Identifier` / `}` のいずれか。`Arrow` / `DashedArrow` で始まる行は既存構文と衝突しない
- **AST を変えない**: パーサーが `edge.from` を補完することで下流の view-extract / renderer / LSP / フォーマッターが一切変更不要になる
- **`from` の親 ID 制限**: `service` / `domain` ブロック内のエッジの source は意味的に常に親ノードであるべき。制約することで `view-extract` 等が不正な `edge.from` を受け取るリスクがなくなり、フォーマッターも安全に簡略記法を出力できる
- **`system` を対象外とする**: `system` 内の複数 service 間のエッジは source が自明でなく、簡略記法は混乱を招く
- **将来拡張への対応**: `usecase` / `resource` で後から必要になっても `parentId` を渡すだけで拡張できる

## 却下した案

### 案 A-1: domain ブロック限定

Issue #496 の元のスコープだが、service でも同じ冗長性があるため限定する理由が弱い。

## 残課題

なし。
