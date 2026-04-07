# ProjectSelector UI 操作設計（作成・リネーム・削除）

- **日付**: 2026-04-07
- **ステータス**: 検討中
- **関連**: [プロジェクトとファイルシステム抽象化](./project-and-filesystem.md), [Issue #357](https://github.com/kompiro/karasu/issues/357)

## 背景・課題

`ProjectModeApp` のサイドバー上部には `ProjectSelector` コンポーネントがあり、
プロジェクトの**切り替え**（ドロップダウン）・**作成**（+ New）・**削除**（Delete）が実装済みである。

しかし**リネーム操作が欠けている**。ユーザーは一度作成したプロジェクトの名前を変更できない。

バックエンド（`ProjectManager.renameProject`）と状態管理（`RENAME_PROJECT` reducer action）は実装済みであり、
不足しているのは UI レイヤーのみである。

この設計ドキュメントでは ProjectSelector の3操作（作成・リネーム・削除）を整理し、
リネームの UI パターンについて検討する。

## 制約・前提

- `ProjectSelector` はサイドバー最上部の横長バーに配置される（高さ固定）
- 既存のスタイルクラス（`.project-selector-btn`, `.project-selector-input`）を流用する
- ツールバーボタンルール（ADR-0007）: アイコン + テキストラベルの組み合わせ必須（アイコン単体不可）
- ただし `ProjectSelector` は toolbar ではなく sidebar 内の操作バーであり、
  `toolbar-btn` クラスではなく `project-selector-btn` クラスを使う独立した UI 系統
- `ProjectManager.renameProject(id, newName)` は実装済み
- `RENAME_PROJECT` reducer action は実装済み
- `onRenameProject` prop は `ProjectSelector` に未追加

## 現状の UI レイアウト

```
[ 鴉 ] [ ECプラットフォーム ▼ ] [ + New ] [ Delete ]
```

通常時: ドロップダウン + アクションボタン群
作成時: ドロップダウンが消え、入力欄 + OK + Cancel に切り替わる

```
[ 鴉 ] [ ________入力欄________ ] [ OK ] [ Cancel ]
```

この「アクション発火 → インライン入力欄に切り替え → 確定/キャンセル」のパターンが
既存の作成フローで確立されている。

## 検討した選択肢

### 案1: Rename ボタン + インライン入力（既存パターンを踏襲）

`+ New` / `Delete` ボタンの隣に `✎ Rename` ボタンを追加する。
クリックすると、作成フローと同様にドロップダウンがインライン入力欄（現在名が初期値）に切り替わる。
Enter で確定、Esc でキャンセル。

```
通常時:
[ 鴉 ] [ ECプラットフォーム ▼ ] [ + New ] [ ✎ Rename ] [ Delete ]

リネーム中:
[ 鴉 ] [ _ECプラットフォーム_ ] [ OK ] [ Cancel ]
```

```tsx
// isRenaming フラグを追加し、既存の isCreating と対称に扱う
const [isRenaming, setIsRenaming] = useState(false);
const [renameValue, setRenameValue] = useState("");

const handleRenameStart = () => {
  setRenameValue(currentProject?.name ?? "");
  setIsRenaming(true);
};
```

**メリット**:
- 既存の create フローと完全に対称なパターン。実装コストが低い
- CSS の追加不要（`.project-selector-input` / `.project-selector-btn` をそのまま流用）
- 発見しやすい（ボタンとして常に見える）

**デメリット**:
- ボタンが3つ（+ New / Rename / Delete）になり、やや横幅を圧迫する
- 作成中とリネーム中で同じインライン入力欄を流用するため、isCreating / isRenaming の排他制御が必要

### 案2: ダブルクリックでリネーム（ドロップダウンをその場で編集）

プロジェクト名のドロップダウンをダブルクリックすると、入力欄に変わる。
ボタンを増やさず、「名前をダブルクリックで編集」という慣習的な操作感を採用する。

```
[ 鴉 ] [ _ECプラットフォーム_ ]  ← ダブルクリック後に input に切り替わる
```

**メリット**:
- ボタンを増やさず、横幅を増やさない
- macOS Finder・VS Code サイドバーなど、ダブルクリックによるリネームはよく知られた操作

**デメリット**:
- `<select>` 要素のダブルクリックはブラウザ依存の挙動があり、信頼性が低い
- ダブルクリックはアフォーダンスがなく発見しにくい
- `select` → `input` の DOM 切り替えに追加の状態管理が必要（案1と同等かそれ以上のコード量）

### 案3: ドロップダウンをクリック可能テキスト + 別セレクト UI に分解

プロジェクト名の表示部分をクリック可能なテキスト（`<button>` or `<span>`）として独立させ、
プロジェクト切り替えは別の UI（ポップオーバーやメニュー）にする。

**メリット**:
- プロジェクト名のシングルクリック編集が自然に実現できる
- 将来的な拡張（プロジェクトアイコン追加など）にも対応しやすい

**デメリット**:
- 現在の `<select>` ドロップダウンという確立された UI の大幅な置き換えが必要
- 実装コストが高く、Issue #357 の scope を大きく超える
- ポップオーバーの UX 設計が別途必要

## 比較

| 観点 | 案1: Rename ボタン | 案2: ダブルクリック | 案3: UI 再設計 |
|------|-------------------|-------------------|---------------|
| 発見しやすさ | 高い（ボタン表示） | 低い（隠れた操作） | 高い |
| 実装コスト | 低い | 中程度 | 高い |
| 既存 UI との一貫性 | 高い（create と対称） | 中程度 | 低い（破壊的変更） |
| 横幅への影響 | あり（ボタン1つ追加） | なし | 大幅に変わる |
| ブラウザ互換性 | 問題なし | select の挙動に依存 | 問題なし |
| scope の適切さ | Issue #357 相当 | Issue #357 相当 | 過大 |

## 現時点の方針

**案1（Rename ボタン + インライン入力）を採用する。**

理由:
1. 既存の create フローと完全に対称であり、ユーザーが操作を類推できる
2. 実装コストが最も低く、既存 CSS クラスをそのまま流用できる
3. ボタンとして常に見えるため発見しやすい
4. `<select>` のダブルクリックはブラウザ挙動が不安定であり、案2はリスクがある

### 実装方針

`ProjectSelector` コンポーネントへの変更:

```tsx
interface ProjectSelectorProps {
  // ...既存 props
  onRenameProject: (id: string, newName: string) => void;  // 追加
}
```

状態管理:
- `isCreating` と `isRenaming` を独立したフラグとして持つ（一方が true の時に他方は false）
- `renameValue` を追加（現在プロジェクト名で初期化）

ボタン配置:
```
[ 鴉 ] [ Project A ▼ ] [ + New ] [ ✎ Rename ] [ 🗑 Delete ]
```

インライン入力（リネーム中）:
```
[ 鴉 ] [ ____Project A____ ] [ OK ] [ Cancel ]
```

バリデーション:
- 空文字列・空白のみの場合は OK ボタンを disabled にする
- 現在名と同じ場合は OK ボタンを disabled にする（変更なしのため）

### `ProjectModeApp` への変更

```tsx
const handleRenameProject = useCallback(
  async (id: string, newName: string) => {
    const updated = await pm.renameProject(id, newName);
    dispatch({ type: "RENAME_PROJECT", id, name: updated.name });
  },
  [pm, dispatch],
);
```

## 未解決の問い

- ボタンラベルのアイコンは何が適切か？（`✎`・`✏`・`≡`・テキストのみ "Rename"）
  - 現在の "+ New" / "Delete" はアイコンなしのテキストのみ。一貫性のためテキストのみが自然か
- 横幅が狭いとき（サイドバーが折りたたまれている場合など）のボタン省略の扱いは？
  - 現状 `sidebar-collapsed` 時は `.project-selector` ごと非表示になるため問題なし
- 現在名と同じ名前で OK した場合は API を呼ばないべきか、呼んでも OK か？
  - `updatedAt` が更新されるが副作用は小さいため、disabled 制御のみで十分
