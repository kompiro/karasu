# MemoryModeApp と ProjectModeApp の統一

- **日付**: 2026-03-26
- **ステータス**: 検討中
- **関連**: `docs/design/app-testing-strategy.md`、ADR-0008、ADR-0009

## 背景・課題

`ProjectModeApp` に新機能（Deploy ダイアグラム、クロスナビゲーション）を追加したが、
`MemoryModeApp` へのバックポートが行われず、機能乖離が生じている。

`MemoryModeApp` は「OPFS 非対応ブラウザで1ファイルを使って試すモード」であり、
Deploy ダイアグラムや Org ダイアグラムを1ファイルで扱えることに意義がある。
よって `ProjectModeApp` と同等の図表機能（Deploy、クロスナビゲーション、Org）を持つべきである。

---

## 現状の差分

| 機能 | MemoryModeApp | ProjectModeApp |
|------|--------------|----------------|
| タブバー | 独自 `<button>` 2つ（Logical/Org）| `DiagramTabBar`（System/Deploy/Org + ARIA） |
| Deploy ダイアグラム | ❌ なし | ✓ あり |
| クロスナビゲーション | ❌ なし | ✓ あり（`onContainerClick`, `highlightedNodeId`） |
| WarningPanel の org 切り替え | ❌ `warnings` 固定 | ✓ `viewKind` に応じて切り替え |
| ブレッドクラム（org 時） | 条件分岐で1つの BreadcrumbBar | 2つの BreadcrumbBar を条件レンダリング |
| ファイル管理 | なし（メモリのみ） | ProjectSelector + FileTree + OPFS |
| 状態管理 | `useState` ローカル | `useAppContext`（Reducer + Context） |

---

## 決定した方針：Reducer への移行

`MemoryModeApp` も `useAppContext` ベースに統一し、`ProjectModeApp` との差分をなくす。
FS レイヤーをアダプターで差し替える（`InMemoryFileSystem` vs `OpfsFileSystem`）。

```
App.tsx
├── <MemoryModeApp>  ← useAppContext（メモリ版 FS アダプター）
└── <ProjectModeApp> ← useAppContext（OPFS 版 FS アダプター）
```

- `app-reducer.ts` の状態・アクションは両モードで共有
- FS レイヤーをアダプターで差し替える（`InMemoryFileSystem` vs `OpfsFileSystem`）
- `MemoryModeApp` は ProjectSelector / FileTree を持たないが、それ以外の機能は同等

### 移行ステップ

1. `InMemoryFileSystemProvider` を実装する（後述）
2. `MemoryModeApp` を `useAppContext` ベースに書き換え、`SAMPLE_KRS` を初期状態として注入
3. Deploy ダイアグラム・クロスナビゲーションが `MemoryModeApp` でも動作することを確認
4. 共通化されたプレビュー列を `<KarasuPreviewColumn>` として抽出（後述）

---

## InMemoryFileSystemProvider の設計

`packages/core/src/fs/types.ts` に定義された `FileSystemProvider` インターフェースを実装する。

### 実装方針：インターフェースを満たし、空の実装

`MemoryModeApp` は単一ファイルをメモリで保持するだけでよく、
ファイルツリー操作（`readDir`, `mkdir`, `delete`）は使われない。
そのため、未使用メソッドは `Promise.resolve()` を返す空実装にしておく。

```typescript
// packages/app/src/fs/in-memory-provider.ts
import type { FileSystemProvider, DirEntry } from "@karasu/core";

export class InMemoryFileSystemProvider implements FileSystemProvider {
  private files = new Map<string, string>();

  async readFile(path: string): Promise<string> {
    return this.files.get(path) ?? "";
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  // MemoryModeApp では未使用のため空実装
  async readDir(_path: string): Promise<DirEntry[]> { return []; }
  async delete(_path: string): Promise<void> {}
  async mkdir(_path: string): Promise<void> {}
}
```

**配置先**: `packages/app/src/fs/in-memory-provider.ts`

テスト用にも流用できるため、`project-manager.test.ts` が現在使っているモック FS を
この実装に置き換えることも将来的に検討できる。

---

## KarasuPreviewColumn の props 設計

両アプリが共有するプレビュー列コンポーネントを抽出する。

現在の `ProjectModeApp` のプレビュー列（`.preview-column`）に含まれる要素：
- `DiagramTabBar`（タブバー）
- `BreadcrumbBar`（system 時）
- `BreadcrumbBar`（org 時）
- `PreviewPane`
- ※ `WarningPanel` は現在 `.preview-column` の外にある

### ビューの3分類

タブが表すビューを `system` / `deploy` / `org` の3つとして扱う。
現在の Reducer 状態 `diagramType: "system" | "deploy"` ＋ `viewKind: "logical" | "org"` の2軸を、
`activeView: "system" | "deploy" | "org"` の1軸に統一する。

この分類にすると各ビューの責務が明確になる：

| ビュー | BreadcrumbBar | WarningPanel の警告 | クロスナビゲーション |
|--------|:---:|-----|-----|
| `system` | ✓（システム階層） | logical warnings | ❌ |
| `deploy` | ❌ | logical warnings | ✓（`onContainerClick` でシステムビューへ） |
| `org` | ✓（組織階層） | org warnings | ❌ |

### 決定した props 設計：3ビューオブジェクト

```typescript
type ActiveView = "system" | "deploy" | "org";

interface SystemViewProps {
  svg: string;
  diagnostics: Diagnostic[];
  viewPath: string[];
  breadcrumbItems: { id: string; label: string }[];
  warnings: Warning[];
  onBreadcrumbNavigate: (path: string[]) => void;
}

interface DeployViewProps {
  svg: string;
  diagnostics: Diagnostic[];
  warnings: Warning[];
  // クロスナビゲーションは deploy 専用なのでここに集約
  highlightedNodeId?: string | null;
  onClearHighlight?: () => void;
  onContainerClick?: (containerId: string) => void;
}

interface OrgViewProps {
  svg: string;
  diagnostics: Diagnostic[];
  orgPath: OrgViewPath;
  breadcrumbItems: { id: string; label: string }[];
  warnings: Warning[];
  onBreadcrumbNavigate: (path: OrgViewPath) => void;
}

interface KarasuPreviewColumnProps {
  activeView: ActiveView;
  hasDeployDiagram: boolean;
  onActiveViewChange: (view: ActiveView) => void;

  systemView: SystemViewProps;
  deployView: DeployViewProps;
  orgView: OrgViewProps;

  nodeMetadata: Map<string, NodeMetadata>;
  onDrillDown: (path: string[]) => void;
}
```

**メリット**:
- トップレベル props は7個（`activeView`, `hasDeployDiagram`, `onActiveViewChange`, `systemView`, `deployView`, `orgView`, `nodeMetadata`, `onDrillDown`）
- クロスナビゲーション props（`highlightedNodeId`, `onClearHighlight`, `onContainerClick`）が `deployView` に集約され、トップレベルから消える
- `activeView` の1軸で「どのビューか」が表現される。`viewKind` と `diagramType` の組み合わせを親が意識しなくてよい
- ビューごとに必要な props が異なることが型で表現される（`deployView` には `breadcrumbItems` がない、など）

### コンポーネントイメージ

```tsx
export function KarasuPreviewColumn({
  activeView, hasDeployDiagram, onActiveViewChange,
  systemView, deployView, orgView,
  nodeMetadata, onDrillDown,
}: KarasuPreviewColumnProps) {
  return (
    <div className="preview-column">
      <DiagramTabBar
        active={activeView}
        hasDeployDiagram={hasDeployDiagram}
        onChange={onActiveViewChange}
      />
      {activeView === "system" && (
        <BreadcrumbBar
          items={systemView.breadcrumbItems}
          onNavigate={systemView.onBreadcrumbNavigate}
        />
      )}
      {activeView === "org" && (
        <BreadcrumbBar
          items={orgView.breadcrumbItems}
          onNavigate={orgView.onBreadcrumbNavigate}
        />
      )}
      <PreviewPane
        svg={activeView === "system" ? systemView.svg : activeView === "deploy" ? deployView.svg : orgView.svg}
        diagnostics={activeView === "system" ? systemView.diagnostics : activeView === "deploy" ? deployView.diagnostics : orgView.diagnostics}
        viewPath={activeView === "system" ? systemView.viewPath : activeView === "org" ? orgView.orgPath : []}
        nodeMetadata={nodeMetadata}
        onDrillDown={activeView !== "deploy" ? onDrillDown : undefined}
        onContainerClick={activeView === "deploy" ? deployView.onContainerClick : undefined}
        highlightedNodeId={activeView === "deploy" ? deployView.highlightedNodeId : undefined}
        onClearHighlight={activeView === "deploy" ? deployView.onClearHighlight : undefined}
      />
      <WarningPanel
        warnings={activeView === "org" ? orgView.warnings : systemView.warnings}
      />
    </div>
  );
}
```

### Reducer 状態の変更

`activeView` の導入に伴い `app-reducer.ts` の状態・アクションも変更が必要：

```typescript
// 変更前
state.diagramType: "system" | "deploy"
state.viewKind: "logical" | "org"
action: SET_DIAGRAM_TYPE, SET_VIEW_KIND

// 変更後
state.activeView: "system" | "deploy" | "org"
action: SET_ACTIVE_VIEW
```

`DiagramTabBar` コンポーネントのインターフェースも `current` + `viewKind` → `active: ActiveView` に変更する。

### WarningPanel の配置について

現在 `WarningPanel` は `.preview-column` の**外**にある（両アプリ共通）。
3ビューモデルにすると `KarasuPreviewColumn` 内で `activeView === "org"` の条件分岐が完結するため、
**内包する**のが自然。ただし CSS レイアウトへの影響を確認する必要がある。

---

## リファクタリングの進め方

`ProjectModeApp` が全機能（deploy、クロスナビ）を持つ「正解の実装」であるため、
ProjectModeApp で3ビューモデルを確立してから MemoryModeApp に適用する。

### ステップ1: Reducer 状態の統一（ProjectModeApp のみ影響）

- `app-reducer.ts`: `diagramType` + `viewKind` → `activeView: "system" | "deploy" | "org"`
- `DiagramTabBar`: `current: DiagramType` + `viewKind` → `active: ActiveView`
- `ProjectModeApp`: 新しい状態に合わせて更新

### ステップ2: KarasuPreviewColumn の抽出（ProjectModeApp から）

- `packages/app/src/components/KarasuPreviewColumn.tsx` を新規作成
- `ProjectModeApp` の `.preview-column` の内容を移行
- 3ビューオブジェクト props を確立し、`ProjectModeApp` から正常動作を確認

### ステップ3: InMemoryFileSystemProvider の実装

- `packages/app/src/fs/in-memory-provider.ts`（設計は前節参照）

### ステップ4: MemoryModeApp の移行

- `useAppContext`（`InMemoryFileSystemProvider` を注入）に書き換え
- `KarasuPreviewColumn` を使用
- `SAMPLE_KRS` を Deploy 図・Org 図も含む内容に更新（必要に応じて）

---

## 未解決の問い

1. `WarningPanel` を `KarasuPreviewColumn` に内包するか、CSS レイアウトへの影響を確認する
2. `MemoryModeApp` の `SAMPLE_KRS` は Deploy 図・Org 図の例も含めた内容に更新するか
