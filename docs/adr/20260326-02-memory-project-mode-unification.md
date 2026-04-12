# ADR-0056: MemoryMode と ProjectMode の統一 — Reducer + `KarasuPreviewColumn`

- **日付**: 2026-03-26
- **ステータス**: 決定済み
- **関連**: [ADR-0008](20260324-01-manual-qa-over-e2e.md), [ADR-0009](20260325-01-testing-library-react.md)

## 背景

`ProjectModeApp` に新機能（Deploy ダイアグラム、クロスナビゲーション）を追加したが、`MemoryModeApp` へのバックポートが行われず機能乖離が生じていた。`MemoryModeApp` は「OPFS 非対応ブラウザで 1 ファイルを使って試すモード」であり、Deploy / Org ダイアグラムを 1 ファイルで扱えることに意義があるため、`ProjectModeApp` と同等の図表機能を持つべきだった。

## 決定

両モードを `useAppContext` ベースに統一し、FS レイヤーをアダプターで差し替える（`InMemoryFileSystemProvider` vs `OpfsFileSystemProvider`）。共通のプレビュー列を `KarasuPreviewColumn` として抽出する。

### Reducer 状態の統一（3 ビューモデル）

`diagramType: "system" | "deploy"` + `viewKind: "logical" | "org"` の 2 軸を、`activeView: "system" | "deploy" | "org"` の 1 軸に統一する：

| ビュー | BreadcrumbBar | Warnings | クロスナビゲーション |
|---|:---:|---|---|
| `system` | ✓（システム階層） | logical | ❌ |
| `deploy` | ❌ | logical | ✓（`onContainerClick`） |
| `org` | ✓（組織階層） | org | ❌ |

### `KarasuPreviewColumn` の props 設計

3 ビューごとに独立したオブジェクト (`SystemViewProps` / `DeployViewProps` / `OrgViewProps`) を渡す。

```typescript
interface KarasuPreviewColumnProps {
  activeView: ActiveView;
  hasDeployDiagram: boolean;
  onActiveViewChange: (view: ActiveView) => void;
  systemView: SystemViewProps;
  deployView: DeployViewProps;  // highlightedNodeId 等を内包
  orgView: OrgViewProps;
  nodeMetadata: Map<string, NodeMetadata>;
  onDrillDown: (path: string[]) => void;
}
```

`WarningPanel` は `KarasuPreviewColumn` に**内包する**（`activeView === "org"` の条件分岐が 3 ビューモデルの中で完結するため）。

### `InMemoryFileSystemProvider`

`packages/app/src/fs/in-memory-provider.ts` に配置。`MemoryModeApp` では単一ファイルを Map に保持するだけで済み、`readDir` / `mkdir` / `delete` は空実装 (`Promise.resolve()`) とする。

### SAMPLE_KRS / DEFAULT_KRS / ReferencePanel Samples タブ

初期コンテンツは「3 タブすべてが動く状態」で届ける。`SAMPLE_KRS` と `DEFAULT_KRS` を system + deploy + org を含む完全例に更新し、ReferencePanel に "Samples" タブを新設して `getReference()` 経由でコピー可能サンプルを提供する。

## 理由

- **機能乖離の解消**: `ProjectModeApp` を「正解の実装」とし、共通 Reducer + `KarasuPreviewColumn` に吸収することで、今後の機能追加が両モードに自動反映される
- **3 ビューモデル**: `viewKind` + `diagramType` の 2 軸モデルでは、親コンポーネントが組み合わせを意識する必要があり、props 設計が複雑化していた。1 軸 (`activeView`) にするとビュー固有 props をオブジェクトで分離でき型が明確になる
- **`InMemoryFileSystemProvider` の空実装**: `MemoryModeApp` では使わないメソッドを空実装にすることで、インターフェースを満たしつつ無駄なコードを書かない
- **`WarningPanel` 内包**: 「3 ビューに応じて警告を切り替える」ロジックが `KarasuPreviewColumn` 内で完結し自己完結する

## 却下した案

### 案: `KarasuPreviewColumn` に個別 props をフラットに並べる

`highlightedNodeId`, `onContainerClick`, `onClearHighlight` をトップレベル props にする案。クロスナビゲーションが deploy 専用であることが型で表現されず、どのビューで使われるかが不明確になる。

## 実装順序

1. ProjectModeApp の 3 ビューモデル化（Reducer 状態 + `DiagramTabBar` + `KarasuPreviewColumn` 抽出）
2. `InMemoryFileSystemProvider` 実装
3. `MemoryModeApp` を `useAppContext` + `KarasuPreviewColumn` に書き換え
4. `SAMPLE_KRS` / `DEFAULT_KRS` を完全例に更新
5. ReferencePanel に Samples タブを追加
