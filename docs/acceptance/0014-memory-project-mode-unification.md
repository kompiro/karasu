---
type: product
---

# AT-0014: MemoryModeApp and ProjectModeApp Unification

- **日付**: 2026-03-26
- **関連ADR**: なし
- **対象**: `packages/app/src/MemoryModeApp.tsx`, `packages/app/src/ProjectModeApp.tsx`, `packages/app/src/components/KarasuPreviewColumn.tsx`, `packages/app/src/components/DiagramTabBar.tsx`, `packages/app/src/state/app-reducer.ts`, `packages/app/src/components/ReferencePanel.tsx`, `packages/core/src/builtins/reference.ts`

## 概要

`MemoryModeApp`（OPFS非対応ブラウザ向けモード）を `useAppContext` + `KarasuPreviewColumn` ベースに統一し、`ProjectModeApp` と同等の3ビュー機能（System / Deploy / Org）を提供する。併せて `ReferencePanel` に Samples タブを追加する。

## 受け入れ条件

### AC-1: MemoryModeApp の3ビュー表示

- [ ] MemoryModeApp 起動時（OPFS非対応ブラウザ）に DiagramTabBar が表示され、System / Deploy / Org の3つのタブが存在すること
- [ ] System タブがデフォルトで選択された状態で起動すること
- [ ] Deploy タブをクリックすると Deploy ダイアグラムが表示されること（サンプルの `deploy "本番環境"` ブロックが描画される）
- [ ] Org タブをクリックすると Org ダイアグラムが表示されること（サンプルの `organization "EC開発組織"` ブロックが描画される）
- [ ] System タブをクリックすると System ダイアグラムに戻ること

### AC-2: MemoryModeApp のクロスナビゲーション

- [ ] Deploy ビューで deploy コンテナ（`oci "ecommerce-app"` 等）をクリックすると、System ビューへ自動的に切り替わること
- [ ] System ビューに切り替わった後、`realizes` で参照しているサービス（`ECommerce` 等）がハイライト表示されること
- [ ] ハイライトは別のノードをクリックまたはドリルダウンすることで解除されること

### AC-3: MemoryModeApp のエディタ連携

- [ ] Monaco エディタで `.krs` を編集すると、System / Deploy / Org タブそれぞれの図が更新されること
- [ ] エディタに `deploy` ブロックを削除すると Deploy タブが無効化（グレーアウト）されること
- [ ] エディタに `organization` ブロックを削除すると Org タブをクリックしても空の図が表示されること（エラーにならないこと）

### AC-4: ProjectModeApp のリグレッション

- [ ] ProjectModeApp で System / Deploy / Org タブが正常に切り替わること
- [ ] ProjectModeApp でドリルダウン後にタブを切り替えるとドリルダウンがリセットされること（`viewPath: []`）
- [ ] ProjectModeApp でクロスナビゲーション（Deploy → System ハイライト）が正常に動作すること
- [ ] ProjectModeApp で Org の BreadcrumbBar が Org タブ選択時のみ表示されること

### AC-5: ReferencePanel の Samples タブ

- [ ] ReferencePanel（ヘルプアイコンから開く）に "Samples" タブが表示されること
- [ ] Samples タブをクリックすると `system`, `deploy`, `organization` の各ブロックを含むサンプル KRS が表示されること
- [ ] Samples タブの Copy ボタンをクリックするとクリップボードにサンプル全文がコピーされ、ボタンラベルが "Copied!" に変わること
- [ ] 2秒後にボタンラベルが "Copy" に戻ること
- [ ] MemoryModeApp・ProjectModeApp どちらのモードでも Samples タブが参照できること

## 検証方法

### 自動テスト

```bash
cd .worktrees/memory-project-unification
npm test          # 373 tests pass
npm run typecheck # no errors
npm run lint      # no errors
npm run build     # build succeeds
```

### 手動確認

1. `npm run dev` でアプリを起動する
2. **MemoryModeApp** を確認するには、OPFS が無効なブラウザ（Firefox Private Window など）またはローカル環境で `detectStorageMode()` が `"memory"` を返す状態でアクセスする
   - AC-1〜AC-3 を確認する
3. **ProjectModeApp** を確認するには、OPFS 対応ブラウザ（Chrome / Edge）でアクセスする
   - AC-4 を確認する
4. どちらのモードでも BreadcrumbBar の「？」アイコンをクリックして ReferencePanel を開く
   - AC-5 を確認する
