# ADR-20260326-04: `packages/app` のテスト戦略 — `@testing-library/react` + renderHook + ARIA

- **日付**: 2026-03-26
- **ステータス**: 決定済み
- **関連**: Issue #40, [ADR-20260324-01](20260324-01-manual-qa-over-e2e.md), [ADR-20260325-01](20260325-01-testing-library-react.md)

## 背景

ADR-20260325-01 / Issue #40 で `@testing-library/react` を導入し、`PreviewPane` のコンポーネントテストを追加した。次のステップとして、どのコンポーネント・hook にテストを追加するか、どの粒度で書くかを整理する必要があった。

## 決定

### テストの粒度方針

ARIA 属性・ロール・ラベルまで検証する**ユーザー視点テスト**を基本とする。`getByRole`, `getByLabelText` を積極的に使い、実装の内部詳細（className など）に依存しない。

```typescript
// ❌ 実装依存
expect(tab).toHaveClass('active');

// ✓ ユーザー視点
expect(getByRole('tab', { name: 'System', selected: true })).toBeInTheDocument();
```

### hook テストには `renderHook` + `vi.useFakeTimers`

タイマー依存のコードは fake timers と組み合わせ、`act()` で状態変更を囲む：

```typescript
const { result, rerender } = renderHook(
  ({ source }) => useKarasu(source, '', []),
  { initialProps: { source: 'system "A" {}' } }
);
rerender({ source: 'system "B" {}' });
act(() => { vi.advanceTimersByTime(300); });
expect(result.current.svg).toContain('"B"');
```

### 優先度

| 優先度 | 対象 | 内容 |
|---|---|---|
| 高 | `Breadcrumb` | クリックで viewPath が切り詰められる、最終項目は非インタラクティブ |
| 高 | `DiagramTabBar` | タブ選択で `onChange` が呼ばれる、`role="tablist"` の検証 |
| 高 | `WarningPanel` | 空のとき null / 折り畳みトグル / アイコン種別 |
| 中 | `NodeDetailPanel` | DOMPurify サニタイズ、stopPropagation、Markdown 変換 |
| 中 | `ReferencePanel` | タブ切替、コピーボタンの 2 秒フィードバック |
| 中 | `useKarasu` / `useOrgView` | デバウンス、エラー時の前回 SVG 保持 |
| 低 | `EditorPane` | Monaco Editor は jsdom で動作しない |
| 低 | `FileTree` | OPFS 依存、モックコスト高 |
| 低 | `App` / `ProjectModeApp` | 統合テスト的性格、E2E 不採用（ADR-20260324-01）と競合 |

## 理由

- **ARIA 視点テスト**: リファクタで className が変わっても壊れない。スクリーンリーダー対応の質も維持できる
- **hook を `renderHook` で分離**: フルコンポーネントを組み立てずにビジネスロジックを検証できる。タイマー・状態遷移のテストが圧倒的に書きやすい
- **優先度付け**: 純粋なロジックコンポーネント（`Breadcrumb` / `DiagramTabBar` / `WarningPanel`）と `renderHook` でテスト可能な hook から着手することで投資対効果が高い
- **E2E は不採用** (ADR-20260324-01): `App` / `ProjectModeApp` のような統合テスト的性格のコンポーネントは手動 QA で担保する

## 却下された対象（明示的に後回し）

- **EditorPane** — Monaco Editor は jsdom で動作しないため、ユニットテスト不可。手動 QA 対応
- **FileTree** — OPFS 依存で FS モックコストが高い。`InMemoryFileSystemProvider` 成熟後に再検討
- **App / ProjectModeApp** — 統合テストは E2E 不採用方針 (ADR-20260324-01) と競合する
