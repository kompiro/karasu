# ADR-20260330-04: Permanent Link — `nodePathIndex` と URL hash の 2 フェーズ実装

- **日付**: 2026-03-30
- **ステータス**: 決定済み
- **関連**: Issue #110, Issue #92, [ADR-20260404-05](20260404-05-browser-history-navigation.md)

## 背景

Issue #110 では、org ビューのチームカードに表示される `owns` リスト内のドメイン名をクリックしたとき、そのドメインの詳細ビューへ直接ナビゲートしたいというユーザー要求があった。当時の実装には 3 つの問題があった：

1. **逆引きインデックスがない**: `ownerIndex` は `serviceId → teamId` の単方向マップのみ。`nodeId → viewPath` の逆引き手段がなかった
2. **ナビゲーション先が曖昧**: system 階層内でノード ID の一意性が保証されておらず、ID だけでどのビューパスに対応するか特定できない可能性があった
3. **永続化できない**: ビュー状態（`activeView` + `viewPath`）が URL に反映されず、共有・復元ができなかった

## 決定

**Phase 1 (A-1 + B-2)**: `KrsFile.nodePathIndex: Map<string, string[]>` を追加する。パース時に一度構築すれば検索コストがゼロで、`ownerIndex` と同じ設計パターンで一貫性がある。

```typescript
function buildNodePathIndex(systems: SystemNode[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  function walk(node: KrsNode, path: string[]) {
    const currentPath = [...path, node.id];
    index.set(node.id, currentPath);
    for (const child of node.children) walk(child, currentPath);
  }
  for (const system of systems) {
    for (const child of system.children) walk(child, []);
  }
  return index;
}
```

`owns: EC` クリック時に `nodePathIndex.get("EC")` でパスを解決し、`SET_ACTIVE_VIEW + SET_VIEW_PATH` を dispatch する。

**Phase 2 (B-1)**: URL hash による永続リンク（ADR-20260404-05 で実装）。

### ID 一意性・存在確認の 3 段階バリデーション

すべて `nodePathIndex` 構築と同時に行う：

| ケース | 重要度 |
|---|---|
| 同一 parent の children 内での重複 | **error**（team ID の重複と同じ扱い） |
| 異なるスコープ間（例: `Payment/EC` と `Order/EC`）での重複 | **warning**（最初のパスを採用） |
| `owns` に記載された ID が system 階層に存在しない | **warning**（未解決参照） |

## 理由

- **`ownerIndex` と同じ設計パターン**: パース後処理として同時に構築することで、既存の resolver ステップに自然に組み込める。クエリ O(1)
- **URL hash で永続リンクを実現**: Issue タイトルの「permanent link」の意図に合致し、リロード・共有・ブックマークに対応できる
- **段階的な実装**: A-1 → B-1 の順で独立して PR を分割でき、Phase 1 だけでも Issue #110 の当初要求（クリックでナビゲート）は満たせる
- **同一 ID 重複を warning にとどめる**: ID の一意性はユーザーの設計責務であり、`.krs` 構文を拡張して強制する必要はない

## 却下した案

### 案 A-2: `app` 側でオンザフライ検索

パース結果は変更せずクリック時に system 階層を再帰検索する案。毎回 O(n) 探索になり、`app` と `core` の責務が混在する。

### 案 A-3: `owns` に完全パス参照を許容する構文拡張

`owns: Payment/EC` のような path 形式を導入する案。破壊的な構文変更であり、既存の `.krs` ファイルとの互換性を壊す。ID の一意性はユーザーの設計責務のため、構文を拡張して強制する必要はない（各ドメインに異なる ID を設定し `label` で共通の表示名を付ければ対処できる）。

### 案 B-2: AppState のフィールドのみで完結（URL 非使用）

Issue #110 の最短経路だが、リロードで状態が消えるため「permanent link」の性質がない。

### 案 B-3: URL search params (`?view=system&path=Payment,EC`)

Vite + React SPA ではサーバー側のルーティング設定が必要になる場合があり、hash よりも変更コストが高い。
