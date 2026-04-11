# LeftPaneToolbar — LeftPane アクションボタンの専用ツールバーへの集約

- **日付**: 2026-04-11
- **ステータス**: 検討中
- **関連**: [Issue #455](https://github.com/kompiro/karasu/issues/455)

## 背景・課題

現在、`LeftPane` の Format ボタンは `LeftTabBar` の `rightContent` prop 経由でタブバーに埋め込まれている。

```tsx
// LeftPane.tsx — 現状
<LeftTabBar activeTab={activeTab} onTabChange={setActiveTab} rightContent={formatButton} />
```

この構造には2つの問題がある。

1. **関心の混在**: `LeftTabBar` の責務はタブナビゲーションのみであるべきだが、アクションボタンも同一行に同居している。
2. **スケーラビリティの欠如**: 今後タブごとに異なるアクション（例: ファイルツリーの Expand All / Collapse All）を追加する際に置き場所がない。

## 制約・前提

- ツールバーボタンは icon + text label 必須（ADR 0007、`app-ui.md`）
- Format ボタンは既存の `toolbar-btn toolbar-btn--actionable toolbar-btn--format` クラス構成を維持する
- Editor タブ以外（Chat / Settings）はアクションボタンが現時点でないため、ツールバーエリアは空 or 非表示にする
- 将来的にタブごとのアクションが増えることを前提とした設計にする

## 検討した選択肢

### 案1: `LeftPaneToolbar` を独立コンポーネントとして切り出す（採用案）

`activeTab` と各アクションの props を受け取り、タブに応じたボタン群を描画する新コンポーネントを作成する。

```tsx
// LeftPaneToolbar.tsx
interface LeftPaneToolbarProps {
  activeTab: LeftTab;
  onFormat?: () => void;
  hasParseErrors?: boolean;
}

export function LeftPaneToolbar({ activeTab, onFormat, hasParseErrors }: LeftPaneToolbarProps) {
  if (activeTab !== "editor" || !onFormat) return null;

  return (
    <div className="left-pane-toolbar">
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

`LeftPane.tsx` での使用:

```tsx
<LeftTabBar activeTab={activeTab} onTabChange={setActiveTab} />
<LeftPaneToolbar activeTab={activeTab} onFormat={onFormat} hasParseErrors={hasParseErrors} />
{activeTab === "editor" && <EditorPane ... />}
```

**メリット**:
- タブバーとアクションボタンの関心が分離される
- `LeftPaneToolbar` が「どのタブにどのアクションが対応するか」を一元管理する
- 将来タブが増えても `LeftPaneToolbar` に分岐を追加するだけで拡張できる

**デメリット**:
- ファイルが1つ増える（軽微）

### 案2: `LeftPane` 内でインラインに条件分岐する

独立コンポーネントは作らず、`LeftPane` の JSX 内で直接ボタンを描画する。

```tsx
// LeftPane.tsx
{activeTab === "editor" && onFormat && (
  <div className="left-pane-toolbar">
    <button className="toolbar-btn toolbar-btn--actionable toolbar-btn--format" ...>
      ⌥ Format
    </button>
  </div>
)}
```

**メリット**:
- ファイル数が増えない

**デメリット**:
- タブごとのアクション定義が `LeftPane` に分散し、タブが増えるにつれて肥大化する
- テストが `LeftPane` に集中して分離しにくい

### 案3: `LeftTabBar` の `rightContent` を継続利用しつつ配置だけ変える

`rightContent` を残したまま CSS で位置調整し、別行に見せる。

**デメリット**:
- 見た目は変わっても根本的な関心の混在が解消されない
- 採用しない。

## 比較

| 観点 | 案1（独立コンポーネント） | 案2（インライン） | 案3（CSS調整） |
|------|--------------------------|-----------------|----------------|
| 関心の分離 | ◎ | △ | ✗ |
| 将来の拡張性 | ◎ | △ | ✗ |
| テスト容易性 | ◎ | △ | ✗ |
| コード量 | △（ファイル増） | ◎ | ◎ |

## 現時点の方針

**案1（独立コンポーネント）を採用する。**

`LeftPaneToolbar` を新規作成し、以下の変更を行う:

1. `LeftTabBar` から `rightContent` prop を削除する
2. `LeftPane` に `<LeftPaneToolbar>` を追加し、`formatButton` の JSX を移植する
3. CSS に `.left-pane-toolbar` を追加する（`preview-toolbar` より小ぶりで左寄せのスタイル）
4. アクションがないタブでは `null` を返す（DOM要素を生成しない）

### 空ツールバーの振る舞い: `null` vs 空コンテナ

アクションのないタブでは `null` を返し、DOM 要素を生成しない。

- **`null` 採用の理由**: 空の `div` を残すとボーダーや余白が残る可能性があり、レイアウト上のノイズになる。アクションがないタブでは「ツールバーが存在しない」のが意味的に正しい。
- **懸念点**: タブ切り替え時にツールバーの有無でコンテンツ領域の高さが変わる。ただし、現時点では Editor タブのみにアクションがあり、頻繁に切り替える UX は想定内であるため許容する。

### CSS 方針

`.left-pane-toolbar` は `preview-toolbar` を参考にしつつ左寄せ・コンパクトなスタイルにする:

```css
.left-pane-toolbar {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 10px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}
```

## 未解決の問い

なし。
