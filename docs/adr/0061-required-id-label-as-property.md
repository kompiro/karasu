# ADR-0061: ID 必須化と `label` のプロパティ化

- **日付**: 2026-03-23
- **ステータス**: 決定済み
- **関連**: Issue #19, [docs/spec/syntax.md](../spec/syntax.md), [ADR-0060](0060-ast-restructure-discriminated-union.md)

## 背景

従来の `BaseNodeFields` では `id?: string`（オプション）・`label: string`（必須）で、`label` が位置引数として必須だった。この設計により `node.id ?? node.label` というフォールバックパターンがコードベース全体（`style-resolver.ts`, `layout.ts`, `view-extract.ts`, `index.ts`, `import-resolver.ts`）に蔓延していた。これは以下の問題を生んでいた：

1. **参照の曖昧さ** — エッジ (`A -> B`) や import が id でも label でも動いてしまう
2. **label 変更が破壊的変更になる** — id がない場合 label がリファレンスキーになり、表示名の変更が参照を壊す
3. **コードの複雑化** — 多箇所に同じフォールバックが散在する
4. **スタイルセレクタの不一致** — `#id` セレクタは label では一切マッチしない

## 決定

**id を必須にし、label をオプションのプロパティにする**（案A）。プレリリース段階のため後方互換は維持しない。

```krs
system ECPlatform {
  label "ECプラットフォーム"
}

service ECommerce {
  label "ECサイト"
  description "商品管理と注文処理"
}

ECommerce -> Payment
```

### AST 変更

```typescript
interface BaseNodeFields {
  id: string;        // 必須
  label?: string;    // オプション
  // ...
}
```

### label 省略時の表示

`label ?? id` をそのまま表示する。CamelCase 変換等は行わない。ユーザーは id 命名時に可読性を考慮する（例: `ECommerce` → そのまま `"ECommerce"` と表示）。

### 影響範囲

| ファイル | 変更 |
|---|---|
| `packages/core/src/types/ast.ts` | `id: string`, `label?: string` |
| `packages/core/src/parser/parser.ts` | `keyword id` 形式を必須化、`label "..."` をプロパティとして解析 |
| `packages/core/src/fs/import-resolver.ts` | `id OR label` の照合を `id` のみに簡略化 |
| `packages/core/src/resolver/style-resolver.ts` | `node.id ?? node.label` → `node.id` |
| `packages/core/src/renderer/layout.ts` | 同上 |
| `packages/core/src/renderer/svg-renderer.ts` | `node.label` → `node.label ?? node.id` |
| `packages/core/src/view/view-extract.ts` | `nodeId()` ヘルパーを削除し `node.id` を直接使用 |
| サンプル `.krs` ファイル | すべて新構文に書き直し |
| `docs/spec/syntax.md` | 新構文を反映 |

## 理由

- **`description` / `link` 等の他プロパティと完全に一貫**: `label` もブロック内プロパティとして扱うことで、構文全体が均一になる
- **フォールバックパターンの完全排除**: `id ?? label` の散在が消え、コードが読みやすくなりバグの温床を除去できる
- **label は表示名に過ぎないという概念を構文レベルで明示**: id が安定した識別子として機能し、label 変更がリファレンスを壊さない
- **パーサーの実装がシンプル**: 位置引数 + オプションプロパティの両対応より、プロパティ一本の方が実装が簡潔
- **プレリリース段階**: 破壊的変更の許容期間であり、構文変更による将来リリース後は自動変換 CLI の提供で対応できる

## 却下した案

### 案B: id 必須化するが label を位置引数として残す

`system ECPlatform "ECプラットフォーム" { }` のような一行記法を維持する案。`description`, `link` 等のプロパティ構文と非対称になり、構文の一貫性が損なわれる。

### 案C: 位置引数 OR プロパティ両対応

両スタイルを受け入れる案。パーサーが複雑化し、「どちらを使えばいいか」でユーザーが迷う。将来の構文拡張時に制約になる可能性がある。

## 残課題

- エッジの inline label（`A -> B "label"` 構文のプロパティ化）は別 Issue で扱う
