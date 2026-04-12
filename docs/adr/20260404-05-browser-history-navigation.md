# ADR-20260404-05: ブラウザ履歴ナビゲーション — URL hash による drill-down 同期

- **日付**: 2026-04-04
- **ステータス**: 決定済み
- **関連**: Issue #278, [ADR-20260330-04](20260330-04-permanent-link.md)

## 背景

アプリのドリルダウンナビゲーションは `viewPath: string[]` という React state だけで管理され、`window.history` が一切更新されていなかった。そのためブラウザの戻る/進むボタンがドリルダウン履歴に対して機能せず、ページをリロードすると root に戻るという課題があった。Issue #278 は当初「CSS `:target` ベースの drill-down SVG を app preview でも動かす」をゴールとしていたが、現在のアプリは既に JS ベースのドリルダウン（`viewPath` 更新 + 再レンダリング）を実装済みであり、本質的な課題は「ブラウザ履歴との同期」に集約された。

## 決定

URL hash にナビゲーション状態を同期する方式（案2）を採用する。hash 形式は `drill-down-svg.ts` が生成する CSS `:target` 用の要素 ID をそのまま流用する：

```
#krs-system-root       → activeView=system, viewPath=[]
#krs-system-Payment    → activeView=system, viewPath=["Payment"]
#krs-system-EC         → activeView=system, viewPath=nodePathIndex.get("EC")
#krs-org-root          → activeView=org, viewPath=[]
#krs-org-tree          → activeView=org, isOrgTreeView=true
#krs-deploy            → activeView=deploy
```

`useHistoryNavigation` フックを `AppShell` で使用し、以下を担う：

1. **初期化**: hash を解析して `SET_ACTIVE_VIEW` / `SET_VIEW_PATH` を dispatch、hash がなければ `replaceState` で現在状態を書き込み
2. **state → hash 同期**: `viewPath` / `activeView` / `isOrgTreeView` が変わるたびに `pushState` で hash を更新
3. **popstate**: hash を解析して state を同期
4. **ファイル/プロジェクト切替時**: `resetNavigation()` で hash を初期状態にリセット

深い階層の回復（例: `#krs-system-EC` → `viewPath: ["Payment", "EC"]`）には `KrsFile.nodePathIndex`（ADR-20260330-04 Phase 1）を使う。

## 理由

- **リロード・URL 共有に対応**: `permanent-link.md`（ADR-20260330-04 Phase 2）の URL hash 方針と一致し、ここで実装しておけば将来的な統合作業が不要
- **drill-down SVG ID との統一**: エクスポート SVG の fragment ID と URL hash が同じ形式になり、「SVG を開いて `#krs-system-Payment` を付けてブラウザで開く」操作と一致する
- **`nodePathIndex` で深い階層の復元が可能**: hash には末尾 nodeId のみ入れるだけで、`KrsFile.nodePathIndex` が `viewPath` を逆引きできる
- **戻る/進む + リロード + 共有を同時解決**: 案1 (`pushState` with state only) ではリロード復元・URL 共有ができない
- **sanitizeId の共通化**: `drill-down-svg.ts` の `sanitizeId()` を再利用するため、nodeId に特殊文字が含まれる場合も統一的に処理できる

## 却下した案

### 案1: `history.pushState` — state オブジェクトのみ（URL 変更なし）

`history.pushState({ viewPath, activeView }, "")` で履歴エントリだけ追加する案。実装コストは低いが URL を見ても現在地がわからず、リロード・共有ができない。将来 URL hash 方針に移行する際に二重の変更コストが発生する。

### Org Tree View モードの hash 形式

`#krs-org-tree` を予約識別子として追加し、`buildHash` / `parseHash` を拡張する。`useHistoryNavigation` は `isOrgTreeView` / `setIsOrgTreeView` を追加で受け取る。
