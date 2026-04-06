# Ghost System Rendering

- **日付**: 2026-04-05
- **ステータス**: 提案中
- **関連**: [cross-system-service-references.md](cross-system-service-references.md), Issue #328

---

## 背景・課題

Issue #285 でドット記法によるクロスシステムエッジ（`OrderService -> PaymentGateway.PaymentService`）の構文を導入した。
このエッジは AST に格納されるが、`view-extract.ts` の `childIds.has(e.to)` フィルタにより描画時に除外されている。

```
// view-extract.ts — 現状
const childEdges = system.edges.filter(
  (e) => childIds.has(e.from) && childIds.has(e.to)
  // "PaymentGateway.PaymentService" は childIds に存在しないためスキップ
);
```

Issue #328 は、このクロスシステム参照を画面上に表現することを目的とする。

---

## 目標

### 描画シナリオ 1: ルートビュー（`path = []`）

複数のシステムを横並びに表示する。
- フォーカス対象のシステム（ホバー中 / アクティブ）が「主システム」として通常スタイルで描画される
- それ以外のシステムは「ゴーストシステム」として半透明で描画される
- システム間のクロスシステムエッジが矢印で結ばれる

```
┌─────────────────────────┐    ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│      ECPlatform          │          PaymentGateway (ghost)
│  ┌──────────────────┐   │    │  ┌─────────────────────────┐  │
│  │  OrderService    │───┼────┼─▶│  PaymentService          │
│  └──────────────────┘   │    │  └─────────────────────────┘  │
└─────────────────────────┘    └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

### 描画シナリオ 2: サービスビュー（`path.length === 1`）

ドリルダウンして特定サービスを表示している場合、
そのサービスがクロスシステムエッジで参照する外部システムを
**主システム境界の外側** にゴーストシステムとして表示する。

```
┌──── ECPlatform ──────────────────────────┐
│                                           │
│  ┌──────────────────────────────┐         │
│  │  ECommerce (service view)    │         │
│  │  ┌──────────┐  ┌──────────┐  │         │
│  │  │ Order    │  │ Shipping │  │         │
│  │  └──────────┘  └──────────┘  │         │
│  └──────────────────┬───────────┘         │
│                     │                     │
└─────────────────────┼─────────────────────┘
                      ▼
              ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
                  PaymentGateway (ghost)
              │  ┌────────────────────────┐ │
                 │  PaymentService        │
              │  └────────────────────────┘ │
               ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
```

---

## ViewSlice の拡張

### 現行の ViewSlice

```typescript
export interface ViewSlice {
  containerNode: KrsNode | null;
  childNodes: KrsNode[];
  childEdges: KrsEdge[];
  ancestorChain: KrsNode[];
  ghostUsers: KrsNode[];
  ghostUserEdges: KrsEdge[];
}
```

### 拡張後

```typescript
export interface GhostSystem {
  systemNode: KrsNode;        // 外部システムのコンテナノード（ラベル・スタイルに使用）
  visibleServices: KrsNode[]; // そのシステム内で参照されているサービスのみ
}

export interface ViewSlice {
  // 既存フィールド（変更なし）
  containerNode: KrsNode | null;
  childNodes: KrsNode[];
  childEdges: KrsEdge[];
  ancestorChain: KrsNode[];
  ghostUsers: KrsNode[];
  ghostUserEdges: KrsEdge[];

  // 新規フィールド
  systems: KrsNode[];             // ルートビューのみ: 並列表示する全システム
  crossSystemEdges: KrsEdge[];    // ルートビューのみ: システム間をまたぐエッジ
  ghostSystems: GhostSystem[];    // サービスビューのみ: 参照先の外部システム
  ghostSystemEdges: KrsEdge[];    // サービスビューのみ: ゴーストシステムへのエッジ
}
```

### ビューレベルごとの挙動

| ビュー | `systems` | `crossSystemEdges` | `ghostSystems` | `ghostSystemEdges` |
|--------|-----------|-------------------|----------------|-------------------|
| ルート (`path = []`) | 全システム | システム間エッジ | `[]` | `[]` |
| サービス (`path.length === 1`) | `[]` | `[]` | 参照先システム | 対応エッジ |
| ドメイン以深 (`path.length >= 2`) | `[]` | `[]` | `[]` | `[]` |

**後方互換性**: `childNodes` / `childEdges` は従来どおり `systems[0]` を対象として維持する。
`systems` フィールドを認識しないレンダラーは既存の動作を継続できる。

---

## extractView の変更

### ルートビュー (`path = []`)

```typescript
// systems: 全システムをそのまま返す
systems: systems,

// crossSystemEdges: 全システムのエッジから修飾ターゲットを持つものを収集
crossSystemEdges: systems.flatMap((sys) =>
  sys.edges.filter((e) => e.to.includes(".") && resolveSystemId(e.to, systems) !== null)
),

// childNodes / childEdges: 後方互換のため systems[0] ベースを維持
```

修飾ターゲット `PaymentGateway.PaymentService` のシステム ID 解決:
- `.` より前の部分（`PaymentGateway`）を取得
- `systems.find((s) => s.id === systemId)` で解決

### サービスビュー (`path.length === 1`)

```typescript
// containerNode = 対象サービスノード
const containerId = containerNode.id;

// システムレベルのエッジから、このサービス起点の修飾エッジを収集
const ghostSystemEdges = system.edges.filter(
  (e) => e.from === containerId && e.to.includes(".")
);

// ghost システムを構築
const ghostSystems: GhostSystem[] = buildGhostSystems(ghostSystemEdges, systems);
```

`buildGhostSystems` の処理:
1. エッジの `to` から `systemId` と `serviceId` を分解
2. `systems.find((s) => s.id === systemId)` で対象システムを探索
3. `systemNode.children.find((c) => c.id === serviceId)` で対象サービスを取得
4. 同一システムへの複数エッジは `visibleServices` にまとめる

---

## `systems[0]` 制約について

現在 `extractView` はパスの文脈システムを `systems[0]` に固定している。
複数システムが存在する場合、ドリルダウン中にどのシステムの子を見ているかが曖昧になる。

**根本的な解決策**: `path` にシステム ID を含める。

```
現状: path = ["ECommerce"]          → systems[0] の中の ECommerce
改善: path = ["ECPlatform", "ECommerce"]  → ECPlatform システムの中の ECommerce
```

ただし影響範囲が広い:
- `app/` の `viewPath` ステート管理
- VS Code 拡張のナビゲーション
- `nodePathIndex` のエントリ形式（`KrsFile.nodePathIndex`）
- LSP のシンボル解決

このため **Phase 2** として切り分け、本 Issue（Phase 1）では `systems[0]` 制約を維持しつつ
複数システムの描画に対応する。

---

## 実装フェーズ

### Phase 1（本 Issue #328）

1. `ViewSlice` に `GhostSystem` 型および新フィールドを追加
2. `extractView` のルートビュー処理を更新（`systems` / `crossSystemEdges` の生成）
3. `extractView` のサービスビュー処理を更新（`ghostSystems` / `ghostSystemEdges` の生成）
4. `layout.ts` でマルチシステム並列レイアウトを実装
5. SVG レンダラーでゴーストシステムボックスを描画
6. テストを追加

### Phase 2（将来: `path` へのシステム ID 包含）

1. `ViewPath` の先頭セグメントをシステム ID とする
2. `extractView` で `systems.find((s) => s.id === path[0])` によりシステムを特定
3. `app/` / `vscode/` / `lsp/` の呼び出し元を一斉更新

---

## 検討した代替案

### 案A: 別関数 `extractMultiSystemView` を追加

新規関数で複数システム対応を実装し、既存の `extractView` に手を加えない。
→ 却下: パス解決ロジックが重複する。呼び出し元がどちらを使うか判断する必要が生じる。

### 案B: `childNodes` にゴーストシステムを追加

ルートビューで `childNodes` に全システムを含め、`kind: "system"` で識別する。
→ 却下: レンダラーが「主システムの子」と「ゴーストシステム」を区別できなくなる。
スタイル適用・レイアウト計算の両方で不整合が生じる。

### 案C: `ghostSystems: KrsNode[]` のみ（`GhostSystem` 型なし）

`KrsNode[]` だけを保持し、サービスの検索はレンダラー側で行う。
→ 却下: レンダラーが「どのサービスを表示すべきか」を再計算する必要があり、
`extractView` の責務（ビューに何を表示するか）がレンダラーに漏れる。
