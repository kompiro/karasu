# ID 必須化と label のプロパティ化

- **日付**: 2026-03-23
- **ステータス**: ドラフト
- **関連**: [Issue #19](https://github.com/kompiro/karasu/issues/19), `docs/spec/syntax.md`

## 背景・課題

現在、`BaseNodeFields` の `id` はオプショナルであり、`label` は位置引数として必須となっている。
この設計が原因で、コードベース全体に `node.id ?? node.label` というフォールバックパターンが蔓延している。

### 現在の構文

```
system "ECプラットフォーム" { }           // id なし、label のみ
service ECommerce "ECサイト" { }          // id + 位置引数ラベル
"ECサイト" -> "決済"                      // id がないノードは label で参照
```

### 問題のある AST 型

```typescript
interface BaseNodeFields {
  id?: string;      // オプション
  label: string;    // 必須・位置引数
  // ...
}
```

### 影響を受けているファイル

| ファイル | パターン |
|---------|---------|
| `packages/core/src/resolver/style-resolver.ts` | `node.id ?? node.label` をスタイルキーに使用 |
| `packages/core/src/renderer/layout.ts` | `node.id ?? node.label` でレイアウトキー導出 |
| `packages/core/src/view/view-extract.ts` | `nodeId()` ヘルパー関数が `id ?? label` を返す |
| `packages/core/src/index.ts` | メタデータマップのキーに `id ?? label` |
| `packages/core/src/fs/import-resolver.ts` | `id OR label` で import 対象を照合 |

### 課題のまとめ

1. **参照の曖昧さ** — エッジ (`A -> B`) や import が ID でも label でも動いてしまい、どちらが正しいか不明確
2. **label 変更が破壊的変更になる** — id がなければ label がリファレンスキーとなるため、表示名の変更がリファレンスを壊す
3. **コードの複雑化** — 多箇所に同じフォールバックパターンが散在し、バグの温床になる
4. **スタイルセレクタの不一致** — `#id` セレクタは id にしかマッチしないが、id が省略されると選択できない

## 制約・前提

- 既存の `.krs` ファイルとの後方互換性は **維持しない**（破壊的変更として扱う）
- パーサーは変更後の新構文のみをサポートする（移行ガイドを提供する）
- label はあくまで表示用の文字列であり、参照・照合には使わない
- `system` ブロックは引き続き子ノードを持てる

## 検討した選択肢

### 案A: id を必須にし、label をプロパティとして省略可能にする（Issue 提案案）

```
system ECPlatform {
  label "ECプラットフォーム"
}

service ECommerce {
  label "ECサイト"
  description "商品管理と注文処理"
}

ECommerce -> Payment
```

**AST 変更:**

```typescript
interface BaseNodeFields {
  id: string;        // 必須
  label?: string;    // オプション（省略時は id を表示名として使用）
  // ...
}
```

**レンダラー変更:**
```typescript
// 変更前
el("text", {}, escapeXml(node.label))

// 変更後
el("text", {}, escapeXml(node.label ?? node.id))
```

**メリット:**
- すべての参照が id 一本化され、フォールバックパターンが消える
- label 変更がリファレンスを壊さない
- `description` と対称なシンプルな構文になる
- id が安定した識別子として機能する

**デメリット:**
- 既存の `.krs` ファイルはすべて書き直しが必要（破壊的変更）
- `service ECommerce "ECサイト"` のような簡潔な一行記法ができなくなる
- ブロック `{ }` が label しか持たないノードにも必要になる（冗長に見える場合がある）

---

### 案B: id を必須にするが、label を位置引数として残す（後方互換を部分維持）

```
system ECPlatform "ECプラットフォーム" { }
service ECommerce "ECサイト" { }

ECommerce -> Payment
```

**AST 変更:**

```typescript
interface BaseNodeFields {
  id: string;        // 必須
  label?: string;    // オプション（位置引数として残す）
  // ...
}
```

構文規則:
```
<種別> <id> ["<ラベル>"] [タグ] [@アノテーション] [{ ... }]
```

**メリット:**
- 既存の `id + label` 形式は互換性を保てる（id なしの形式だけ壊れる）
- 一行記法のシンプルさを維持できる

**デメリット:**
- `id` のない既存構文（`service "ラベルのみ"`）は依然として壊れる
- `label` が位置引数のままなので、他のプロパティとの一貫性がない
- プロパティ構文（`description`, `link` 等）との非対称性が残る

---

### 案C: id を必須にし、label を位置引数 OR プロパティの両方で受け付ける

```
// 位置引数スタイル（簡潔）
service ECommerce "ECサイト" { }

// プロパティスタイル（詳細）
service ECommerce {
  label "ECサイト"
  description "詳細説明"
}
```

**メリット:**
- 両スタイルを受け入れるので移行しやすい
- 一行記法を維持できる

**デメリット:**
- パーサーが複雑化する（位置引数とプロパティ両対応）
- 「どちらを使えばいい？」とユーザーが迷う
- 将来の構文拡張時に制約になる可能性がある

## 比較

| 観点 | 案A（プロパティのみ） | 案B（位置引数維持） | 案C（両対応） |
|------|--------|--------|--------|
| フォールバック排除 | ✅ 完全に排除 | ✅ 完全に排除 | ✅ 完全に排除 |
| 構文の一貫性 | ✅ 高い | △ 中程度 | △ 中程度 |
| 一行記法 | ❌ 不可 | ✅ 可能 | ✅ 可能 |
| パーサー複雑度 | 低 | 低 | 高 |
| 移行コスト | 高 | 中 | 低 |
| 将来の拡張性 | ✅ 高い | △ 普通 | ❌ 低い |
| `description` との対称性 | ✅ 完全 | ❌ 非対称 | △ 部分的 |

## 現時点の方針

**案A（id 必須 + label をプロパティ化）を採用する方向。**

理由:
- `description` や `link` などの他プロパティと完全に一貫した構文になる
- フォールバックパターンを完全に排除できる
- label は表示名に過ぎないという概念が構文レベルで明示される
- パーサーの実装がシンプルになる

一行記法の喪失については、label が不要なケース（`service Auth { }` → 表示名は "Auth"）が多いため、実際の冗長さは限定的と考える。

### 実装スコープ（案A）

1. **AST 変更** (`packages/core/src/types/ast.ts`)
   - `BaseNodeFields.id` を `string` に変更（必須化）
   - `BaseNodeFields.label` を `string | undefined` に変更（オプション化）

2. **パーサー変更** (`packages/core/src/parser/parser.ts`)
   - `parseNodeDecl()`: `keyword id` 形式を必須にし、位置引数ラベルを削除
   - `parseProperties()`: `label "..."` をプロパティとして解析

3. **Import Resolver 変更** (`packages/core/src/fs/import-resolver.ts`)
   - `id OR label` の照合を `id` のみに簡略化

4. **Style Resolver 変更** (`packages/core/src/resolver/style-resolver.ts`)
   - `node.id ?? node.label` を `node.id` に置換

5. **Renderer/Layout 変更**
   - `packages/core/src/renderer/layout.ts`: `node.id ?? node.label` を `node.id` に置換
   - `packages/core/src/renderer/svg-renderer.ts`: `node.label` を `node.label ?? node.id` に変更
   - `packages/core/src/view/view-extract.ts`: `nodeId()` ヘルパーを削除し `node.id` を直接使用

6. **テスト・サンプル更新**
   - すべての `.krs` サンプルファイルを新構文に更新
   - パーサーテストのフィクスチャを更新

7. **仕様ドキュメント更新** (`docs/spec/syntax.md`)

## 未解決の問い

1. **label 省略時の表示** — id をそのまま表示名として使う場合、CamelCase ID（`ECommerce`）が読みにくい。スペース区切りへの自動変換（`ECommerce` → `E Commerce`）は行うべきか、それとも id 命名規則でスネークケースを推奨するか？

2. **エッジの inline label** — 現在エッジには `A -> B "label"` のような構文は存在しないが、今回の変更で統一するか？

3. **`system` の扱い** — `system` は子ノードをまとめる特殊なノードだが、id 必須化の対象に含めるか（Issue の Scope には含まれているが確認が必要）。

4. **移行ガイドの形式** — ドキュメントのみか、CLI ツールによる自動変換を提供するか？
