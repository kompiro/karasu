---
id: ADR-20260413-03
title: DetailPanel は常に1つだけ表示する
status: accepted
date: 2026-04-13
topic: app-ui
related_to:
  - ADR-20260422-03
scope:
  packages:
    - app
  domains:
    - ui
---

# ADR-20260413-03: DetailPanel は常に1つだけ表示する

- **日付**: 2026-04-13
- **ステータス**: 決定済み
- **関連**:
  - Issue #463
  - PR #607
  - `packages/app/src/components/PreviewPane.tsx`

## 背景

`PreviewPane` はノードをクリックすると `NodeDetailPanel`、集約された暗黙エッジ
（`"N domain edges"`）をクリックすると `EdgeDetailPanel` を表示する。

PR #607 の初期実装では `detailPanel` と `edgeDetailPanel` という2つの独立した
`useState` でそれぞれのパネルを管理していた。この構成には構造的な問題があった。

- ノードクリックのパス（`openDetailPanel` 関数）が `edgeDetailPanel` を閉じないため、
  EdgeDetailPanel を開いた後にノードをクリックすると両方のパネルが同時に表示される。
- 逆方向は手動で `setDetailPanel(null)` を呼んでいたため、非対称な実装になっていた。
- 将来パネルの種類が増えるたびに、「他パネルを閉じる処理」を全コードパスに追加し
  続けなければならないという負債を生む。

## 決定

**`PreviewPane` 内の詳細パネル表示状態を単一の discriminated union で管理する。**

```typescript
type DetailPanelState =
  | { kind: "node"; nodeId: string; anchorX: number; anchorY: number }
  | { kind: "edge"; domainEdges: DomainEdgeDetail[]; anchorX: number; anchorY: number };

const [detailPanel, setDetailPanel] = useState<DetailPanelState | null>(null);
```

どの種類のパネルを開く場合も `setDetailPanel({ kind: "...", ... })` を呼ぶ。
これにより、新しいパネルを開くと React の state 更新で前のパネルが自動的に
置き換えられ、**同時に2枚以上のパネルを表示することが構造的に不可能になる**。

閉じる操作は `setDetailPanel(null)` 1つのみ。種類に依らず共通。

## 理由

- **バグを構造で防ぐ**: 「他パネルを閉じるコードを書き忘れる」というミスが
  起こり得ない設計にする。状態は1つであり、新しい状態が古い状態を上書きする。
- **拡張性**: 新しいパネル種別（例: 将来の `InfraDetailPanel` など）を追加する場合も
  union に variant を追加するだけでよく、クローズ処理は変更不要。
- **アンカー計算の共通化**: `calcAnchor(target: Element)` ヘルパーを抽出することで、
  すべての DetailPanel 種別が同じポジション計算ロジックを共有する。

## 却下した案

### 案A: `openDetailPanel` に他パネルを閉じる処理を追加

```typescript
const openDetailPanel = (nodeId, target) => {
  setEdgeDetailPanel(null); // ← 手動で閉じる
  setDetailPanel({ nodeId, ... });
};
```

問題: クリックパスが増えるたびに「閉じる呼び出し」を追加しなければならない。
関心事が分散し、漏れが生じやすい。根本的な解決にならない。

### 案B: 各パネルコンポーネントの `useEffect` で他パネルを閉じる

パネル側がマウント時に外部 callback を呼んで他パネルを閉じる。

問題: パネルコンポーネントが `PreviewPane` の内部状態に依存するため、
コンポーネントの責務が拡散する。テストが複雑になる。

## 実装上のルール

1. `PreviewPane` に新しいパネル種別を追加する場合は `DetailPanelState` の
   union に variant を追加し、専用の `useState` を追加してはならない。
2. パネルを開く処理は必ず `setDetailPanel({ kind: "...", ... })` で行う。
   `setDetailPanel(null)` を先に呼ぶ必要はない（state が上書きされるため）。
3. パネルを閉じる処理は常に `setDetailPanel(null)` で行う。
4. アンカー位置の計算は `calcAnchor(target)` を経由する（重複実装禁止）。
