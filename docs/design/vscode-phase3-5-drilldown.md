# VSCode Phase 3.5 — Webview ドリルダウンナビゲーション

- **日付**: 2026-04-01
- **ステータス**: 決定済み
- **関連**:
  - [vscode-phase3-webview-architecture.md](vscode-phase3-webview-architecture.md) — Phase 3 Webview 設計
  - [ADR-0047](../adr/0047-interactive-svg-rendering.md) — data-node-id / data-has-children 仕様
  - [node-click-ux.md](node-click-ux.md) — クリック UX（ドリルダウン vs エディタジャンプ）
  - Issue #218

## 背景・課題

Phase 3 では `compile()` に `viewPath` を渡さないため全階層が一画面に表示される。
`packages/app` の `PreviewPane` はドリルダウン（`viewPath` 更新 → 再レンダリング）を
既に実現しているが、VSCode Webview 側には同等の仕組みがなかった。

Phase 3.5 では、Webview 内でノードをクリックすることで階層を掘り下げていく
ドリルダウンナビゲーションを実現する。
Phase 4（エディタジャンプ）とは独立して開発できる。

## 制約・前提

- SVG ノードには `data-node-id`・`data-has-children` 属性が付与済み（`@karasu/core`）
- `compile()` は `viewPath?: ViewPath`（string[]）、`orgPath?: OrgViewPath`（string[]）を受け付ける
- Deploy ビューには `viewPath` による階層ナビゲーションは存在しない
- Extension Host と Webview の通信は `postMessage` のみ
- Phase 3 の HTML Webview（静的 HTML + インラインスクリプト）構成を維持する

## 検討した選択肢

### 案1: ビュータイプごとに独立した状態を保持

```ts
private _systemViewPath: string[] = [];
private _orgViewPath: string[] = [];
```

ビュータイプを切り替えても各ビューの掘り下げ位置が保持される。

**メリット：**
- ビュー切り替え後に戻ってきたとき、前の位置から再開できる

**デメリット：**
- Issue #218 の Acceptance Criteria「View switching resets the viewPath to root」に反する
- 状態が複数あることで管理が複雑になる

### 案2: 単一の `_viewPath: string[]` を保持（採用）

```ts
private _viewPath: string[] = [];
```

`compile()` 呼び出し時にビュータイプに応じて `viewPath` または `orgPath` として渡す。
ビュータイプ切り替え時に `_viewPath = []` にリセットする。

**メリット：**
- Acceptance Criteria を自然に満たす
- 状態がシンプルで管理しやすい

**デメリット：**
- ビュー切り替えで掘り下げ位置がリセットされる（仕様として意図的）

## postMessage プロトコル

Webview → Extension Host の2種類のメッセージを追加する。

| メッセージ型 | ペイロード | 説明 |
|---|---|---|
| `drillDown` | `{ nodeId: string }` | ノードクリックで一段掘り下げる |
| `navigateTo` | `{ index: number }` | ブレッドクラムのセグメントをクリックしてその深さに戻る |

`navigateTo` の `index` は `_viewPath.slice(0, index)` の長さを指す。
`index = 0` はルートへの戻りを意味する。

既存の `switchView` メッセージは変更しない。

## ブレッドクラム UI

ツールバーに現在の掘り下げパスを表示する。

```
[System] [Deploy] [Org]  |  Root > nodeA > nodeB
```

- ルート（`_viewPath` が空）のときは「Root」のみ、区切り文字は表示しない
- 各セグメントはボタンとして表示し、クリックすると `navigateTo` を送信する
- ルートセグメント（「Root」）のクリックは `navigateTo({ index: 0 })` を送信する

## 実装方針

### Extension Host 側（`preview-panel.ts`）

```
_viewPath: string[]  を追加（ノード ID の配列）
_viewLabels: string[] を追加（表示ラベルの配列、_viewPath と並列）
_lastNodeMetadata: Map<string, NodeMetadata> | undefined を追加（直前の compile 結果）
  ↓
switchView → _viewType 更新 + _viewPath = [] / _viewLabels = [] にリセット
drillDown  → label = _lastNodeMetadata?.get(nodeId)?.label ?? nodeId
             _viewPath = [..._viewPath, nodeId]
             _viewLabels = [..._viewLabels, label]
navigateTo → _viewPath = _viewPath.slice(0, index)
             _viewLabels = _viewLabels.slice(0, index)
  ↓
_render() で compile() に viewPath / orgPath を渡す
  _viewType === "system" → { viewPath: this._viewPath }
  _viewType === "org"    → { orgPath: this._viewPath }
  _viewType === "deploy" → viewPath なし（変化なし）
  compile 結果の nodeMetadata を _lastNodeMetadata にキャッシュ
  ↓
_buildHtml() に _viewLabels を渡してブレッドクラムを生成
```

ラベルは「掘り下げる時点の `_lastNodeMetadata` から取得できる」ことを利用する。
祖先ノードはすでに `_viewLabels` に保存済みのため、追加の `compile()` 呼び出しは不要。

### Webview 側（インラインスクリプト）

```js
// data-has-children="true" のノードグループをクリック → drillDown
document.querySelector('#preview').addEventListener('click', function(e) {
  const group = e.target.closest('[data-has-children="true"]');
  if (group) {
    const nodeId = group.getAttribute('data-node-id');
    if (nodeId) vscode.postMessage({ type: 'drillDown', nodeId });
  }
});

// ブレッドクラムボタン → navigateTo
document.querySelectorAll('[data-nav-index]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    vscode.postMessage({ type: 'navigateTo', index: Number(btn.dataset.navIndex) });
  });
});
```

## 未解決の問い

- **Deploy ビューのドリルダウン**: `compile()` が deploy の `viewPath` に対応していないため
  Phase 3.5 では対象外。将来的に対応が必要になる可能性がある。
