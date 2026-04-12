# VSCode プレビュー — Icon Mode トグル

- **日付**: 2026-04-04
- **ステータス**: 検討中
- **関連**:
  - [ADR-0041](../adr/0041-icon-mode.md) — アイコンモード設計
  - [VSCode 拡張設計](vscode-extension.md)
  - [Issue #299](https://github.com/kompiro/karasu/issues/299)
  - [Issue #173](https://github.com/kompiro/karasu/issues/173)

## 背景・課題

`packages/app` のプレビューツールバーには「◇ Icon Mode」トグルが実装済みであり、
アイコンテーマ CSS（`ICON_THEME_STYLE_SOURCE`）を注入して SVG アイコンによるノード描画に切り替えられる。

`packages/vscode` の Webview プレビューにはこのトグルが存在せず、
VSCode 拡張から Icon Mode 表示を利用できない状態になっている。

## 制約・前提

- Webview は Extension Host とは別のサンドボックスで動作し、通信は `postMessage` / `onDidReceiveMessage` に限られる
- `compileProject()` の `displayMode` オプションは Extension Host 側で渡す（Webview 内では core を直接呼ばない）
- トグル状態はセッション内で保持すれば十分（永続化は不要）
- ツールバーボタンはアイコン + テキストラベル必須（プロジェクトの UI ルール）

## 検討した選択肢

### 案 A: Webview 側で `displayMode` を管理し、再レンダリング要求を Extension Host に送る

Webview JS がトグル状態を持ち、ボタンクリック時に Extension Host へ
`{ type: 'toggleIconMode' }` を postMessage する。
Extension Host はメッセージを受け取って `_displayMode` を反転 → 再レンダリング。

```
[Webview button click]
  → postMessage({ type: 'toggleIconMode' })
  → Extension Host: _displayMode 反転 → _render() → postMessage({ type: 'update', html })
  → Webview: innerHTML 更新
```

**メリット:**
- `_displayMode` の正規の状態を Extension Host が持つため、`_render()` の呼び出し元（ファイル更新、ビュー切替等）が全て一貫して正しい `displayMode` を使える
- ボタンのアクティブスタイルは `_buildHtml()` 内で一元的に計算できる

**デメリット:**
- ボタンクリック → 再レンダリング → HTML 全体の再構築というラウンドトリップが発生する
- 既存の System/Deploy/Org 切り替えも同様の方式であり、一貫性はある

### 案 B: Webview JS 内でトグル状態を完結させ、CSS クラスの付け外しのみで切り替える

Webview JS が SVG に直接スタイルを注入する。Extension Host への通信なし。

**メリット:**
- ラウンドトリップなし、即座に切り替わる

**デメリット:**
- アイコンモードは単なる CSS 切り替えではなく、`compileProject()` に `displayMode: "icon"` を渡してレイアウト自体（固定サイズ 160×100 等）を変える必要がある
- Webview からは `compileProject()` を呼べないため、この案では Icon Mode の完全な描画が実現できない

## 比較

| 観点 | 案 A | 案 B |
|---|---|---|
| 正しい描画（固定サイズレイアウト） | ✓ | ✗（CSS だけでは不完全） |
| ラウンドトリップ | あり（既存と同様） | なし |
| 状態の一元管理 | Extension Host に集約 | Webview と Host で分散 |
| 実装の複雑さ | 低（既存パターンの踏襲） | 中（SVG への直接操作が必要） |

## 確定した方針

**案 A を採用する。**

アイコンモードは `compileProject({ displayMode: "icon" })` で初めて正しく動作するため、
Extension Host が `_displayMode` を保持して再レンダリングする方式が唯一正しい実装となる。

### 変更内容（`packages/vscode/src/preview-panel.ts`）

1. `_displayMode: "icon" | "shape" = "shape"` フィールドを追加
2. `onDidReceiveMessage` ハンドラに `toggleIconMode` ブランチを追加:
   ```ts
   } else if (message.type === "toggleIconMode") {
     this._displayMode = this._displayMode === "icon" ? "shape" : "icon";
     if (this._currentDocument) void this._render(this._currentDocument);
   }
   ```
3. `_render()` で `compileProject()` に `displayMode: this._displayMode` を追加
4. `_buildHtml()` のツールバーに Icon Mode ボタンを追加（セパレータ右隣）:
   - アクティブ時: System/Deploy/Org ボタンと同様の `activeStyle`
   - テキスト: `◇ Icon Mode`
5. webview JS にクリックハンドラを追加

## 未解決の問い

- Icon Mode の状態をセッション間（VSCode 再起動後）も保持したい場合、`vscode.ExtensionContext.workspaceState` への永続化が必要になるが、今回のスコープからは外す
