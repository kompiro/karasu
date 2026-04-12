# Chat からの構造的 .krs 編集 — apply_krs_patch の replace/remove 対応

- **日付**: 2026-04-10
- **ステータス**: 検討中
- **関連**:
  - [#442 feat(app): support structural krs editing via Chat](https://github.com/kompiro/karasu/issues/442)
  - [ADR-0028](../adr/0028-chat-ui-phase2-byok-ai-integration.md) — Phase 2 実装設計
  - [ADR-0078](../adr/0078-chat-ui-panel.md) — レイアウト・状態管理・ツール設計の上位設計

## 背景・課題

Phase 2（#419）で実装した `apply_krs_patch` ツールは、AI が提案したスニペットを
ファイル末尾に追記するのみ（`fileContent + "\n" + patch`）。

これは以下のユースケースに対応できない：

| ユースケース | 現状 |
|---|---|
| 既存ノードの label/uses を変更する | 末尾に重複ブロックが追記されてしまう |
| system ブロック内に child service を追加する | 末尾に孤立したブロックが生まれる |
| 不要になったノードを削除する | 削除手段がない |
| 新しいトップレベルブロックを追加する | 現状の append で対応可（そのまま維持） |

`KrsNode.loc`（`start.offset` / `end.offset`）が AST に含まれており、
ソーステキストへの精密なスプライスが可能な状態にある。

## 制約・前提

- `@karasu/core` の `Parser.parse()` はブラウザ環境でも同期実行可能
- `SourceLocation.offset` は UTF-16 コードユニット単位の文字オフセット（`string.slice()` と互換）
- AI（Claude）は自然言語の指示から「どのノードを置換/削除するか」を `.krs` の構造を読んで判断する
- Phase 2 の `useChatSession.ts` が変更対象の中心
- ストリーミングなし（一括応答）は Phase 2 から継続
- マルチファイルプロジェクトでは `loc.offset` は **そのファイル内** のオフセットを指す（インポート解決後の統合 AST ではない）

## 検討した選択肢

### 案A: Diff/patch 形式（unified diff）

AI に unified diff を出力させ、diff ライブラリで適用する。

**メリット**:
- 言語・構造に依存しない汎用フォーマット
- 挿入位置を行単位で指定できる

**デメリット**:
- AI が正確な unified diff を生成するのが難しい（インデント・行番号のずれで頻繁に失敗）
- ファイルが変更されていると diff の適用自体が壊れる
- diff ライブラリの追加依存が必要

**結論**: 採用しない。AI の diff 生成精度が低く、UX リスクが高い。

---

### 案B: ファイル全体置換

AI にファイル全体の更新後内容を返させ、そのまま `onEditorChange(newContent)` で適用する。

**メリット**:
- 実装が最もシンプル（既存の `applyPatch` をほぼ変えない）
- 挿入・削除・置換すべてに対応できる

**デメリット**:
- 大きなファイルではトークン使用量が高い（入力＋出力の両方でファイル全体を消費）
- AI が無関係な箇所を誤って変更するリスクがある
- ユーザーが「どこを変えたのか」を確認しづらい

**結論**: バックアップ案として保持。大規模ファイルでは問題になりやすい。

---

### 案C: AST 対応構造パッチ（汎用パッチスキーマ）

パーサーで対象ノードを特定し、`{ target: "NodeId", operation: "replace" | "insert-child" | "remove", content: "..." }` スキーマでパッチを適用する。

**メリット**:
- ホワイトスペース・フォーマットの揺れに強い
- 未変更部分を正確に保持できる

**デメリット**:
- `insert-child` には「親ブロックの閉じ `}` の直前に挿入する」ロジックが必要で、実装コストが高い
- スキーマの設計が複雑になる

**結論**: `insert-child` の実装コストが見合わないため、以下の案Dをベースにする。

---

### 案D: ノード ID ベースのブロック置換（**採用**）

AI が対象ノード ID と置換後の完全なブロックを返す。
アプリが AST の `loc.start.offset` / `loc.end.offset` を使ってソーステキストをスプライスする。

```
AI → apply_krs_patch {
  operation: "replace",
  targetNodeId: "PaymentService",
  content: "service PaymentService {\n  label: \"決済サービス\"\n  uses: AuthService\n}"
}
App → Parser.parse(fileContent)
     → ノードを id で探索（再帰）
     → source.slice(0, node.loc.start.offset)
       + content
       + source.slice(node.loc.end.offset)
```

サポートする操作:

| operation | targetNodeId | content | 挙動 |
|---|---|---|---|
| `append` | 不要 | 必須 | 末尾追記（現状維持） |
| `replace` | 必須 | 必須 | ノードをブロックごと置換 |
| `remove` | 必須 | 不要 | ノードとその前後の空白行を削除 |

**メリット**:
- `insert-child` は「親ノード全体を replace」で自然に表現できる（AI が親ブロック全体を書き直す）
- AST の `loc` を活用するため実装がシンプル
- 案C の汎用スキーマより AI への指示が明確
- `append` を残すことで後方互換性を維持

**デメリット**:
- ノードが大きい場合、`replace` でも AI のトークン使用量は増える
- `loc` のオフセットがどこまでのテキストを含むか（前後の改行・コメント）はパーサーの実装に依存する

---

## 比較

| | 案A (diff) | 案B (全体置換) | 案C (汎用AST) | 案D (ID置換) |
|---|---|---|---|---|
| AI の生成精度 | 低（diff形式は壊れやすい） | 高（自然言語に近い） | 高 | 高 |
| トークン効率 | 高 | 低（全体） | 高 | 中（ノード単位） |
| 実装コスト | 高（diff適用） | 低 | 高（insert-child） | 中 |
| 未変更部分の保護 | 高 | 低 | 高 | 高 |
| insert-child 対応 | ○ | ○ | ○（複雑） | △（replace で代替） |
| remove 対応 | ○ | ○ | ○ | ○ |

---

## 現時点の方針

**案D（ノード ID ベース置換）を採用し、`append` / `replace` / `remove` の 3 操作を実装する。**

### ツールスキーマ変更

```ts
// 旧スキーマ（Phase 2）
apply_krs_patch { patch: string, description: string }

// 新スキーマ
apply_krs_patch {
  operation: "append" | "replace" | "remove",
  targetNodeId?: string,   // replace/remove 時に必須
  content?: string,        // append/replace 時に必須
  description: string
}
```

### 実装ファイル

```
packages/app/src/
├── utils/
│   └── krs-patch.ts         ← 新設: applyKrsPatch() 関数
│   └── krs-patch.test.ts    ← 新設: ユニットテスト
└── hooks/
    └── useChatSession.ts    ← 修正: 新スキーマ対応
```

### `applyKrsPatch` の設計

```ts
type PatchOperation = "append" | "replace" | "remove";

type PatchResult =
  | { ok: true; source: string }
  | { ok: false; error: string };

function applyKrsPatch(
  source: string,
  operation: PatchOperation,
  targetNodeId?: string,
  content?: string,
): PatchResult
```

内部ロジック:

**1. `append`**
```ts
return { ok: true, source: source + "\n" + content };
```

**2. `replace` / `remove`**
```
Parser.parse(source) で KrsFile を生成
→ systems, services, domains (KrsNode) を再帰的に探索し id === targetNodeId のノードを発見
→ 見つからない場合: { ok: false, error: `Node "${targetNodeId}" not found` }
```

`replace`:
```ts
const start = node.loc.start.offset;
const end = node.loc.end.offset + 1;  // end.offset は } の位置（包含）なので +1
return { ok: true, source: source.slice(0, start) + content + source.slice(end) };
```

`remove`:
```ts
const start = node.loc.start.offset;
const end = node.loc.end.offset + 1;
const before = source.slice(0, start).replace(/[ \t]*\n?$/, '');
const raw = source.slice(end);
// 先頭ノード（before が空）: 先頭の全空白を除去。中間/末尾: 改行1つ除去
const after = before.trim() === '' ? raw.replace(/^\s+/, '') : raw.replace(/^\n/, '');
return { ok: true, source: before + after };
```

**探索対象**: `KrsFile.systems`, `.services`, `.domains` を再帰的にたどる（`deploy`・`organization` は対象外）。

**`loc.end.offset` の境界**: `}` トークンの文字位置（包含）。スライス境界は `end.offset + 1`。
実験結果（例）:
```
"service Bar {}"  → loc = { start.offset: 15, end.offset: 28 }
src.slice(15, 29) → "service Bar {}"  // 28+1=29
```

**`remove` 後の空白行**: 6パターンのテストで全ケース parse 成功を確認済み（see git history）。

### エラーハンドリング

| ケース | 挙動 |
|---|---|
| `targetNodeId` のノードが見つからない | `{ ok: false, error: "Node \"X\" not found" }` → UI に警告表示 |
| `replace` / `remove` で `targetNodeId` が未指定 | `{ ok: false, error: "targetNodeId is required for replace/remove" }` |
| `append` / `replace` で `content` が未指定 | `{ ok: false, error: "content is required for append/replace" }` |

UI での表示: `applyPatch` 失敗時は ChatPane に `⚠ パッチの適用に失敗しました: {error}` を表示し、
`patch.contentHashAtProposal` チェック同様にパッチ確認ボタンを無効化する。

### システムプロンプトの更新

現在のプロンプト:
```
- 変更を提案する場合は apply_krs_patch ツールを使用する。パッチは編集対象ファイルの末尾に追記される
```

更新後:
```
- 変更を提案する場合は apply_krs_patch ツールを使用する
  - 新しいトップレベルブロックを追加する場合: operation="append", content=ブロック全体
  - 既存ノードを変更する場合（child 追加含む）: operation="replace", targetNodeId=対象ノード ID, content=置換後のブロック全体
  - ノードを削除する場合: operation="remove", targetNodeId=対象ノード ID
```

## 未解決の問い

（なし — 実験によりすべて解消済み）
