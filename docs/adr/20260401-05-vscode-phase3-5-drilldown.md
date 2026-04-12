# ADR-0085: VSCode Phase 3.5 — Webview ドリルダウンナビゲーション

- **日付**: 2026-04-01
- **ステータス**: 決定済み
- **関連**: Issue #218, [ADR-0084](20260401-04-vscode-phase3-webview-architecture.md), [ADR-0047](20260320-01-interactive-svg-rendering.md)

## 背景

Phase 3 (ADR-0084) では `compile()` に `viewPath` を渡さないため全階層が一画面に表示されていた。`packages/app` の `PreviewPane` はドリルダウン（`viewPath` 更新 → 再レンダリング）を既に実現していたが、VSCode Webview 側には同等の仕組みがなかった。Phase 3.5 では Webview 内でノードをクリックして階層を掘り下げるドリルダウンナビゲーションを実現する。Phase 4（エディタジャンプ）とは独立して開発できる。

## 決定

### 1. 単一の `_viewPath: string[]` を保持（案2）

ビュータイプごとに独立した状態を持つのではなく、単一の `_viewPath` を保持し、`compile()` 呼び出し時にビュータイプに応じて `viewPath` または `orgPath` として渡す。ビュータイプ切替時に `_viewPath = []` にリセットする。

### 2. postMessage プロトコル

Webview → Extension Host の 2 種類のメッセージを追加：

| メッセージ型 | ペイロード | 説明 |
|---|---|---|
| `drillDown` | `{ nodeId: string }` | ノードクリックで一段掘り下げる |
| `navigateTo` | `{ index: number }` | ブレッドクラムをクリックしてその深さに戻る |

`navigateTo` の `index` は `_viewPath.slice(0, index)` の長さを指す。`index = 0` はルートへの戻りを意味する。既存の `switchView` メッセージは変更しない。

### 3. ブレッドクラム UI

ツールバーに現在の掘り下げパスを表示：

```
[System] [Deploy] [Org]  |  Root > nodeA > nodeB
```

- ルート（`_viewPath` が空）のときは「Root」のみ表示、区切り文字なし
- 各セグメントはボタンとして表示、クリックで `navigateTo` を送信
- ルートセグメント「Root」のクリックは `navigateTo({ index: 0 })` を送信

### 4. Extension Host 実装（`preview-panel.ts`）

```
_viewPath: string[]              // ノード ID の配列
_viewLabels: string[]            // 表示ラベル（_viewPath と並列）
_lastNodeMetadata: Map<string, NodeMetadata> | undefined  // 直前の compile 結果
```

フロー：

- `switchView` → `_viewType` 更新 + `_viewPath = []` / `_viewLabels = []` リセット
- `drillDown` → `label = _lastNodeMetadata?.get(nodeId)?.label ?? nodeId` → `_viewPath.push(nodeId)` / `_viewLabels.push(label)`
- `navigateTo` → `_viewPath.slice(0, index)` / `_viewLabels.slice(0, index)`
- `_render()` で `compile()` に `viewPath` / `orgPath` を渡す。`compile` 結果の `nodeMetadata` を `_lastNodeMetadata` にキャッシュ

ラベルは「掘り下げる時点の `_lastNodeMetadata` から取得できる」ことを利用するため、祖先ノードの追加 `compile()` 呼び出しは不要。

### 5. Webview 実装（インラインスクリプト）

`data-has-children="true"` のノードグループをクリック → `drillDown` を送信。ブレッドクラムボタン（`data-nav-index`）→ `navigateTo` を送信。

```js
document.querySelector('#preview').addEventListener('click', function(e) {
  const group = e.target.closest('[data-has-children="true"]');
  if (group) {
    const nodeId = group.getAttribute('data-node-id');
    if (nodeId) vscode.postMessage({ type: 'drillDown', nodeId });
  }
});
```

### 6. Deploy ビュー

`compile()` が deploy の `viewPath` に対応していないため、Phase 3.5 では Deploy ビューのドリルダウンは対象外。

## 理由

- **Acceptance Criteria との整合**: Issue #218 の「View switching resets the viewPath to root」を案2 が自然に満たす。案1（ビュータイプ別独立状態）は前の位置から再開できる利点があるが AC に反する
- **状態管理の簡潔さ**: 単一 `_viewPath` のほうが理解・デバッグしやすい
- **`_lastNodeMetadata` キャッシュ戦略**: ドリルダウン時のラベルは直前の compile 結果から取得できるため、祖先ノードの追加 compile 呼び出しが不要。履歴管理がシンプルになる
- **既存の `data-*` 属性活用**: ADR-0047 の `data-node-id` / `data-has-children` を Webview 側で `closest()` で拾うだけで済み、追加の SVG 変更が不要
- **Phase 4 との独立性**: 双方向ジャンプ（エディタ ↔ プレビュー）とは別機能として独立開発でき、Phase 4 を待たずにリリースできる

## 却下した案

### 案1: ビュータイプごとに独立した状態を保持

`_systemViewPath` / `_orgViewPath` を別々に持つ案。ビュー切替後に前の位置から再開できる利点はあるが、Issue #218 の AC に反し、状態が複数あることで管理が複雑になる。

## 残課題

- **Deploy ビューのドリルダウン**: `compile()` が deploy の `viewPath` に対応していないため Phase 3.5 では対象外。将来的に対応が必要になる可能性がある
