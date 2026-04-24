---
id: ADR-20260404-07
title: VSCode プレビュー Icon Mode トグル — Extension Host 管理 + postMessage
status: accepted
date: 2026-04-04
topic: vscode
depends_on:
  - ADR-20260328-03
  - ADR-20260330-05
scope:
  packages:
    - vscode
---

# ADR-20260404-07: VSCode プレビュー Icon Mode トグル — Extension Host 管理 + postMessage

- **日付**: 2026-04-04
- **ステータス**: 決定済み
- **関連**: Issue #299, Issue #173, [ADR-20260328-03](20260328-03-icon-mode.md), [ADR-20260330-05](20260330-05-vscode-extension-lsp-first.md)

## 背景

`packages/app` のプレビューツールバーには「◇ Icon Mode」トグルが実装済みで、`ICON_THEME_STYLE_SOURCE` を注入して SVG アイコンによるノード描画に切り替えられる（ADR-20260328-03）。しかし `packages/vscode` の Webview プレビューにはこのトグルが存在せず、VSCode 拡張から Icon Mode 表示を利用できない状態だった。

## 決定

**案 A**: Webview がトグル状態を持たず、Extension Host が `_displayMode` を管理してメッセージ経由で再レンダリングする。

### 通信フロー

```
[Webview button click]
  → postMessage({ type: 'toggleIconMode' })
  → Extension Host: _displayMode 反転 → _render() → postMessage({ type: 'update', html })
  → Webview: innerHTML 更新
```

### 実装内容（`packages/vscode/src/preview-panel.ts`）

1. `_displayMode: "icon" | "shape" = "shape"` フィールドを追加
2. `onDidReceiveMessage` ハンドラに `toggleIconMode` ブランチを追加：

```ts
} else if (message.type === "toggleIconMode") {
  this._displayMode = this._displayMode === "icon" ? "shape" : "icon";
  if (this._currentDocument) void this._render(this._currentDocument);
}
```

3. `_render()` で `compileProject()` に `displayMode: this._displayMode` を渡す
4. `_buildHtml()` のツールバーに Icon Mode ボタンを追加（セパレータ右隣、`◇ Icon Mode` ラベル）。アクティブ時は System/Deploy/Org ボタンと同様の `activeStyle`
5. Webview JS にクリックハンドラを追加

トグル状態はセッション内で保持すれば十分（再起動後の永続化は今回のスコープ外）。

## 理由

- **正しい描画**: Icon Mode は単なる CSS 切り替えではなく、`compileProject({ displayMode: "icon" })` で固定サイズ（160×100）レイアウトに変える必要がある。Webview 内で CSS クラスを付け外すだけでは不完全になる
- **状態の一元管理**: `_displayMode` を Extension Host が保持することで、ファイル更新・ビュー切替など他の `_render()` 呼び出しからも一貫して正しい `displayMode` が使える
- **既存パターンとの一貫性**: System/Deploy/Org ビュー切替も同様の `postMessage → 再レンダリング → innerHTML 更新` のラウンドトリップ方式で実装されており、Icon Mode もこれに従うことでコードが均質になる
- **ボタンのアクティブスタイル**: `_buildHtml()` 内で一元的に計算でき、状態と UI が同じ場所で管理される

## 却下した案

### 案 B: Webview JS 内でトグル状態を完結させ、CSS クラスだけで切り替える

ラウンドトリップなしで即座に切り替わる利点はあるが、Icon Mode は `compileProject()` に `displayMode: "icon"` を渡してレイアウト自体を変える必要があり、Webview からは `compileProject()` を呼べないため完全な描画が実現できない。

## 残課題

- Icon Mode の状態をセッション間（VSCode 再起動後）も保持したい場合、`vscode.ExtensionContext.workspaceState` への永続化が必要になるが、今回のスコープ外
