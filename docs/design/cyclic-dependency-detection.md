# Cyclic Dependency Detection and Visual Highlighting

- **日付**: 2026-04-05
- **ステータス**: 検討中
- **関連**: Issue #287, [cross-system-service-references.md](cross-system-service-references.md), [builtin-style-and-reference.md](builtin-style-and-reference.md)

## 背景・課題

`A -> B -> A` のようなサービス間の循環依存（サイクル）は、現在の karasu では検出も可視化もされない。
レンダリング自体は行われるが、サイクルの存在がダイアグラム上に一切現れない。

同期呼び出しのサイクルはアーキテクチャ上の問題（密結合・デッドロックリスク）を示すことが多く、
著者が意図せず作り込んでいるケースも考えられる。**検出して警告し、視覚的に目立たせる**ことが目標。

### サイクルの種類

| 種別 | 例 | 深刻さ |
|------|------|------|
| 直接サイクル | `A -> B`, `B -> A` | warning |
| 間接サイクル | `A -> B -> C -> A` | warning |
| 自己参照 | `A -> A` | warning |

すべて warning 扱い（エラーにしない）。サイクルがあっても図は描画し続ける。

## 制約・前提

- `KrsEdge` は `ast.ts` で定義。パーサーが生成し、resolver → renderer と流れる
- `analyze()` は `_compileCore` 内で `resolveStyles()` より**前**に呼ばれる（実行順序が保証される）
- 既存のエッジスタイルシステムは `edge[tag]` セレクタで動作する（例: `edge[async]`）
- スタイルはすべてインライン SVG 属性として適用される（外部 CSS ファイルは使用しない）
- ユーザーは `.krs.style` で `edge[cyclic] { color: ...; }` としてオーバーライドできること

## 検討した選択肢

### 案1: 検出結果を `Warning[]` のみで返す（AST 非破壊）

`detectCyclicDependencies()` がサイクルの警告だけを返し、`KrsEdge` を変更しない。
レンダラー側でも変化なし（スタイルで区別できない）。

**メリット:**
- `analyze()` が副作用なしの純粋関数のまま

**デメリット:**
- 視覚的ハイライトができない。警告パネルにしか情報が出ない
- Issue #287 の「cyclic edges render with correct class」要件を満たせない

→ **却下**: 視覚化がこの Issue の核心

---

### 案2: サイクルエッジを別コレクションで管理し render 時に渡す

`analyze()` が `Warning[]` と `Set<string>`（cyclic な `"from->to"` キーの集合）を返す。
`compile()` がそのセットを `render()` に渡してスタイルを上書きする。

**メリット:**
- `KrsEdge` を汚さずに済む
- `analyze()` の戻り値が明示的

**デメリット:**
- `CompileResult` や `render()` のシグネチャ変更が必要（波及大）
- スタイルリゾルバー（`edge[cyclic]` セレクタ）と分離したまま動かすためのグルーコードが増える
- `buildDrillDownSvg` など他の SVG ビルダーにも同様の変更が必要

→ **却下**: 波及範囲が大きく、既存スタイルシステムを活かせない

---

### 案3: `KrsEdge.cyclic` フラグを立て、スタイルシステムに乗せる ← **採用**

`analyze()` 内でサイクルを検出し、サイクルに参加するエッジに `edge.cyclic = true` をセット（mutation）。
`resolveStyles()` が実行される前に `analyze()` が完了するため、スタイル解決時にフラグが利用できる。

`style-resolver.ts` の `edgeSelectorMatches()` で `cyclic` を仮想タグとして扱う:
```typescript
if (edge.cyclic) edgeTags.push("cyclic");
```

ビルトインスタイルに `edge[cyclic]` ルールを追加:
```css
edge[cyclic] {
  color: #EF4444;
  stroke-width: 2.5;
}
```

SVG レンダリング時は `class="krs-edge--cyclic"` 属性も付与し、将来の CSS オーバーライドに備える。

**メリット:**
- 既存の `edge[tag]` スタイルシステムをそのまま活用できる
- ユーザーは `edge[cyclic] { color: ...; }` で上書き可能（一貫した体験）
- `render()` 等のシグネチャ変更が不要
- `LayoutEdge.cyclic` を通じて SVG レイヤーまで自然に伝播する

**デメリット:**
- `analyze()` が `KrsEdge` を mutation する副作用を持つ
- 呼び出し順序（`analyze()` before `resolveStyles()`）への依存

**副作用のリスク軽減:**
- `_compileCore` と `_compileProjectCore` の両方で順序は固定されており、変更される理由がない
- `analyze()` の呼び出しは常に compile パイプラインの入り口に近い箇所に集中している

## 設計方針

### サイクル検出アルゴリズム

DFS（深さ優先探索）による後退辺検出。スコープはノード階層の各レベル。

```
WHITE (未訪問) / GRAY (探索中) / BLACK (完了)
```

検査対象は `edge.kind === "sync"` のエッジのみ（async エッジはスキップ）。

後退辺（GRAY ノードへのエッジ）を発見したら:
1. パスを遡り、サイクルに参加するすべてのエッジを特定
2. 該当エッジに `cyclic = true` をセット
3. 警告メッセージ `Circular dependency detected: A → B → A` を生成

自己参照（`A -> A`）は DFS の前に専用チェックで処理する。

### スコープの扱い

`system.edges`（システム直下の子ノード間エッジ）と各子ノードの `edges`（サービス内部のエッジ）を再帰的に検査する。

```
system ECommerce         → system.edges を検査
  service OrderService   → service.edges を検査
    domain Inventory     → domain.edges を検査
```

### 変更ファイルサマリー

| ファイル | 変更内容 |
|---------|---------|
| `types/ast.ts` | `KrsEdge` に `cyclic?: boolean` 追加 |
| `types/warnings.ts` | `WarningKind` に `"cyclic-dependency"` 追加 |
| `resolver/warnings.ts` | `detectCyclicDependencies()` 追加・`analyze()` に組み込み |
| `resolver/style-resolver.ts` | `edgeSelectorMatches()` で `cyclic` を仮想タグとして扱う |
| `builtins/default-style.ts` | `edge[cyclic]` ルール追加 |
| `renderer/layout.ts` | `LayoutEdge` に `cyclic?: boolean` 追加・伝播 |
| `renderer/edge-routing.ts` | `class="krs-edge--cyclic"` 付与 |

## 未解決の問い

- **スコープをまたぐサイクルの検出**: 現状、スコープ（system/service）をまたいだエッジのサイクルは検出対象外。例えば `system.edges` で `A -> B` があり、`B.edges` で `B.child -> A.child` があるケースは別スコープとして扱われる。将来的に扱うべきか否かは今後の判断に委ねる。
- ~~**async エッジのサイクル**~~: `-->` （非同期）エッジのサイクルは**検出対象外**とする。async は結果整合性を狙ったリトライ等の意図的なパターンであることが多く、循環していても問題にならないケースが大半。sync（`->`）エッジのサイクルのみを検出する。
