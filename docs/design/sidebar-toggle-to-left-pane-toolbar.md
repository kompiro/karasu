# sidebar-toggle の サイドバーエリアへの移動と EditArea の導入

- **日付**: 2026-04-11
- **ステータス**: 完了
- **関連**:
  - [Issue #465](https://github.com/kompiro/karasu/issues/465)
  - [Issue #455 — LeftPaneToolbar 導入](https://github.com/kompiro/karasu/issues/455)
  - [left-pane-toolbar.md](./left-pane-toolbar.md) — LeftPaneToolbar 設計の前提

## 背景・課題

PR #457 で `LeftPaneToolbar` が導入され、エディタタブのアクションボタン（Format）を専用ツールバーに集約する設計が確立した。
しかし、サイドバー（ファイルツリー）の開閉を制御する `sidebar-toggle` ボタンは未だ `AppShell` に残っている。

```tsx
// AppShell.tsx — 現状
{sidebarContent && !previewFocused && (
  <button
    className="sidebar-toggle"
    onClick={() => setSidebarCollapsed((v) => !v)}
    aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
  >
    {sidebarCollapsed ? "» Expand" : "« Collapse"}
  </button>
)}
```

この構造には 2 つの問題がある。

1. **責務の不一致**: `sidebar-toggle` はサイドバーエリアの開閉制御であり、`AppShell` の関心ではない。
2. **絶対配置による脆弱性**: 現在のボタンは `.app-shell.has-sidebar` 内で絶対配置（`left: var(--sidebar-w)`）されており、グリッドレイアウトの変更に弱い。

加えて、将来 AST を表示する OutlineView をサイドバーに追加する可能性を考慮すると、
サイドバーが自分自身の開閉を制御する構造にしておくことが将来の拡張にも有利である。

## 現状のレイアウト構造

```
AppShell (CSS Grid: topbar-h 1fr auto / sidebar-w 1fr 1fr)
├── [Row 1, col 1/-1] ProjectSelector（全幅トップバー）
├── [Row 2, col 1]    FileTree（サイドバーコンテンツ）
├── [Row 2, col 2]    LeftPane（エディタ・チャット・設定タブ）
├── [Row 2, col 3]    KarasuPreviewColumn
└── [Row 3, col 1/-1] Warning panel
```

`sidebar-toggle` は `.app-shell.has-sidebar` に対して `position: absolute; left: var(--sidebar-w)` で配置されており、グリッドフローの外にある。

## 制約・前提

- ツールバーボタンは icon + text label 必須（ADR 0007、`app-ui.md`）
- `ProjectSelector`（`sidebarHeaderContent`）は全幅トップバー（row 1）として AppShell に残す。EditArea の管理対象外とする
- `previewFocused` は `AppShell` が管理し、`EditArea` へ props として渡す
- 将来の OutlineView は FileTree と同じサイドバーエリア内でタブ切り替えする設計を想定する

## 検討した選択肢

---

### 論点 A: 命名 — `LeftPane` のままにするか改名するか

現在の `LeftPane` はエディタ・チャット・設定の 3 タブを持つコンポーネント。

#### A-1: `LeftPane` のまま（変更なし）

**メリット**: コスト最小、既存ドキュメントとの整合性を維持しやすい  
**デメリット**: サイドバーとの関係が名前から読み取れない

#### A-2: `EditPane` に改名

`LeftPane.tsx` → `EditPane.tsx`、`LeftPaneToolbar.tsx` → `EditPaneToolbar.tsx`、CSS クラス `.left-pane` → `.edit-pane` に統一する。
新設する `EditArea` と命名体系が揃い、`Edit*` ファミリーとして一貫性が生まれる。

**メリット**: `EditArea` > `EditPane` > `EditPaneToolbar` という階層が名前から読み取れる  
**デメリット**: import・CSS・テストへの広範な変更が必要

---

### 論点 B: `sidebarCollapsed` の状態所有者と sidebar-toggle の配置場所

#### B-1: AppShell に残す — toggle を LeftPaneToolbar に置く

状態・ボタンともに現在の AppShell 管轄のまま、ボタンのレンダリング先だけ `LeftPaneToolbar` に移す。

**デメリット**: 責務移動が不完全。EditPane がタブに依存しないレイアウト制御ボタンを持つことになる。Chat/Settings タブでの toggle 表示も設計が複雑になる。

#### B-2: `EditArea` を新設 — toggle をサイドバーエリアに置く（採用案）

`EditArea` コンポーネントを新設し、FileTree（`sidebarContent`）と `LeftPane` を内包する。
`sidebarCollapsed` を `EditArea` が所有し、toggle ボタンもサイドバーエリア内に置く。

**目標レイアウト**:

```
AppShell (CSS Grid: topbar-h 1fr auto / edit-area 1fr)
├── [Row 1, col 1/-1] ProjectSelector（全幅トップバー、現状維持）
├── [Row 2, col 1]    EditArea（← 新設、col 1+2 を包む）
│   ├── sidebar-area
│   │   ├── [« Collapse / » Expand ボタン]  ← toggle の新しい場所
│   │   └── sidebarContent（FileTree など）
│   └── LeftPane（エディタ・チャット・設定タブ）
│       └── LeftPaneToolbar（Format ボタンのみ、sidebar-toggle は含まない）
├── [Row 2, col 2]    KarasuPreviewColumn
└── [Row 3, col 1/-1] Warning panel
```

```tsx
// EditArea.tsx
function EditArea({ sidebarContent, previewFocused, ...leftPaneProps }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const hasSidebar = !!sidebarContent;

  return (
    <div className={["edit-area", hasSidebar && "has-sidebar", sidebarCollapsed && "sidebar-collapsed"]
      .filter(Boolean).join(" ")}>
      {hasSidebar && (
        <div className="sidebar-area">
          {!previewFocused && (
            <button
              className="toolbar-btn toolbar-btn--sidebar-toggle"
              onClick={() => setSidebarCollapsed((v) => !v)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? "» Expand" : "« Collapse"}
            </button>
          )}
          {sidebarContent}
        </div>
      )}
      <LeftPane {...leftPaneProps} />
    </div>
  );
}

// AppShell.tsx — sidebarCollapsed・sidebar-toggle を持たなくなる
// sidebarHeaderContent（ProjectSelector）は EditArea の外でそのまま維持
{sidebarHeaderContent}
<EditArea
  sidebarContent={sidebarContent}
  previewFocused={previewFocused}
  {/* ...LeftPane へのその他の props */}
/>
<KarasuPreviewColumn ... />
```

**メリット**:
- `sidebarCollapsed` が `EditArea` 一か所に集約される
- `AppShell` がサイドバーの状態を一切知らなくて済む
- toggle がサイドバーエリア内にあるため責務が自然に分離される
- 将来 OutlineView を追加する際、`sidebar-area` に FileTree/OutlineView タブ切り替えと toggle を並べるだけで統合できる
- `AppShell` の CSS グリッドが `edit-area | preview` の 2 列に単純化される

**デメリット**:
- 新ファイル（`EditArea.tsx`・テスト・CSS）が必要
- `.app-shell.has-sidebar.sidebar-collapsed` の CSS を `.edit-area.has-sidebar.sidebar-collapsed` に移行する必要がある
- `previewFocused` は AppShell → EditArea への props として引き続き必要

---

### 論点 C: CSS グリッドの移行方針

現在の `.app-shell.has-sidebar` は 3 列グリッドでサイドバー幅を管理しているが、
EditArea 導入後は EditArea が内部レイアウトを担うため、AppShell は 2 列に単純化できる。

#### C-1: EditArea 導入と同時にグリッドを移行する

AppShell の `grid-template-columns: var(--sidebar-w) 1fr 1fr` を
`grid-template-columns: 1fr 1fr`（EditArea | Preview）に変更し、
サイドバー幅は EditArea 内で管理する。

**メリット**: AppShell の CSS が単純になり、将来のレイアウト変更に強くなる  
**デメリット**: `.app-shell.has-sidebar` に依存した CSS ルールの広範な修正が必要

#### C-2: CSS グリッドは現状維持、EditArea は div ラッパーとして追加のみ

EditArea を導入しても AppShell の CSS グリッドは変更せず、EditArea は `display: contents` またはグリッドアイテムのラッパーとして振る舞う。

**メリット**: CSS 変更が最小限  
**デメリット**: EditArea が内部レイアウトを管理できないため、サイドバー幅などを EditArea 内で制御しにくい

## 比較

| 論点 | 案 | 変更コスト | 責務の明確さ | 将来の拡張性 |
|------|---|-----------|-------------|------------|
| A: 命名 | A-1 LeftPane のまま | ◎ | △ | △ |
| A: 命名 | A-2 EditPane に改名 | △ | ◎ | ◎ |
| B: 状態・配置 | B-1 AppShell に残す / LeftPaneToolbar | ◎ | ✗ | ✗ |
| B: 状態・配置 | B-2 EditArea 新設 / サイドバーエリア | ○ | ◎ | ◎ |
| C: CSS | C-1 グリッド移行 | △ | ◎ | ◎ |
| C: CSS | C-2 現状維持 | ◎ | △ | △ |

## 現時点の方針

- **B: 状態・配置** → B-2（`EditArea` を新設し、サイドバーエリアに toggle を置く）
- **A: 命名** → A-2（`EditPane*` に改名する）。ただし Issue #465 のスコープからは切り出し、先行する別 Issue で対応する。Issue #465 の実装時点では `LeftPane*` の名前が残っていてよい。
- **C: CSS** → C-1（EditArea 導入と同時に AppShell のグリッドを `edit-area | preview` の 2 列へ移行する）。EditArea が内部レイアウトを自律管理できるよう、サイドバー幅は EditArea 内部で管理する。

## 未解決の問い

なし。
