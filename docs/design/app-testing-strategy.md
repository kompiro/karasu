# app パッケージのテスト戦略

- **日付**: 2026-03-26
- **ステータス**: 検討中
- **関連**: Issue #40（@testing-library/react 導入）、ADR-0008、ADR-0009

## 背景・課題

Issue #40 で `@testing-library/react` を導入し、`PreviewPane` のコンポーネントテストを追加した。
次のステップとして、どのコンポーネント・hookにテストを追加するか、どの粒度で書くかを整理する。

---

## renderHook とは

`@testing-library/react` の `renderHook` は、カスタムフックを単体でテストするためのユーティリティ。
フルコンポーネントを用意せず、フックの戻り値を直接検証できる。

```typescript
import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';

it('300ms デバウンスでコンパイルされる', () => {
  vi.useFakeTimers();

  const { result, rerender } = renderHook(
    ({ source }) => useKarasu(source, '', []),
    { initialProps: { source: 'system "A" {}' } }
  );

  rerender({ source: 'system "B" {}' });

  // まだコンパイルされていない（旧 SVG のまま）
  expect(result.current.svg).toContain('"A"');

  // 300ms 進める
  act(() => { vi.advanceTimersByTime(300); });

  // コンパイル完了
  expect(result.current.svg).toContain('"B"');

  vi.useRealTimers();
});
```

`renderHook` のポイント：
- `result.current` でフックの戻り値にアクセス
- `rerender({ ...newProps })` でプロパティを更新
- 状態変更を伴う操作は `act()` で囲む
- タイマー依存のコードは `vi.useFakeTimers()` と組み合わせる

---

## テスト追加の優先候補

### テストの粒度方針

ARIA 属性・ロール・ラベルまで検証する「ユーザー視点テスト」を基本とする。
`getByRole`, `getByLabelText` などを積極的に使い、実装の内部詳細（className など）に依存しない。

```typescript
// ❌ 実装依存
expect(tab).toHaveClass('active');

// ✓ ユーザー視点
expect(getByRole('tab', { name: 'System', selected: true })).toBeInTheDocument();
```

### 優先度 高

| 対象 | テスト内容 | 理由 |
|------|-----------|------|
| `Breadcrumb` | クリックで viewPath が正しく切り詰められる / 最終項目は非インタラクティブ | ロジックが純粋で副作用なし |
| `DiagramTabBar` | タブ選択で onChange が正しい引数で呼ばれる / deploy タブの disabled 状態 | ARIA role="tablist" の検証が有効 |
| `WarningPanel` | 空のとき null / 折り畳みトグル / アイコン種別 | 状態遷移が明確 |

### 優先度 中

| 対象 | テスト内容 | 理由 |
|------|-----------|------|
| `NodeDetailPanel` | DOMPurify によるサニタイズ / stopPropagation / マークダウン変換 | セキュリティ観点で有益 |
| `ReferencePanel` | タブ切り替え / コピーボタンの 2 秒フィードバック | タイマーモックで対応可 |
| `useKarasu` / `useOrgView` | デバウンス / エラー時に前回 SVG を保持 | `renderHook` + `vi.useFakeTimers` |

### 優先度 低（後回し）

| 対象 | 理由 |
|------|------|
| `EditorPane` | Monaco Editor は jsdom で動作しない |
| `FileTree` | OPFS 依存、FS のモックコストが高い |
| `App` / `ProjectModeApp` | 統合テスト的性格、E2E 不採用（ADR-0008）と競合 |
