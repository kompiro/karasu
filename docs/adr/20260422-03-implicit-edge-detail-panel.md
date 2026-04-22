# ADR-20260422-03: 集約された暗黙エッジの詳細パネル — SVG 属性埋め込み方式

- **日付**: 2026-04-22
- **ステータス**: 決定済み
- **関連**:
  - Issue #463, PR #602 (Design Doc), PR #607 (実装)
  - ADR-20260410-01 (`20260410-01-domain-to-domain-edges-implicit-tag.md`) — 集約された暗黙サービスエッジ
  - Design Doc: `docs/design/implicit-edge-detail-panel.md`（本 ADR で削除）
  - `packages/core/src/view/view-extract.ts`
  - `packages/core/src/renderer/edge-routing.ts`
  - `packages/app/src/components/PreviewPane.tsx`
  - `packages/app/src/components/EdgeDetailPanel.tsx`（新規）

## 背景

ADR-20260410-01 により、同一サービスペアに集約されたクロスドメインエッジは `"N domain edges"` ラベルを持つ単一エッジとして描画される。ADR には「クリックで各ドメインエッジの詳細を表示する」と明記されていたが、PR #451 では件数ラベルまでで実装が止まり、クリック UX は未着手だった。個々のエッジのラベルや責務を確認する手段が存在しない。

## 決定

**SVG 属性埋め込み方式で集約エッジラベルをクリック可能にし、`EdgeDetailPanel` を開く。**

- `view-extract.ts` に `DomainEdgeDetail`（`from`, `fromLabel`, `to`, `toLabel`, `label?`）を追加し、`deriveImplicitServiceEdges()` が構成ドメインエッジ一覧を保持する（従来は count と単一 edge 参照のみ）。
- `ViewSlice` に `implicitEdgeDetails: Map<string, DomainEdgeDetail[]>` を追加、`LayoutEdge` に `domainEdges?: DomainEdgeDetail[]` を伝播。
- `edge-routing.ts` は `domainEdges` を持つエッジのラベルを `<g data-domain-edges='[...]' style="cursor:pointer">` でラップし、ヒットエリア拡大用の透明矩形を添える。
- `PreviewPane.tsx` は `[data-domain-edges]` クリック時に属性値をパースし、新設の `EdgeDetailPanel` を `NodeDetailPanel` と同じポジション・スタイルで表示する。

## 理由

- **既存パターンとの一貫性**: ノードクリックは `data-node-id` 属性を起点に `NodeDetailPanel` を開く既存パターンがある。集約エッジも同じ SVG 属性ベースのパターンに揃えることで、クリック可能要素の扱いを一本化できる。
- **変更範囲が小さい**: `compileProject` の返り値を変更しないため、LSP・CLI・VSCode 拡張に影響しない。変更は core 3 ファイル + app 2 ファイルに留まる。
- **JSON ペイロードのサイズは実用上問題ない**: 現実的な集約エッジは 2〜5 本程度で、属性値の肥大化は起きない。
- **props チェーン拡張は本質的でない**: `ViewSlice` 経由で詳細を props に流す案は SVG が「純粋な描画成果物」になって綺麗だが、`compileProject` 返り値を肥大化させ LSP/CLI にも波及する。本機能は描画成果物への装飾で自然に表現できる。

## 却下した案

### 案 2: `ViewSlice` 拡張 + props チェーン経由でアプリに渡す

型安全でテストしやすい反面、`compileProject` 返り値拡張が LSP/CLI にも波及する。変更ファイル数が倍増（core 5 + app 5 以上）し、既存の `nodeMetadata` パターン（別経路で構築）とも整合しない。

## 実装への影響

1. `packages/core/src/view/view-extract.ts` — `DomainEdgeDetail` 追加、`deriveImplicitServiceEdges()` 拡張。
2. `packages/core/src/renderer/layout.ts` — `LayoutEdge.domainEdges` 伝播。
3. `packages/core/src/renderer/edge-routing.ts` — クリック可能 `<g>` でラップ、ヒットエリア矩形追加。
4. `packages/core/src/index.ts` — `DomainEdgeDetail` を export。
5. `packages/app/src/components/PreviewPane.tsx` — クリックハンドラ追加。
6. `packages/app/src/components/EdgeDetailPanel.tsx` — 新規（「from → to "label"」形式のリスト表示）。
7. AT-0053 Case 3 — 「クリックで詳細一覧が開く」の検証項目を追加。
