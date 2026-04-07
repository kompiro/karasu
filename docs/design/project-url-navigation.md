# プロジェクト識別子の URL エンコード — ProjectMode ナビゲーション

- **日付**: 2026-04-05
- **ステータス**: 検討中
- **関連**:
  - [Issue #321](https://github.com/kompiro/karasu/issues/321) — Add project identity to URL for ProjectMode navigation
  - [browser-history-navigation.md](browser-history-navigation.md) — URL hash によるドリルダウン履歴（Phase 2 実装済み）
  - [permanent-link.md](permanent-link.md) — URL hash による永続リンク設計

## 背景・課題

`browser-history-navigation.md`（Issue #278）で、プロジェクト内のドリルダウンナビゲーション（`viewPath`・`activeView`）を URL hash に同期する実装を完了した。

しかし **ProjectMode では「どのプロジェクトを開いているか」が URL に反映されない**。

- プロジェクト切り替えは React state の更新のみで `window.history` は一切変更されない
- ブラウザの戻る/進むボタンはプロジェクト切り替えをまたいで機能しない
- 特定プロジェクト＋特定ビューへのパーマネントリンクが作れない

現状の復元ロジック:
```
localStorage["karasu-last-project-id"] → 最後に開いたプロジェクトの ID
```

これはリロード時の復元には機能するが、URL 共有・ブラウザ履歴との連携には対応していない。

## 制約・前提

- `packages/app` は Vite + React SPA（ルーティングライブラリ未使用）
- `ProjectModeApp` がプロジェクト一覧・現在のプロジェクト state を管理する
- プロジェクトは OPFS から非同期で読み込まれる（初期化に時間がかかる）
- `AppShell` 内の `useHistoryNavigation` が `#krs-*` hash ナビゲーションを担当する
- `Project.id` は UUID 文字列で、安定した識別子として利用できる
- ServeMode（単一ファイル）は対象外

## 検討した選択肢

### 案1: クエリパラメータ — `?project=<uuid>`

ナビゲーション時に `history.pushState` で `?project=<uuid>` を追加する。
hash との組み合わせ例: `?project=abc123#krs-system-Payment`

プロジェクト切り替え時:
```typescript
history.pushState(null, "", `?project=${project.id}${location.hash}`);
dispatch({ type: "SET_CURRENT_PROJECT", project });
```

初期化時:
```typescript
const urlProjectId = new URLSearchParams(location.search).get("project");
// OPFS から projectList を取得後:
const target = projectList.find(p => p.id === urlProjectId)
  ?? projectList.find(p => p.id === lastId)  // localStorage フォールバック
  ?? projectList[0];
dispatch({ type: "SET_CURRENT_PROJECT", project: target });
// URL を正規化
history.replaceState(null, "", `?project=${target.id}${location.hash}`);
```

`popstate` ハンドラ（プロジェクト横断の戻る/進む）:
```typescript
window.addEventListener("popstate", () => {
  const id = new URLSearchParams(location.search).get("project");
  if (id && id !== currentProject?.id) {
    const project = projects.find(p => p.id === id);
    if (project) dispatch({ type: "SET_CURRENT_PROJECT", project });
  }
});
```

**メリット**:
- 実装コストが低い（ルーティングライブラリ不要）
- 既存の `#krs-*` hash ナビゲーションとは干渉しない
- `?mode=memory` の既存パターンと一致する

**デメリット**:
- URL が `?project=<long-uuid>` となりやや読みにくい
- UUID が変わると既存の共有 URL が無効になる（UUID は安定しているはずなので許容範囲）

---

### 案2: パスネーム — `/project/<uuid>/`

React Router または手動の `history.pushState` でパスを変える。

```
/                         → プロジェクト未選択
/project/abc123/          → プロジェクト abc123
/project/abc123/#krs-system-Payment
```

**メリット**:
- URL が REST 的で意味が明確

**デメリット**:
- Vite SPA は `index.html` を返す設定が必要（`history` fallback）
- `karasu serve` の静的サーバーに設定追加が必要
- React Router の導入、またはすべてのリンク・ナビゲーションの書き換えが必要
- 実装コストが大幅に増加し、既存の hash ナビゲーションとの統合が複雑になる

---

### 案3: hash の先頭にプロジェクト識別子を含める

`#project-<uuid>/krs-system-Payment` のように hash 全体でプロジェクト＋ビューを表す。

**デメリット**:
- `useHistoryNavigation` の hash 解析ロジック（`#krs-*` 形式）を大幅に変更する必要がある
- 既存の hash パターンとの後方互換性が崩れる
- `popstate` で hash が変わっても `projectId` が変わっただけか `viewPath` が変わっただけかを区別しにくい

---

## 比較

| 観点 | 案1（クエリパラメータ） | 案2（パスネーム） | 案3（hash 統合） |
|---|---|---|---|
| 実装コスト | 低 | 高 | 中 |
| URL の可読性 | △（UUID が長い） | ◎ | △ |
| 既存 hash ナビゲーションとの干渉 | なし | なし | あり（変更必要） |
| ルーター不要 | ◎ | ✗ | ◎ |
| 静的サーバー設定変更 | 不要 | 必要 | 不要 |
| ServeMode との分離 | 明確 | 明確 | 明確 |

## 現時点の方針

**案1（クエリパラメータ）を採用**する。理由:

1. 既存の hash ナビゲーションに干渉せず、関心事が分離できる
2. `?mode=memory` の既存パターンと一貫性がある
3. ルーティングライブラリや静的サーバー設定の変更が不要
4. `popstate` の責務を「hash → AppShell 内」と「query → ProjectModeApp」で分離できる

## 実装設計

### hook: `useProjectNavigation`

`ProjectModeApp` で使用するカスタムフック。

```typescript
// packages/app/src/hooks/useProjectNavigation.ts

export function useProjectNavigation(
  projects: Project[],
  currentProject: Project | null,
  dispatch: Dispatch<AppAction>,
) {
  // 初期化: URL の ?project= からプロジェクトを復元
  // ※ projects が確定した後に呼ばれることを前提とする（useEffect の deps に projects）
  const initialized = useRef(false);
  useEffect(() => {
    if (projects.length === 0 || initialized.current) return;
    initialized.current = true;

    const urlId = new URLSearchParams(location.search).get("project");
    const lastId = localStorage.getItem(LAST_PROJECT_KEY);
    const target =
      projects.find((p) => p.id === urlId) ??
      projects.find((p) => p.id === lastId) ??
      projects[0];

    dispatch({ type: "SET_CURRENT_PROJECT", project: target });
    // URL を正規化（hash は保持）
    history.replaceState(null, "", `?project=${target.id}${location.hash}`);
  }, [projects, dispatch]);

  // プロジェクト切り替え時: URL を更新
  const navigateToProject = useCallback(
    (project: Project) => {
      history.pushState(null, "", `?project=${project.id}${location.hash}`);
      dispatch({ type: "SET_CURRENT_PROJECT", project });
    },
    [dispatch],
  );

  // popstate: URL が変わったら project を同期
  useEffect(() => {
    const handlePopState = () => {
      const id = new URLSearchParams(location.search).get("project");
      if (id && id !== currentProject?.id) {
        const project = projects.find((p) => p.id === id);
        if (project) dispatch({ type: "SET_CURRENT_PROJECT", project });
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [projects, currentProject, dispatch]);

  return { navigateToProject };
}
```

### `ProjectModeApp` への統合

| 変更箇所 | 変更内容 |
|---|---|
| 初期化 `useEffect`（プロジェクト復元） | `useProjectNavigation` に委譲（localStorage フォールバック含む） |
| `handleSelectProject` | `dispatch` 直接呼び出しから `navigateToProject` に変更 |
| 新規プロジェクト作成後の `SET_CURRENT_PROJECT` | `navigateToProject` に変更 |

`useHistoryNavigation`（AppShell 内）は変更不要。
`popstate` 内で `currentProject` が変わると AppShell が再マウントされ、
`useHistoryNavigation` の初期化 Effect が再実行されて hash が正規化される。

### 初期化フロー（競合条件の回避）

OPFS からの `listProjects()` は非同期で完了するため、
`useProjectNavigation` は `projects.length > 0` になるまで URL 解析を行わない。
`initialized` ref により二重実行を防ぐ。

```
1. ProjectModeApp マウント
2. pm.listProjects() 完了 → dispatch SET_PROJECTS
3. useProjectNavigation の Effect が projects を受け取る
4. ?project= を解析して SET_CURRENT_PROJECT
5. history.replaceState で URL 正規化
```

### localStorage との共存

`ProjectModeApp` の既存 Effect（`currentProject` 変化時に localStorage に保存）はそのまま維持する。
`useProjectNavigation` 内の初期化では localStorage を「URL になければフォールバック」として参照する。

## 未解決の問い

- プロジェクトが削除された場合、その URL を開いたときにどう案内するか
  （現状: `projects[0]` にフォールバック。ユーザー通知は今回スコープ外）
- `navigateToProject` 呼び出し時に hash もリセットすべきか
  （プロジェクトが違えば同じ nodeId は存在しないが、hash 解析が失敗するだけで害はない）
