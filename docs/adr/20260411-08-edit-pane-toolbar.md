# ADR-20260411-08: EditPaneToolbar — LeftPane アクションボタンの専用ツールバーへの集約

- **日付**: 2026-04-11
- **ステータス**: 決定済み
- **関連**: Issue #455, [ADR-20260411-04](20260411-04-edit-area-and-sidebar-toggle-relocation.md), [ADR-20260323-02](20260323-02-toolbar-icon-label.md)

## 背景

従来 `LeftPane` の Format ボタンは `LeftTabBar` の `rightContent` prop 経由でタブバーに埋め込まれていた。

```tsx
<LeftTabBar activeTab={activeTab} onTabChange={setActiveTab} rightContent={formatButton} />
```

この構造には 2 つの問題があった：

1. **関心の混在**: `LeftTabBar` の責務はタブナビゲーションのみであるべきだが、アクションボタンも同一行に同居していた
2. **スケーラビリティの欠如**: 今後タブごとに異なるアクション（例: ファイルツリーの Expand All / Collapse All）を追加する際に置き場所がなかった

## 決定

独立コンポーネントとしてツールバーを切り出す（案1）。`activeTab` と各アクションの props を受け取り、タブに応じたボタン群を描画する。

```tsx
interface EditPaneToolbarProps {
  activeTab: LeftTab;
  onFormat?: () => void;
  hasParseErrors?: boolean;
}

export function EditPaneToolbar({ activeTab, onFormat, hasParseErrors }: EditPaneToolbarProps) {
  if (activeTab !== "editor" || !onFormat) return null;

  return (
    <div className="edit-pane-toolbar">
      <button
        className="toolbar-btn toolbar-btn--actionable toolbar-btn--format"
        onClick={onFormat}
        disabled={hasParseErrors}
        title={hasParseErrors ? "Cannot format: source has parse errors" : "Format document (Shift+Alt+F)"}
      >
        ⌥ Format
      </button>
    </div>
  );
}
```

変更内容：

1. `LeftTabBar` から `rightContent` prop を削除
2. `LeftPane` に `<EditPaneToolbar>` を追加し、`formatButton` の JSX を移植
3. CSS に `.edit-pane-toolbar` を追加（`preview-toolbar` より小ぶりで左寄せのスタイル）
4. アクションがないタブでは `null` を返す（DOM 要素を生成しない）

### コンポーネント名について（設計時からのリネーム）

設計時の案1 では `LeftPaneToolbar` として検討していたが、実装時に `LeftPane` 全体の責務整理（ADR-20260411-04 の `EditArea` 導入）に合わせて **`EditPaneToolbar`** にリネームした。`EditArea > EditPane > EditPaneToolbar` という階層が名前から読み取れるようになり、`Edit*` ファミリーとして命名体系が統一された。

### 空ツールバーの振る舞い

アクションのないタブでは `null` を返し、DOM 要素を生成しない：

- **`null` 採用の理由**: 空の `div` を残すとボーダーや余白が残る可能性があり、レイアウト上のノイズになる。アクションがないタブでは「ツールバーが存在しない」のが意味的に正しい
- **懸念点**: タブ切り替え時にツールバーの有無でコンテンツ領域の高さが変わるが、Editor タブのみにアクションがある現状では UX 上許容する

### CSS 方針

`.edit-pane-toolbar` は `preview-toolbar` を参考にしつつ左寄せ・コンパクトなスタイル：

```css
.edit-pane-toolbar {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 10px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}
```

## 理由

- **関心の分離**: タブバーとアクションボタンの責務が明確に分かれ、`LeftTabBar` がタブナビゲーションのみの責務を持てる
- **一元管理**: 「どのタブにどのアクションが対応するか」を `EditPaneToolbar` が一箇所で管理する
- **将来の拡張性**: タブが増えても `EditPaneToolbar` に分岐を追加するだけで拡張できる（Chat / Settings / ファイルツリー等）
- **ADR-20260411-04 との命名一貫性**: `EditArea` / `EditPane` / `EditPaneToolbar` の `Edit*` ファミリーで階層関係が名前から読み取れる
- **テスト容易性**: 独立コンポーネントとして切り出すことでユニットテストが書きやすくなる

## 却下した案

### 案2: `LeftPane` 内でインラインに条件分岐する

独立コンポーネントを作らず `LeftPane` の JSX 内で直接ボタンを描画する案。ファイル数は増えないが、タブごとのアクション定義が `LeftPane` に分散し、タブが増えるにつれて肥大化する。テストが `LeftPane` に集中して分離しにくい。

### 案3: `LeftTabBar` の `rightContent` を継続利用しつつ CSS で位置調整

`rightContent` を残したまま別行に見せる案。見た目は変わっても根本的な関心の混在が解消されない。
