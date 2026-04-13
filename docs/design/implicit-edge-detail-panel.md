# Implicit Edge Detail Panel

- **日付**: 2026-04-13
- **ステータス**: 検討中
- **関連**: Issue #463, ADR-20260410-01 (domain-to-domain-edges-implicit-tag)

## 背景・課題

複数のクロスサービスドメインエッジが同一サービスペアに集約された場合、システムビューでは
`"N domain edges"` というラベルを持つ単一の暗黙エッジ（amber 破線）として描画される（ADR-20260410-01）。
この集約により個々のエッジのラベルや責務が見えなくなる。

ADR-20260410-01 では「クリックで各ドメインエッジの詳細を表示」と決定済みだが、PR #451 では
件数ラベルの描画までで実装を止めており、クリック処理は未着手。

## 制約・前提

- 集約エッジの構成ドメインエッジは `deriveImplicitServiceEdges()`（`view-extract.ts`）で生成時に
  情報が確定する。現在の実装では count と単一 edge 参照のみを保持し、構成エッジ一覧は破棄されている
- `PreviewPane` が受け取るのは `svg: string` と `nodeMetadata: Map<string, NodeMetadata>` のみ
- ノードクリックは SVG の `data-node-id` 属性を起点に `NodeDetailPanel` を開く既存パターンがある
- 描画は core パッケージ（`edge-routing.ts`）が行い、クリック処理は app パッケージ（`PreviewPane.tsx`）が行う

## 検討した選択肢

### 案1: SVG 属性埋め込み（採用）

集約エッジのラベル text 要素を clickable な `<g>` でラップし、
`data-domain-edges="[{...}]"` (JSON) を付与する。
`PreviewPane` はクリック時にこの属性を読み取ってパースし、`EdgeDetailPanel` を表示する。

```
edge-routing.ts で生成する SVG:
<g data-domain-edges='[{"from":"OrderDomain","fromLabel":"Order Domain","to":"PaymentDomain","toLabel":"Payment Domain","label":"decides payment"}]'
   style="cursor:pointer">
  <text ...>2 domain edges</text>
  <rect .../>  ← ヒットエリア拡大用の透明矩形
</g>
```

**メリット**:
- 変更ファイルが少ない（props チェーンの追加が不要）
- 既存の `data-node-id` → `NodeDetailPanel` と同じ SVG 属性ベースのパターンと一貫性がある
- `compileProject` の返り値を変更しないため、LSP・CLI・VSCode 拡張への影響ゼロ

**デメリット**:
- SVG にアプリケーションロジック（JSON）が混入する
- 属性値が長くなる（ドメインエッジが多い場合）

### 案2: props チェーン経由

`ViewSlice` に `implicitEdgeDetails: Map<string, DomainEdgeDetail[]>` を追加し、
`compileProject` 結果 → `useSystemView` → `AppShell` → `KarasuPreviewColumn` → `PreviewPane`
と連鎖して渡す。SVG には `data-implicit-edge-key` のみ付与。

**メリット**:
- SVG がデータを持たずクリーン
- テストで JSON をパースする必要がない

**デメリット**:
- 変更ファイルが多い（6 ファイル以上のインターフェース変更）
- `compileProject` の返り値が拡大する（LSP/CLI にも影響しうる）
- `ViewSlice` の多重返却は既存パターン（`nodeMetadata` は `buildNodeMetadata()` で別途構築）と齟齬

## 比較

| 観点 | 案1 (SVG 埋め込み) | 案2 (props チェーン) |
|---|---|---|
| 変更ファイル数 | 少 (core 3 + app 2) | 多 (core 5 + app 5 以上) |
| 既存パターンとの一貫性 | `data-node-id` と同方式 | 新しいパターン導入 |
| SVG クリーンさ | JSON が混入 | クリーン |
| テスト容易性 | JSON パースのテストが必要 | 型安全でテストしやすい |
| 将来の拡張性 | エッジ種別が増えても同方式で対応可 | 都度インターフェース拡張が必要 |

## 現時点の方針

**案1（SVG 属性埋め込み）を採用する。**

変更範囲が小さく、既存の `data-node-id` パターンと一貫しているため。
JSON ペイロードのサイズ懸念については、現実的な集約エッジは 2〜5 本程度であり問題にならない。

### 実装方針

1. **`view-extract.ts`**:
   - `DomainEdgeDetail` インターフェースを追加（`from`, `fromLabel`, `to`, `toLabel`, `label?`）
   - `deriveImplicitServiceEdges()` がドメイン ID→ラベルマップを構築し、
     各集約エッジの構成ドメインエッジ一覧 (`DomainEdgeDetail[]`) を返す
   - `ViewSlice` に `implicitEdgeDetails: Map<string, DomainEdgeDetail[]>` を追加

2. **`layout.ts`**:
   - `LayoutEdge` に `domainEdges?: DomainEdgeDetail[]` を追加
   - `childEdges` から `layoutEdges` を構築するループで、
     `viewSlice.implicitEdgeDetails` を参照して `domainEdges` を付与

3. **`edge-routing.ts`**:
   - `domainEdges` があるエッジのラベルを `<g data-domain-edges="..." style="cursor:pointer">` でラップ
   - ヒットエリアを広げる透明矩形を追加

4. **`packages/core/src/index.ts`**:
   - `DomainEdgeDetail` を export

5. **`PreviewPane.tsx`**:
   - `[data-domain-edges]` へのクリックハンドラを追加
   - JSON パース → `EdgeDetailPanel` の表示

6. **新規 `EdgeDetailPanel.tsx`**:
   - `DomainEdgeDetail[]` を受け取り「from → to "label"」形式で一覧表示
   - `NodeDetailPanel` と同様のポジション・スタイル（`node-detail-panel` CSS クラスを流用）

### EdgeDetailPanel の表示形式

```
┌─────────────────────────────────────┐
│  ↔ 2 domain edges          [×]     │
├─────────────────────────────────────┤
│  Order Domain → Payment Domain      │
│  "decides payment"                  │
│                                     │
│  Order Domain → Audit Domain        │
│  "records audit log"                │
└─────────────────────────────────────┘
```

### AT-0053 Case 3 の更新

現在の Case 3 は件数ラベル表示のみを確認している。
本実装後にチェックリストを更新して「クリックで詳細一覧が開く」の検証項目を追加する。

## 未解決の問い

なし（論点は上記で解消済み）
