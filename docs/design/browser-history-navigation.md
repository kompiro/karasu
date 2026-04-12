# ブラウザ履歴ナビゲーション — ドリルダウンへの戻るボタン対応

- **日付**: 2026-04-04
- **ステータス**: 検討中
- **関連**:
  - [Issue #278](https://github.com/kompiro/karasu/issues/278) — URL fragment navigation for drill-down SVG
  - [permanent-link.md](permanent-link.md) — URL hash による永続リンク設計（Phase 2 で URL hash 採用を決定済み）
  - [ADR-0047](../adr/0047-interactive-svg-rendering.md) — viewPath / data-node-id 仕様

## 背景・課題

アプリのドリルダウンナビゲーションは `viewPath: string[]` という React state で管理されており、
ノードクリック（掘り下げ）・パンくずクリック（戻り）いずれも `dispatch({ type: "SET_VIEW_PATH" })` だけで完結する。

この設計の問題:
- `window.history` が一切更新されない
- **ブラウザの戻る/進むボタンがドリルダウン履歴に対して機能しない**
- ページをリロードすると root に戻る（状態が保持されない）

Issue #278 は当初「CSS `:target` ベースの drill-down SVG を app preview でも動かす」を
ゴールとしていたが、現在のアプリは既に JS ベースのドリルダウン（`viewPath` 更新 + 再レンダリング）
を実装済みであり、本質的な課題は「ブラウザ履歴との同期」に集約される。

## 制約・前提

- `packages/app` は Vite + React SPA（シングルページ）
- `packages/core` は Pure TS であり、ナビゲーション状態管理は `packages/app` の責務
- ナビゲーション状態は `viewPath: string[]` + `activeView: "system" | "org" | "deploy"` の組
- `permanent-link.md` は URL hash による永続リンクを Phase 2 として採用済み
- `permanent-link.md` Phase 1 は `KrsFile.nodePathIndex: Map<string, string[]>` の追加（nodeId → viewPath の解決）
- アプリはブラウザ上（`localhost`）で動作し、VSCode extension Webview は対象外
- `drill-down-svg.ts` は CSS `:target` ナビゲーション用に `krs-{viewPrefix}-{nodeId}` 形式の要素 ID を生成済み

## 解決すべき論点

ブラウザ履歴との同期手法として次の 2 案を検討する。

### 案1: `history.pushState` — state オブジェクトのみ（URL 変更なし）

ナビゲーション時に `history.pushState({ viewPath, activeView }, "")` を呼び出し、
URL は変えずにブラウザ履歴エントリだけを追加する。
`popstate` イベントで `event.state` から状態を復元する。

```typescript
// ナビゲーション時
history.pushState({ viewPath: ["Payment", "EC"], activeView: "system" }, "");
dispatch({ type: "SET_VIEW_PATH", path: ["Payment", "EC"] });

// popstate ハンドラ
window.addEventListener("popstate", (e) => {
  const s = e.state as { viewPath: string[]; activeView: ActiveView } | null;
  if (!s) return;
  if (s.activeView !== current.activeView) {
    dispatch({ type: "SET_ACTIVE_VIEW", activeView: s.activeView });
  }
  dispatch({ type: "SET_VIEW_PATH", path: s.viewPath });
});
```

**メリット**:
- 実装コストが低い（URL パースロジック不要）
- URL が変わらないため、既存の SPA ルーティングに干渉しない
- ブラウザの戻る/進むボタンが即座に機能するようになる

**デメリット**:
- URL を見ても現在地がわからない（シェア・リロード不可）
- `permanent-link.md` の URL hash 方針と将来的に統合が必要

### 案2: URL hash — `permanent-link.md` の Phase 2 を前倒し実装

`location.hash` を更新し、ページリロード時や URL 共有でも状態が復元できるようにする。

hash 形式は `drill-down-svg.ts` が生成する CSS `:target` 用の要素 ID（`krs-system-root`、`krs-system-{nodeId}` など）をそのまま流用する。これにより：
- エクスポートした drill-down SVG の fragment と URL hash の形式が一致する
- `activeView` の判別はプレフィックス（`krs-system-` / `krs-org-` / `krs-deploy`）で行う

```
#krs-system-root        → activeView=system, viewPath=[]
#krs-system-Payment     → activeView=system, viewPath=["Payment"]
#krs-org-root           → activeView=org, viewPath=[]
#krs-org-backend        → activeView=org, viewPath=["backend"]
#krs-deploy             → activeView=deploy
```

**viewPath の回復**: `#krs-system-Payment` から `viewPath: ["Payment"]` への変換は単純だが、
深い階層（`#krs-system-EC` → `viewPath: ["Payment", "EC"]`）の回復には
**`nodePathIndex`**（`permanent-link.md` Phase 1）が必要。

```typescript
// ナビゲーション時（drill-down svg と同じ nodeId を使う）
const nodeId = sanitizeId(child.id);  // drill-down-svg.ts と同じ関数
history.pushState(null, "", `#krs-system-${nodeId}`);
dispatch({ type: "SET_VIEW_PATH", path: [...viewPath, child.id] });

// アプリ起動時（hash から viewPath を解決）
const initial = parseNavHash(location.hash, nodePathIndex);
if (initial) {
  dispatch({ type: "SET_ACTIVE_VIEW", activeView: initial.activeView });
  dispatch({ type: "SET_VIEW_PATH", path: initial.viewPath });
}

// popstate ハンドラ
window.addEventListener("popstate", () => {
  const s = parseNavHash(location.hash, nodePathIndex);
  if (!s) return;
  ...
});
```

**メリット**:
- URL を共有・ブックマークすると同じビューを開ける（永続リンク機能を兼ねる）
- リロードしても状態が保持される
- `permanent-link.md` の Phase 2 と一致し、将来の実装が不要になる
- drill-down SVG のエクスポート ID と URL hash が統一され、命名の一貫性が生まれる

**デメリット**:
- `nodePathIndex`（Phase 1）の実装が前提条件になる
- hash → viewPath 変換ロジックが必要
- ファイル切り替え時に hash を `replaceState` でリセットするロジックが必要

## 比較

| 観点 | 案1（state のみ） | 案2（URL hash） |
|---|---|---|
| 戻るボタン対応 | ◎ | ◎ |
| URL 共有・ブックマーク | ✗ | ◎ |
| リロード後の復元 | ✗ | ◎ |
| 実装コスト | 低 | 中 |
| `permanent-link.md` との整合 | △（将来の移行が必要） | ◎（Phase 2 を実現） |
| drill-down SVG ID との一致 | — | ◎（同じ形式） |
| `nodePathIndex`（Phase 1）依存 | なし | あり |
| ID に特殊文字が含まれる場合 | 不要 | `sanitizeId` で処理済み |

## 実装設計（案2 採用時）

### hook: `useHistoryNavigation`

`AppShell` で使用するカスタムフックとして実装する。

```typescript
// packages/app/src/hooks/useHistoryNavigation.ts

export function useHistoryNavigation(
  viewPath: string[],
  activeView: ActiveView,
  dispatch: Dispatch<AppAction>,
) {
  // 初期 hash の解析と状態復元
  useEffect(() => {
    const initial = parseNavHash(location.hash);
    if (initial) {
      if (initial.activeView !== activeView) {
        dispatch({ type: "SET_ACTIVE_VIEW", activeView: initial.activeView });
      }
      dispatch({ type: "SET_VIEW_PATH", path: initial.viewPath });
    } else {
      // hash がなければ現在状態で初期化
      history.replaceState(null, "", `#${encodeNavHash({ viewPath, activeView })}`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // popstate ハンドラ
  useEffect(() => {
    const handlePopState = () => {
      const s = parseNavHash(location.hash);
      if (!s) return;
      if (s.activeView !== activeView) {
        dispatch({ type: "SET_ACTIVE_VIEW", activeView: s.activeView });
      }
      dispatch({ type: "SET_VIEW_PATH", path: s.viewPath });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [dispatch, activeView]);

  // ナビゲーション用関数（dispatch の代わりに呼ぶ）
  const navigateTo = useCallback(
    (path: string[], view?: ActiveView) => {
      const nextView = view ?? activeView;
      history.pushState(null, "", `#${encodeNavHash({ viewPath: path, activeView: nextView })}`);
    },
    [activeView],
  );

  // ファイル・プロジェクト切り替え時に hash をリセット
  const resetNavigation = useCallback(() => {
    history.replaceState(null, "", "#system");
  }, []);

  return { navigateTo, resetNavigation };
}
```

### hash 形式

`drill-down-svg.ts` の要素 ID 形式をそのまま採用する。

```
#krs-system-root        → { activeView: "system", viewPath: [] }
#krs-system-Payment     → { activeView: "system", viewPath: ["Payment"] }
#krs-system-EC          → { activeView: "system", viewPath: nodePathIndex.get("EC") }
#krs-org-root           → { activeView: "org", viewPath: [] }
#krs-org-backend        → { activeView: "org", viewPath: nodePathIndex.get("backend") }
#krs-org-tree           → { activeView: "org", isOrgTreeView: true }  ← Tree View モード
#krs-deploy             → { activeView: "deploy" }
```

- `krs-{viewPrefix}-` プレフィックスで `activeView` を判別
- `root` は viewPath=[] に対応
- `tree` は Org Tree View モードを表す予約識別子
- それ以外の nodeId は `nodePathIndex` で viewPath に変換
- `sanitizeId()` は `drill-down-svg.ts` と同じ関数を使用（`@karasu/core` からエクスポート）

### Org Tree View のパーマネントリンク対応

Org Tree View モード（`isOrgTreeViewOpen: boolean`）を URL hash に反映する。

**`buildHash` の拡張**:

```typescript
export function buildHash(activeView: ActiveView, viewPath: string[], isOrgTreeView = false): string {
  if (activeView === "deploy") return "#krs-deploy";
  if (activeView === "org" && isOrgTreeView) return "#krs-org-tree";
  const prefix = activeView === "org" ? "org" : "system";
  if (viewPath.length === 0) return `#krs-${prefix}-root`;
  return `#krs-${prefix}-${sanitizeId(viewPath[viewPath.length - 1])}`;
}
```

**`parseHash` の拡張**:

```typescript
export function parseHash(hash: string): {
  activeView: ActiveView;
  nodeId: string | null;
  isOrgTreeView: boolean;
} | null {
  if (hash === "#krs-deploy") return { activeView: "deploy", nodeId: null, isOrgTreeView: false };
  if (hash === "#krs-org-tree") return { activeView: "org", nodeId: null, isOrgTreeView: true };
  const m = hash.match(/^#krs-(system|org)-(.+)$/);
  if (!m) return null;
  const activeView = m[1] as "system" | "org";
  const nodeId = m[2] === "root" ? null : m[2];
  return { activeView, nodeId, isOrgTreeView: false };
}
```

**`useHistoryNavigation` フックの拡張**:

- パラメータに `isOrgTreeView: boolean` と `setIsOrgTreeView: (v: boolean) => void` を追加
- Effect ③（state → hash 同期）で `isOrgTreeView` を依存配列に追加し `buildHash` に渡す
- Effect ①（初期 hash 解析）で `parsed.isOrgTreeView` を `setIsOrgTreeView` で反映
- Effect ⑤（popstate）で `setIsOrgTreeView(parsed.isOrgTreeView)` を呼ぶ

AppShell の `isOrgTreeViewOpen` state（`useState`）と `setIsOrgTreeViewOpen` をそのままフックに渡す。
Toggle ボタンが押されると `setIsOrgTreeViewOpen` が更新され、Effect ③ が URL を自動的に同期する。

### `AppShell` への統合箇所

| 変更箇所 | 変更内容 |
|---|---|
| `onBreadcrumbNavigate` (system/org) | `navigateTo(path)` を dispatch の前に呼ぶ |
| `handleActiveViewChange` | `navigateTo([], view)` を dispatch の前に呼ぶ |
| `SELECT_FILE` / `SET_CURRENT_PROJECT` dispatch | `resetNavigation()` を呼ぶ |

### アクセプタンステスト（手動確認）

- [ ] ノードをクリックしてドリルダウン → URL hash が変わる
- [ ] ブラウザの戻るボタンで 1 段階戻る → hash と表示が戻る
- [ ] ブラウザの進むボタンで再度掘り下げに戻る
- [ ] パンくずをクリックして戻る → hash が変わる
- [ ] 戻るを何度か押してルートに戻れる
- [ ] URL をコピーしてリロード → 同じビューが表示される
- [ ] ビュータブ（system / org）切り替え → hash に `#system` / `#org` が反映される
- [ ] ファイルを別のものに切り替え → hash が `#system` にリセットされる

## 現時点の方針

**案2（URL hash）を採用**する。理由:

1. `permanent-link.md` の Phase 2（URL hash による永続リンク）と一致しており、
   ここで実装しておけば将来的な統合作業が不要になる
2. ブラウザの戻る/進むボタンに加えてリロード・URL 共有も同時に解決できる
3. drill-down SVG のエクスポート ID（`krs-system-Payment`）と URL hash が統一され、
   「エクスポート SVG を開いて `#krs-system-Payment` を付けてブラウザで開く」操作と
   アプリ内の URL が同じ形式になる
4. 案1 は将来 URL hash に移行する際に二重の変更コストが発生する

## 実装前提条件

案2 の採用には `permanent-link.md` Phase 1 の実装が前提となる。

| フェーズ | 内容 | 担当 Issue |
|---|---|---|
| Phase 1 | `KrsFile.nodePathIndex` 追加（nodeId → viewPath） | permanent-link.md § Phase 1 |
| Phase 2 | URL hash ナビゲーション（本ドキュメント） | Issue #278 |

## 未解決の問い

なし。drill-down SVG の ID 形式（`krs-system-*` / `krs-org-*` / `krs-deploy`）を流用することで、
activeView の表現と deploy の hash 形式がいずれも決定した。
