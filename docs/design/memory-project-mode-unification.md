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
- `BreadcrumbBar`（logical/system 時）
- `BreadcrumbBar`（org 時）
- `PreviewPane`
- ※ `WarningPanel` は現在 `.preview-column` の外にある

### 設計の論点：props の渡し方

#### 案1: フラットな二重ビュー props（コンポーネントが内部でビュー切り替え）

```typescript
interface KarasuPreviewColumnProps {
  viewKind: "logical" | "org";
  diagramType: DiagramType;
  hasDeployDiagram: boolean;
  onViewKindChange: (kind: "logical" | "org") => void;
  onDiagramTypeChange: (type: DiagramType) => void;

  // logical ビューのデータ
  svg: string;
  diagnostics: Diagnostic[];
  viewPath: string[];
  breadcrumbItems: BreadcrumbItem[];
  warnings: Warning[];
  onViewPathNavigate: (path: string[]) => void;

  // org ビューのデータ
  orgSvg: string;
  orgDiagnostics: Diagnostic[];
  orgPath: OrgViewPath;
  orgBreadcrumbItems: BreadcrumbItem[];
  orgWarnings: Warning[];
  onOrgPathNavigate: (path: OrgViewPath) => void;

  // 共通
  nodeMetadata: Map<string, NodeMetadata>;
  onDrillDown: (path: string[]) => void;

  // クロスナビゲーション（deploy 専用、省略可）
  highlightedNodeId?: string | null;
  onClearHighlight?: () => void;
  onContainerClick?: (containerId: string) => void;
}
```

**メリット**: コンポーネントが自己完結。BreadcrumbBar の条件分岐ロジック（`viewKind === "logical" && diagramType === "system"` vs `viewKind === "org"`）が内部に収まる。
**デメリット**: props が約20個と多い。logical/org のデータが並列に混在して視認性が低い。

#### 案2: アクティブビュー props（親がアクティブビューを計算して渡す）

```typescript
interface KarasuPreviewColumnProps {
  viewKind: "logical" | "org";
  diagramType: DiagramType;
  hasDeployDiagram: boolean;
  onViewKindChange: (kind: "logical" | "org") => void;
  onDiagramTypeChange: (type: DiagramType) => void;

  // 親がアクティブビューを計算して渡す
  svg: string;                          // activeSvg
  diagnostics: Diagnostic[];            // activeDiagnostics
  breadcrumbItems: BreadcrumbItem[];    // viewKind に応じて親が選択
  warnings: Warning[];                  // activeWarnings
  onNavigate: (path: string[]) => void; // activeNavigate
  viewPath: string[] | OrgViewPath;

  // 共通
  nodeMetadata: Map<string, NodeMetadata>;
  onDrillDown: (path: string[]) => void;

  // クロスナビゲーション（deploy 専用）
  highlightedNodeId?: string | null;
  onClearHighlight?: () => void;
  onContainerClick?: (containerId: string) => void;
}
```

`MemoryModeApp` は既に `activeSvg = viewKind === "org" ? orgSvg : svg` を計算しており、
このパターンと自然に合致する。

**メリット**: props が約14個に削減。`MemoryModeApp` の既存パターン（`activeSvg` 計算）と合う。
**デメリット**: BreadcrumbBar の表示条件（deploy タブ時は非表示）を親で制御する必要がある。
`breadcrumbItems = []` で非表示を表現するか、別途 `showBreadcrumb` boolean を渡すか、判断が必要。

#### 案3: ビューオブジェクト（structured props）← 推奨

logical/org それぞれのデータをオブジェクトにまとめ、コンポーネントが内部で切り替える。

```typescript
interface LogicalViewProps {
  svg: string;
  diagnostics: Diagnostic[];
  viewPath: string[];
  breadcrumbItems: { id: string; label: string }[];
  warnings: Warning[];
  onBreadcrumbNavigate: (path: string[]) => void;
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
  // タブ制御
  viewKind: "logical" | "org";
  diagramType: DiagramType;
  hasDeployDiagram: boolean;
  onViewKindChange: (kind: "logical" | "org") => void;
  onDiagramTypeChange: (type: DiagramType) => void;

  // ビュー別データ
  logicalView: LogicalViewProps;
  orgView: OrgViewProps;

  // 共通
  nodeMetadata: Map<string, NodeMetadata>;
  onDrillDown: (path: string[]) => void;

  // クロスナビゲーション（deploy 専用、省略可）
  highlightedNodeId?: string | null;
  onClearHighlight?: () => void;
  onContainerClick?: (containerId: string) => void;
}
```

**メリット**:
- トップレベル props は10個（管理しやすい）
- logical/org のデータが明確に分離されて視認性が高い
- BreadcrumbBar の条件分岐（deploy タブ時は非表示）をコンポーネントが `diagramType` を参照して制御できる
- `WarningPanel` の切り替えもコンポーネント内部に収まる

**デメリット**:
- `LogicalViewProps`, `OrgViewProps` の型定義が必要
- 親が両ビューのデータをオブジェクトとして組み立てる必要がある（ただし既存フック呼び出しの結果を詰め替えるだけ）

### 案3 のコンポーネントイメージ

```tsx
export function KarasuPreviewColumn({
  viewKind, diagramType, hasDeployDiagram,
  onViewKindChange, onDiagramTypeChange,
  logicalView, orgView,
  nodeMetadata, onDrillDown,
  highlightedNodeId, onClearHighlight, onContainerClick,
}: KarasuPreviewColumnProps) {
  const activeView = viewKind === "org" ? orgView : logicalView;
  const showBreadcrumb =
    viewKind === "org" || (viewKind === "logical" && diagramType === "system");

  return (
    <div className="preview-column">
      <DiagramTabBar
        current={diagramType}
        hasDeployDiagram={hasDeployDiagram}
        onChange={(type) => { onViewKindChange("logical"); onDiagramTypeChange(type); }}
        viewKind={viewKind}
        onViewKindChange={onViewKindChange}
      />
      {showBreadcrumb && (
        <BreadcrumbBar
          items={activeView.breadcrumbItems}
          onNavigate={activeView.onBreadcrumbNavigate}
        />
      )}
      <PreviewPane
        svg={activeView.svg}
        diagnostics={activeView.diagnostics}
        viewPath={viewKind === "org" ? orgView.orgPath : logicalView.viewPath}
        nodeMetadata={nodeMetadata}
        onDrillDown={onDrillDown}
        onContainerClick={
          viewKind === "logical" && diagramType === "deploy" ? onContainerClick : undefined
        }
        highlightedNodeId={highlightedNodeId}
        onClearHighlight={onClearHighlight}
      />
      <WarningPanel warnings={activeView.warnings} />
    </div>
  );
}
```

### WarningPanel の配置について

現在 `WarningPanel` は `.preview-column` の**外**にある（両アプリ共通）。
`KarasuPreviewColumn` に取り込むと CSS レイアウトへの影響が生じる可能性がある。

選択肢：
- **内包する**: コンポーネントが完全に自己完結する。CSS 調整が必要になる可能性あり。
- **外部に置く**: `WarningPanel` は props として警告リストだけ受け取り、親が配置を担う。
  `KarasuPreviewColumn` は `onGetActiveWarnings` 等は持たず、コンポーネント外で `activeWarnings` を計算する。

---

## 未解決の問い

1. `KarasuPreviewColumn` の props 設計として案3（ビューオブジェクト）で進めるか
2. `WarningPanel` を `KarasuPreviewColumn` に内包するか、外部に置くか
3. `MemoryModeApp` の `SAMPLE_KRS` は Deploy 図・Org 図の例も含めた内容に更新するか
