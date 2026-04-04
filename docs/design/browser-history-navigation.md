# ブラウザ履歴ナビゲーション — ドリルダウンへの戻るボタン対応

- **日付**: 2026-04-04
- **ステータス**: 検討中
- **関連**:
  - [Issue #278](https://github.com/kompiro/karasu/issues/278) — URL fragment navigation for drill-down SVG
  - [permanent-link.md](permanent-link.md) — URL hash による永続リンク設計（Phase 2 で URL hash 採用を決定済み）
  - [interactive-svg-rendering.md](interactive-svg-rendering.md) — viewPath / data-node-id 仕様

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
- `permanent-link.md` は URL hash（`#system/ServiceA`）による永続リンクを Phase 2 として採用済み
- アプリはブラウザ上（`localhost`）で動作し、VSCode extension Webview は対象外

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

`location.hash` を `#system/Payment/EC` の形式で更新し、
ページリロード時や URL 共有でも状態が復元できるようにする。

```
#system              → activeView=system, viewPath=[]
#system/Payment/EC   → activeView=system, viewPath=["Payment","EC"]
#org/backend         → activeView=org, viewPath=["backend"]
#deploy              → activeView=deploy
```

ナビゲーション時:

```typescript
// ナビゲーション時
const hash = encodeNavHash({ viewPath: ["Payment", "EC"], activeView: "system" });
history.pushState(null, "", `#${hash}`);
dispatch({ type: "SET_VIEW_PATH", path: ["Payment", "EC"] });

// アプリ起動時
const initial = parseNavHash(location.hash);
if (initial) {
  dispatch({ type: "SET_ACTIVE_VIEW", activeView: initial.activeView });
  dispatch({ type: "SET_VIEW_PATH", path: initial.viewPath });
}

// popstate ハンドラ
window.addEventListener("popstate", () => {
  const s = parseNavHash(location.hash);
  if (!s) return;
  ...
});
```

**メリット**:
- URL を共有・ブックマークすると同じビューを開ける（永続リンク機能を兼ねる）
- リロードしても状態が保持される
- `permanent-link.md` の Phase 2 と一致し、将来の実装が不要になる

**デメリット**:
- hash エンコード・デコード関数の実装が必要
- 特殊文字（日本語 ID など）のエンコードを考慮する必要がある
- ファイル切り替え時に hash を `replaceState` でリセットするロジックが必要

## 比較

| 観点 | 案1（state のみ） | 案2（URL hash） |
|---|---|---|
| 戻るボタン対応 | ◎ | ◎ |
| URL 共有・ブックマーク | ✗ | ◎ |
| リロード後の復元 | ✗ | ◎ |
| 実装コスト | 低 | 中 |
| `permanent-link.md` との整合 | △（将来の移行が必要） | ◎（Phase 2 を実現） |
| ID に特殊文字が含まれる場合 | 不要 | エンコード必要 |

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

```
#system              → { activeView: "system", viewPath: [] }
#system/ServiceA     → { activeView: "system", viewPath: ["ServiceA"] }
#org                 → { activeView: "org", viewPath: [] }
#org/backend/team1   → { activeView: "org", viewPath: ["backend", "team1"] }
#deploy              → { activeView: "deploy", viewPath: [] }
```

- セグメント区切りは `/`
- 各セグメントは `encodeURIComponent` でエンコード
- `#deploy` は viewPath を持たない

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
3. 案1 は将来 URL hash に移行する際に二重の変更コストが発生する

## 未解決の問い

- **deploy ビューの hash**: deploy ビューは `selectedDeployBlockId` も状態として持つ。
  `#deploy` だけで十分か、`#deploy/production` のように block ID を含めるべきか
- **`activeView` の省略**: `#ServiceA` のようにビュータイプを省略して system と仮定する短縮形を
  許容するか（共有リンクの見栄えの問題）
