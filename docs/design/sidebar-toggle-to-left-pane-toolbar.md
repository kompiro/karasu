# sidebar-toggle の LeftPaneToolbar への移動と左エリアの設計整理

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

1. **責務の不一致**: `sidebar-toggle` は左エリア（エディタ・チャット・設定タブ）の表示制御であり、`AppShell` の関心ではない。
2. **絶対配置による脆弱性**: 現在のボタンは `.app-shell.has-sidebar` 内で絶対配置（`left: var(--sidebar-w)`）されており、グリッドレイアウトの変更に弱い。

加えて、`LeftPane` という命名が「左エリア全体（サイドバー含む）」を指しているのか「エディタエリアのみ」を指しているのかが曖昧になってきた。
このタイミングで命名の意味を明確にしておくことが望ましい。

## 制約・前提

- ツールバーボタンは icon + text label 必須（ADR 0007、`app-ui.md`）
- `sidebarCollapsed` は `AppShell` の CSS クラス（`sidebar-collapsed`）にも影響するため、AppShell はこの状態を把握し続ける必要がある
- `hasSidebar` は `AppShell` が判定する（`sidebarHeaderContent || sidebarContent` の有無）
- `previewFocused` は `AppShell` が管理する状態で、サイドバー関連 UI を隠す条件になる
- 既存の `left-pane-toolbar.md` で確立した「アクションのないタブでは null を返す」方針があるが、sidebar-toggle はレイアウト制御のためタブとは独立している

## 検討した選択肢

---

### 論点 A: 命名 — `LeftPane` のままにするか改名するか

現在の `LeftPane` はエディタ・チャット・設定の 3 タブを持つコンポーネントであり、サイドバー（ファイルツリー）は `AppShell` が管理する別コンポーネント。
「左エリア = LeftPane + サイドバー」と捉えるなら、名前が実態より狭い。

#### A-1: `LeftPane` のまま（変更なし）

- ファイル名・import・テスト・CSS クラスへの影響ゼロ
- 「LeftPane はエディタエリアのタブコンテナ」という狭義の意味で用語を固定する

**メリット**: コスト最小、既存ドキュメントとの整合性を維持しやすい  
**デメリット**: サイドバーとの関係が名前から読み取れない

#### A-2: `EditorArea` に改名

- エディタ・チャット・設定タブを内包する「エディタ系の作業エリア」として明示
- `LeftPane.tsx` → `EditorArea.tsx`、CSS クラス `.left-pane` → `.editor-area` など広範な変更が必要

**メリット**: 役割が名前から自明になる  
**デメリット**: 全 import・CSS・テストへの影響が大きく、Issue #465 のスコープを超える

#### A-3: `LeftArea` に改名

- 方向（左）で命名する最もシンプルな案
- EditorArea 同様に広範な変更が必要

**メリット**: 意味が広く、将来の変更に対して中立  
**デメリット**: A-2 と同じコスト、方向名のみで役割が不明瞭

---

### 論点 B: `sidebarCollapsed` の状態所有者をどこにするか

#### B-1: AppShell に残す（現状維持）、LeftPane に props で渡す

`sidebarCollapsed` / `onSidebarToggle` を `LeftPane` → `LeftPaneToolbar` へ props として渡す。
状態の実体は `AppShell` に残るため、CSS クラスへの反映はそのまま機能する。

```tsx
// AppShell.tsx
<LeftPane
  ...
  hasSidebar={hasSidebar}
  sidebarCollapsed={sidebarCollapsed}
  previewFocused={previewFocused}
  onSidebarToggle={() => setSidebarCollapsed((v) => !v)}
/>
```

**メリット**: 変更範囲が小さい。AppShell の CSS クラス管理と状態が一体で整合性が保ちやすい  
**デメリット**: `AppShell` がサイドバーの「見た目の制御」と「状態の保持」の両方を持ち続けるため、Issue が目指す「左エリアへの責務移動」が不完全

#### B-2: LeftPane に移す、callback で AppShell に通知

`LeftPane` が `sidebarCollapsed` を useState で持ち、変化時に `onSidebarCollapsedChange(v: boolean)` で `AppShell` へ通知する。
`AppShell` はコールバックで受け取った値を自身の CSS クラス計算に使う。

```tsx
// LeftPane.tsx
const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
const handleSidebarToggle = useCallback(() => {
  const next = !sidebarCollapsed;
  setSidebarCollapsed(next);
  onSidebarCollapsedChange?.(next);
}, [sidebarCollapsed, onSidebarCollapsedChange]);

// AppShell.tsx
const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
<LeftPane
  ...
  hasSidebar={hasSidebar}
  previewFocused={previewFocused}
  onSidebarCollapsedChange={setSidebarCollapsed}
/>
```

**メリット**: 状態の所有が左エリアに移り、Issue の設計意図を完全に実現する  
**デメリット**: `sidebarCollapsed` の初期値同期が 2 か所に分散するため、初期状態不一致のリスクがわずかにある（実際は両者とも `false` 固定なので問題は軽微）

#### B-3: AppShell と FileTree/LeftPane の間に新コンポーネント（`EditArea`）を挟む

`EditArea` コンポーネントを新設し、サイドバー（FileTree）・`LeftPane` の両方を包む。
`sidebarCollapsed` を `EditArea` が完全に所有し、`AppShell` はサイドバー関連の状態を一切知らなくて済む。

```
AppShell
├── EditArea  ← 新コンポーネント（sidebarCollapsed を所有）
│   ├── sidebarHeaderContent
│   ├── FileTree（sidebarContent）
│   └── LeftPane → LeftPaneToolbar（sidebar-toggle ボタン）
└── KarasuPreviewColumn
```

```tsx
// EditArea.tsx
function EditArea({ sidebarHeaderContent, sidebarContent, previewFocused, ...leftPaneProps }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const hasSidebar = !!(sidebarHeaderContent || sidebarContent);

  return (
    <div className={`edit-area ${hasSidebar && sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {sidebarHeaderContent}
      {sidebarContent}
      <LeftPane
        {...leftPaneProps}
        hasSidebar={hasSidebar}
        sidebarCollapsed={sidebarCollapsed}
        previewFocused={previewFocused}
        onSidebarToggle={() => setSidebarCollapsed((v) => !v)}
      />
    </div>
  );
}

// AppShell.tsx — sidebarCollapsed を持たなくなる
<EditArea
  sidebarHeaderContent={sidebarHeaderContent}
  sidebarContent={sidebarContent}
  previewFocused={previewFocused}
  {/* ...LeftPane へのその他の props */}
/>
```

**メリット**:
- `sidebarCollapsed` が 1 か所に集約され、重複も callback もない
- `AppShell` がサイドバー状態を知る必要がなくなり、責務が明確に分離される
- 将来「編集エリア全体」への機能追加（例: 左エリアのリサイズ）の受け皿になる
- `AppShell` の CSS グリッド管理を単純化できる（`edit-area` が内部レイアウトを担う）

**デメリット**:
- 新ファイル追加（`EditArea.tsx`・テスト・CSS）が必要
- `AppShell` の CSS クラス `.app-shell.has-sidebar.sidebar-collapsed` から `sidebar-collapsed` クラスの管理を `EditArea` に移す必要があり、CSS の再構成が必要
- `previewFocused` は引き続き `AppShell` から `EditArea` へ props として渡す必要がある

---

### 論点 C: sidebar-toggle はどのタブで表示するか

`LeftPaneToolbar` の既存方針は「アクションのないタブでは null を返す」だが、
sidebar-toggle はタブ固有のアクションではなくレイアウト全体の制御である。

#### C-1: 全タブで常に表示

chat タブ・settings タブでもサイドバーを開閉できる。
ツールバーには「sidebar-toggle のみ」または「sidebar-toggle + タブ固有アクション」が並ぶ。

**メリット**: どのタブでも一貫してサイドバーを操作できる  
**デメリット**: chat・settings タブではアクションがないため sidebar-toggle のみになり、ツールバーが寂しい見た目になる

#### C-2: editor タブのみ表示

sidebar-toggle を editor タブ専用として `LeftPaneToolbar` に組み込む。

**メリット**: 実装が単純。editor タブは最も頻繁に使われるタブであり、実用上の問題は小さい  
**デメリット**: chat / settings タブでサイドバーを閉じられなくなる（回避策: タブ切り替え前に閉じておく、または後続 Issue で対応）

---

### 論点 D: CSS スタイリング — 絶対配置を維持するか inline に変えるか

現在の `.sidebar-toggle` は `.app-shell.has-sidebar` 内で `position: absolute; left: var(--sidebar-w)` で配置されている。

#### D-1: 絶対配置を維持しつつレンダリング場所だけ移す

`LeftPaneToolbar` 内に `position: absolute` のボタンを置く。

**デメリット**: `LeftPaneToolbar` の親（`.left-pane`）がポジショニングコンテキストになるため、サイドバー境界への配置が再現しにくい。実質的に不可能に近い。

#### D-2: `toolbar-btn` として inline に配置し直す

絶対配置を捨て、`LeftPaneToolbar` の flex row 内に通常の `toolbar-btn` として配置する。
`.sidebar-toggle` の絶対配置 CSS は削除し、`toolbar-btn` スタイルを適用する。

**メリット**: レイアウト変更に強く、グリッド変更の影響を受けない  
**デメリット**: ボタンの見た目・位置が変わるため、UI の外観が変化する（想定の範囲内）

## 比較

| 論点 | 案 | 変更コスト | 責務の明確さ | UX |
|------|---|-----------|-------------|-----|
| A: 命名 | A-1 LeftPane のまま | ◎ | △ | — |
| A: 命名 | A-2/A-3 改名 | ✗ | ◎ | — |
| B: 状態所有 | B-1 AppShell に残す | ◎ | △ | — |
| B: 状態所有 | B-2 LeftPane へ移す | ○ | ○ | — |
| B: 状態所有 | B-3 EditArea を新設 | △ | ◎ | — |
| C: タブ表示 | C-1 全タブ | ○ | ◎ | ◎ |
| C: タブ表示 | C-2 editor のみ | ◎ | △ | △ |
| D: CSS | D-1 絶対配置維持 | — | — | ✗ |
| D: CSS | D-2 inline toolbar-btn | ○ | ◎ | ○ |

## 現時点の方針

- **A: 命名** → A-1（`LeftPane` のまま）。改名のコストが Issue スコープを超えるため、今回は保留。
- **B: 状態所有** → B-3（`EditArea` を新設）。`sidebarCollapsed` を一か所に集約し責務を明確化する。
- **C: タブ表示** → C-1（全タブで常に表示）。sidebar-toggle はレイアウト制御であり、タブに依存すべきでない。
- **D: CSS** → D-2（inline `toolbar-btn`）。絶対配置は技術的に再現困難なため。

## 未解決の問い

なし。
