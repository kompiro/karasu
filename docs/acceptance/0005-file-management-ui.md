---
type: product
---

# AT-0005: ファイル管理 UI

- **日付**: 2026-03-18
- **関連ADR**: なし
- **対象**: `packages/app/src/components/FileTree.tsx`、`packages/app/src/ProjectModeApp.tsx`、`packages/app/src/styles/app.css` — FileTree のファイル操作機能（作成・リネーム・削除）

## 概要

FileTree コンポーネントにファイル管理機能を追加する。ヘッダーのアクションボタンと右クリックコンテキストメニューにより、ファイル・ディレクトリの作成・リネーム・削除が可能になる。

## 受け入れ条件

### AC-1: ヘッダーアクションボタン

> 🟡 Partially automated — `packages/e2e/tests/at-0005-file-management-ui.spec.ts` › `header +File button creates a new .krs file (AC-1)` / `header +Dir button creates a new directory (AC-1)` / `Esc cancels the inline input without creating an entry (AC-1)`（エディタへの自動選択や入力欄の見え方などライブ UI の細部は手動）

- [ ] FileTree ヘッダーに [+File] と [+Dir] ボタンが表示される
- [ ] [+File] クリックでルートディレクトリにインライン入力欄が表示される
- [ ] Enter で空の `.krs` ファイルが作成され、エディタに自動選択される
- [ ] 拡張子なしの名前入力時に `.krs` が自動付与される
- [x] `.krs.style` 拡張子はそのまま維持される

> ✅ Automated — `packages/app/src/hooks/useFileTreeOps.test.ts` › `keeps the name as-is when it ends with .krs or .krs.style`

- [ ] [+Dir] クリックでインライン入力欄が表示され、Enter でディレクトリが作成される
- [ ] Esc でインライン入力がキャンセルされる
- [x] 空文字列の入力は無視される

> ✅ Automated — `packages/app/src/hooks/useFileTreeOps.test.ts` › `does nothing when the name is blank`

### AC-2: コンテキストメニュー

- [x] ファイルを右クリックで Rename / Delete メニューが表示される

> ✅ Automated — `packages/app/src/components/FileTree.test.tsx` › `file context menu offers only Rename/Delete`

- [x] ディレクトリを右クリックで New File / New Folder / Rename / Delete メニューが表示される

> ✅ Automated — `packages/app/src/components/FileTree.test.tsx` › `directory context menu offers New File/New Folder/Rename/Delete`

- [x] メニュー外クリックでメニューが閉じる

> ✅ Automated — `packages/e2e/tests/at-0005-context-menu-dismiss.spec.ts` › `clicking outside closes the context menu (AC-2)`

- [x] Esc キーでメニューが閉じる

> ✅ Automated — `packages/e2e/tests/at-0005-context-menu-dismiss.spec.ts` › `Esc closes the context menu (AC-2)`。
> 手動に残していた理由は「document レベルのリスナーは jsdom で安定再現できない」（`.claude/rules/testing.md`）というもので、これは jsdom の制約であって挙動の性質ではない。実ブラウザでは通常のイベントであり、かつこのメニューは Radix ではなく `FileTree.tsx` が `window` に自前で張ったリスナーなので「保証は Radix 側」という理由も当たらない。
> 併せて `the menu closes without performing a destructive action` が、閉じたのが Delete 等の発火の副作用ではないこと（ファイルが残り、rename 入力も開かない）を assert する。

### AC-3: リネーム

- [x] Rename でインライン入力欄に現在の名前が表示される

> ✅ Automated — `packages/app/src/components/FileTree.test.tsx` › `Rename flow renames the file and re-selects it`（インライン入力が現在名で pre-fill されることを含めて検証）

- [x] Enter で名前が変更される（ファイル内容は保持される）

> ✅ Automated — `packages/app/src/components/FileTree.test.tsx` › `Rename flow renames the file and re-selects it`

- [x] ディレクトリのリネームで中身が再帰的にコピーされる

> ✅ Automated — `packages/app/src/hooks/useFileTreeOps.test.ts` › `renames a directory by copying recursively and deleting the source`

- [x] リネーム対象がエディタで開かれている場合、新パスで再選択される

> 🟡 Partially automated — `packages/app/src/components/FileTree.test.tsx` › `Rename flow renames the file and re-selects it`（旧・新パスでの `onFileRenamed` 発火まで fence。ProjectModeApp 側でエディタが実際に新パスへ切り替わる様子は手動）

### AC-4: 削除

- [x] Delete で確認ダイアログが表示される

> ✅ Automated — `packages/app/src/components/FileTree.test.tsx` › `Delete confirms then removes and clears the editor`（`window.confirm` がファイル名入りメッセージで呼ばれることを検証。ダイアログの表示自体はブラウザ標準機能）

- [x] 確認後にファイル/ディレクトリが削除される

> 🟡 Partially automated — `packages/app/src/components/FileTree.test.tsx` › `Delete confirms then removes and clears the editor` と `packages/app/src/hooks/useFileTreeOps.test.ts` › `deletes and fires onFileDeleted when confirmed` / `skips deletion when the confirm hook returns false`（ファイル削除を fence。ディレクトリ削除の実挙動は手動）

- [x] 削除対象がエディタで開かれていた場合、エディタがクリアされる

> 🟡 Partially automated — `packages/app/src/components/FileTree.test.tsx` › `Delete confirms then removes and clears the editor`（削除パスでの `onFileDeleted` 発火まで fence。ProjectModeApp 側でエディタが実際にクリアされる様子は手動）

### AC-5: ディレクトリ操作

- [x] コンテキストメニューの New File でサブディレクトリにファイルが作成される

> ✅ Automated — `packages/app/src/components/FileTree.test.tsx` › `New File in a subdirectory creates the file there`

- [x] コンテキストメニューの New Folder でサブディレクトリが作成される

> ✅ Automated — `packages/app/src/components/FileTree.test.tsx` › `New Folder in a subdirectory creates the directory there`

### AC-6: ProjectModeApp 統合

- [x] ファイル作成後にエディタが新規ファイルを自動選択する（`onFileCreated`）

> 🟡 Partially automated — `packages/app/src/components/FileTree.test.tsx` › `New File in a subdirectory creates the file there`（作成パスでの `onFileCreated` 発火まで fence。ProjectModeApp 側の自動選択の実挙動は手動）

- [x] ファイル削除後にエディタがクリアされる（`onFileDeleted`、削除対象が開かれていた場合）

> 🟡 Partially automated — `packages/app/src/components/FileTree.test.tsx` › `Delete confirms then removes and clears the editor`（削除パスでの `onFileDeleted` 発火まで fence。エディタクリアの実挙動は手動）

- [x] ファイルリネーム後にエディタが新パスで再選択される（`onFileRenamed`、リネーム対象が開かれていた場合）

> 🟡 Partially automated — `packages/app/src/components/FileTree.test.tsx` › `Rename flow renames the file and re-selects it`（旧・新パスでの `onFileRenamed` 発火まで fence。再選択の実挙動は手動）

## 検証方法

```bash
# ビルド
npm run build                # 成功

# 全テスト
npx vitest run               # 159テスト全通過

# 手動検証（ブラウザ）
# 1. npm run dev で起動
# 2. [+File] ボタンで新規 .krs ファイル作成 → エディタに表示される
# 3. [+Dir] ボタンで新規ディレクトリ作成 → ツリーに表示される
# 4. ファイル右クリック → Rename → 名前変更 → エディタのパスも更新される
# 5. ファイル右クリック → Delete → 確認後削除 → エディタがクリアされる
# 6. ディレクトリ右クリック → New File → サブディレクトリにファイル作成
# 7. ディレクトリ右クリック → New Folder → サブディレクトリ作成
# 8. Esc でインライン入力がキャンセルされる
```
