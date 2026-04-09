# クロスナビゲーション時のアトミックなハイライト適用

- **日付**: 2026-04-09
- **ステータス**: 完了
- **関連**:
  - [interactive-svg-rendering.md](interactive-svg-rendering.md) — ハイライトの useEffect 設計
  - [node-click-ux.md](node-click-ux.md) — クリックインタラクション全般
  - Issue #422 (バグ修正)

## 背景・課題

D ボタン（サービス → Deploy 図）またはチームラベル（サービス → Org 図）をクリックすると、
ビューが切り替わりつつ対象ノードがハイライトされるはずだが、現状ハイライトが適用されない。

### 原因の詳細

`AppShell.tsx` の各ハンドラは2つのアクションを**順番に**ディスパッチしている。

```ts
// handleDeployButtonClick（AppShell.tsx:167–173）
navigateActiveView("deploy");  // → SET_ACTIVE_VIEW をディスパッチ
dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: serviceId });
```

しかし `SET_ACTIVE_VIEW` の reducer が `highlightedNodeId` を **常に `null` にリセット**する。

```ts
// app-reducer.ts:95–101
case "SET_ACTIVE_VIEW":
  return {
    ...state,
    activeView: action.activeView,
    viewPath: [],
    highlightedNodeId: null,  // ← 問題の箇所
  };
```

React がこれら2つの dispatch をバッチ処理した場合、コンポーネントは次の状態で1回だけレンダリングされる可能性がある:

- `activeView` = 新しいビュー（例: "deploy"）
- `highlightedNodeId` = `null`（`SET_ACTIVE_VIEW` で上書きされたまま）

その結果、`PreviewPane` の highlight `useEffect`（`[highlightedNodeId, svg]` 依存）が
`highlightedNodeId = null` で実行されてしまい、ハイライトが適用されない。

この null リセットは `activeView` ユニフィケーションリファクタリング時に導入された。
（ビュー切り替え時にハイライトをリセットする意図は正しいが、「切り替えと同時にハイライトも設定する」ケースが考慮されていなかった）

### 影響を受けるハンドラ

| ハンドラ | ナビゲーション先 | ハイライト対象 |
|---------|----------------|-------------|
| `handleDeployButtonClick` | deploy | サービスに対応する deploy コンテナ |
| `handleTeamButtonClick` | org | チームノード |
| `handleContainerClick` | system | コンテナに対応するサービス |
| `handleOwnedServiceClick` | system | 所有サービスノード |

## 制約・前提

- `SET_ACTIVE_VIEW` のリセット動作自体は必要：タブ切り替えやブレッドクラム操作時には
  ハイライトをクリアすべき
- React 18 の自動バッチングにより、1つのイベントハンドラ内の複数 dispatch は
  基本的に1回のレンダリングにまとめられる（タイミング依存のバグになり得る）
- `navigateActiveView` は History API との連携も担うため、シグネチャ変更の影響範囲を最小化したい

## 検討した選択肢

### 案1: `SET_ACTIVE_VIEW` に `highlightNodeId` フィールドを追加（採用）

アクション型にオプションフィールドを追加し、reducer で1回の状態遷移として処理する。

```ts
// app-reducer.ts — 型定義
| { type: "SET_ACTIVE_VIEW"; activeView: ActiveView; highlightNodeId?: string | null }

// app-reducer.ts — reducer
case "SET_ACTIVE_VIEW":
  return {
    ...state,
    activeView: action.activeView,
    viewPath: [],
    highlightedNodeId: action.highlightNodeId ?? null,
  };
```

呼び出し側（AppShell.tsx）では `SET_HIGHLIGHTED_NODE` の dispatch を削除し、
`dispatch({ type: "SET_ACTIVE_VIEW", activeView: "deploy", highlightNodeId: serviceId })` に統合する。

**メリット:**
- 状態遷移が1回のレンダリングで完結する（アトミック）
- `SET_ACTIVE_VIEW` without `highlightNodeId` では従来どおり `null` にリセットされる
- `navigateActiveView` のシグネチャ変更が不要（History 連携コードに影響しない）
- 変更範囲が最小（reducer 1行 + 呼び出し側 4箇所）

**デメリット:**
- `SET_ACTIVE_VIEW` アクションの責務が「ビュー切り替え」に加えて「ハイライト設定」まで広がる

---

### 案2: 専用の `NAVIGATE_WITH_HIGHLIGHT` アクションを追加

```ts
| { type: "NAVIGATE_WITH_HIGHLIGHT"; activeView: ActiveView; highlightNodeId: string }
```

reducer の `NAVIGATE_WITH_HIGHLIGHT` case でビュー切り替えとハイライト設定を一括処理。

**メリット:**
- `SET_ACTIVE_VIEW` の責務が汚染されない
- 意図が明示的

**デメリット:**
- 新しいアクション型の追加によりボイラープレートが増える
- 「ナビゲーション + ハイライト」と「ナビゲーションのみ」が別アクションになるため、
  今後ハンドラを追加する際に選択を誤るリスクがある

---

### 案3: `SET_ACTIVE_VIEW` での `null` リセットを削除

`highlightedNodeId` のリセットを別のアクション（CLEAR_HIGHLIGHT 等）に切り出し、
タブ切り替えなど「ハイライトをリセットしたい場面」で明示的に呼ぶ。

**メリット:**
- アクションの責務が単純になる

**デメリット:**
- ハイライトリセットが必要な全呼び出し箇所を洗い出す必要があり、
  見逃しによりハイライトが残り続けるバグのリスクがある

## 比較

| 観点 | 案1 `highlightNodeId` 追加 | 案2 専用アクション | 案3 null リセット削除 |
|------|:---:|:---:|:---:|
| アトミックな状態遷移 | ✅ | ✅ | △（呼び出し側で担保） |
| 変更範囲の最小化 | ✅ | ❌ | ❌ |
| 責務の明確さ | △ | ✅ | △ |
| ハイライト残存のリスク | なし | なし | あり（見逃しリスク） |
| `navigateActiveView` の変更不要 | ✅ | ✅ | ✅ |

## 決定方針

**案1（`SET_ACTIVE_VIEW` に `highlightNodeId` を追加）** を採用する。

変更範囲が最小で、アトミックな状態遷移を保証できる。
`highlightNodeId` を省略した場合は従来どおり `null` にリセットされるため、
既存のタブ切り替え動作に影響しない。

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `packages/app/src/state/app-reducer.ts` | `SET_ACTIVE_VIEW` 型に `highlightNodeId?` を追加、reducer で `action.highlightNodeId ?? null` を使用 |
| `packages/app/src/components/AppShell.tsx` | 4ハンドラで `navigateActiveView + SET_HIGHLIGHTED_NODE` を単一 dispatch に統合 |

## 未解決の問い

- `handleOwnedServiceClick` は `navigateViewPath` も呼ぶ複合ケース。
  `SET_VIEW_PATH` dispatch は `highlightedNodeId` に触れないため、
  `SET_ACTIVE_VIEW with highlightNodeId` → `SET_VIEW_PATH` の順で問題ない（確認済み）。
