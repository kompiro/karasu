# Reference パネルの図種別コンテキスト対応

- **日付**: 2026-03-27
- **ステータス**: 完了

> **実装メモ**: `ReferencePanel` が `useAppContext()` を直接参照する設計だったが、実際には `KarasuPreviewColumn` から props 経由で `activeView` を渡す実装になった。機能的には同等。
- **関連**: [builtin-style-and-reference.md](./builtin-style-and-reference.md)

## 背景・課題

Reference パネル（`ReferencePanel.tsx`）は現在 system diagram の構文情報のみを表示している。
deploy diagram・org diagram を書く際に構文を確認する手段がない。

また、現状 Reference ボタンは `BreadcrumbBar` に内包されており、
system/org 表示時にしか表示されない（deploy 表示中はボタン自体が消える）。

### 現状の構造

```
KarasuPreviewColumn
  DiagramTabBar
  BreadcrumbBar  ← system 表示時のみレンダリング（Reference ボタンを含む）
  BreadcrumbBar  ← org 表示時のみレンダリング（Reference ボタンを含む）
  // deploy 表示時は BreadcrumbBar なし → Reference ボタンなし
  PreviewPane
  WarningPanel
```

## 制約・前提

- `ActiveView = "system" | "deploy" | "org"` はすでに統一済み（`app-reducer.ts`）
- MemoryModeApp・ProjectModeApp ともに `AppProvider` でラップ済みのため、
  どのコンポーネントからも `useAppContext()` が利用できる
- `KarasuReference`（`reference.ts`）は既存の system 向けデータを保持している

## 設計方針

### 1. Reference ボタンを `BreadcrumbBar` から独立させる

`BreadcrumbBar` はパンくずナビゲーションの責務に集中させ、
Reference ボタンと `ReferencePanel` の管理を `KarasuPreviewColumn` に移す。

```
KarasuPreviewColumn
  DiagramTabBar
  ToolBar              ← 新設（Reference ボタンを常時表示）
  BreadcrumbBar        ← system/org 表示時のみ（パンくずのみ）
  PreviewPane
  WarningPanel
```

> **Note**: Toolbar ボタンはアイコン + テキストラベルを必須とする（既存ルール）。

### 2. `ReferencePanel` が `useAppContext()` で `activeView` を直接読む

prop chain を追加せず、パネル内で直接コンテキストを参照する。

```tsx
// ReferencePanel.tsx
const { state: { activeView } } = useAppContext();
```

`activeView` の値によって Syntax・Styles・Tags タブの表示内容を切り替える。

### 3. `KarasuReference` に deploy/org の情報を追加（core 側）

```ts
// reference.ts
export interface DeployUnitKindInfo {
  kind: string;        // "war" | "jar" | "oci" | ...
  description: string;
  properties: string[]; // ["runtime", "realizes", ...]
  optionalProperties?: string[]; // ["image", "schedule", ...]
}

export interface OrgKindInfo {
  kind: string;        // "organization" | "team" | "member"
  description: string;
  canContain: string[];
  properties: string[];
}

export interface KarasuReference {
  nodeKinds: NodeKindInfo[];        // 既存（system 用）
  deployUnitKinds: DeployUnitKindInfo[]; // 追加
  orgKinds: OrgKindInfo[];          // 追加
  tags: TagInfo[];
  annotations: AnnotationInfo[];
  styleProperties: StylePropertyInfo[];
  shapes: ShapeInfo[];
  builtinStyleSource: string;
  sampleKrs: string;
}
```

## タブごとの切り替え方針

| タブ | system | deploy | org |
|------|--------|--------|-----|
| **Syntax** | `nodeKinds` テーブル（既存） | `deployUnitKinds` テーブル | `orgKinds` テーブル |
| **Styles** | セレクタ例: `service`, `domain[external]` | セレクタ例: `oci`, `jar` | セレクタ例: `team`, `member` |
| **Tags & Annotations** | 既存のタグ・アノテーション一覧 | 「このダイアグラムでは未対応」を表示 | 「このダイアグラムでは未対応」を表示 |
| **Built-in Theme** | 全図種別共通のテーマを表示（変わらず） | 同左（全図共通であることを明記） | 同左 |

### Tags & Annotations の将来方針

deploy/org 向けのタグ・アノテーション体系は別途設計する。
現時点では "このダイアグラムでは未対応" を表示し、将来の対応に備えた構造とする。

### Built-in Theme の表示

スタイルシートは全図種別共通のため、常に全体を表示する。
パネル上部に「すべての図種別に適用されるテーマです」という注記を追加する。

## 変更ファイル一覧

| ファイル | 変更内容 |
|----------|---------|
| `packages/core/src/builtins/reference.ts` | `DeployUnitKindInfo`, `OrgKindInfo` 型と対応データを追加 |
| `packages/core/src/index.ts` | 新型をエクスポート |
| `packages/app/src/components/KarasuPreviewColumn.tsx` | Reference ボタン + `ReferencePanel` を追加、toolbar 行を新設 |
| `packages/app/src/components/BreadcrumbBar.tsx` | Reference ボタンと `ReferencePanel` を除去 |
| `packages/app/src/components/ReferencePanel.tsx` | `useAppContext()` で `activeView` を取得、タブ表示を切り替え |
| `packages/app/src/styles/app.css` | toolbar スタイルの追加（必要に応じて） |

## 決定済みの問い

- **Styles タブのセレクタ例の形式**: コードブロック形式（コピーしやすいため）
- **トップレベルブロック宣言の扱い**: Syntax タブにブロック宣言構文も含める。
  system タブは `system "<名前>" { ... }`、deploy タブは `deploy "<名前>" { ... }`、
  org タブは `organization "<名前>" { ... }` を先頭に掲載する
- **org キーワード**: パーサーキーワードは `organization`（`org` ではない）
