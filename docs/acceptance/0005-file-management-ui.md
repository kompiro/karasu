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

> 🟡 Partially automated — `packages/e2e/tests/at-0005-file-management-ui.spec.ts` › `header +File button creates a new .krs file (AC-1)` / `header +Dir button creates a new directory (AC-1)` / `Esc cancels the inline input without creating an entry (AC-1)`（`.krs.style` 拡張子の維持と空文字無視は手動）

- [ ] FileTree ヘッダーに [+File] と [+Dir] ボタンが表示される
- [ ] [+File] クリックでルートディレクトリにインライン入力欄が表示される
- [ ] Enter で空の `.krs` ファイルが作成され、エディタに自動選択される
- [ ] 拡張子なしの名前入力時に `.krs` が自動付与される
- [ ] `.krs.style` 拡張子はそのまま維持される
- [ ] [+Dir] クリックでインライン入力欄が表示され、Enter でディレクトリが作成される
- [ ] Esc でインライン入力がキャンセルされる
- [ ] 空文字列の入力は無視される

### AC-2: コンテキストメニュー

- [ ] ファイルを右クリックで Rename / Delete メニューが表示される
- [ ] ディレクトリを右クリックで New File / New Folder / Rename / Delete メニューが表示される
- [ ] メニュー外クリックでメニューが閉じる
- [ ] Esc キーでメニューが閉じる

> manual / visual review — 右クリックメニューの表示・項目の出し分け・閉じる挙動はライブブラウザ操作で確認する。

### AC-3: リネーム

- [ ] Rename でインライン入力欄に現在の名前が表示される
- [ ] Enter で名前が変更される（ファイル内容は保持される）
- [ ] ディレクトリのリネームで中身が再帰的にコピーされる
- [ ] リネーム対象がエディタで開かれている場合、新パスで再選択される

> manual / visual review — Rename フローのインライン入力・ディレクトリ再帰コピー・エディタ再選択は UI とファイルシステムの実挙動を目視確認する。

### AC-4: 削除

- [ ] Delete で確認ダイアログが表示される
- [ ] 確認後にファイル/ディレクトリが削除される
- [ ] 削除対象がエディタで開かれていた場合、エディタがクリアされる

> manual / visual review — 削除確認ダイアログとエディタクリアの連動はブラウザ操作で確認する。

### AC-5: ディレクトリ操作

- [ ] コンテキストメニューの New File でサブディレクトリにファイルが作成される
- [ ] コンテキストメニューの New Folder でサブディレクトリが作成される

> manual / visual review — ディレクトリ配下への New File / New Folder 作成はツリー操作とファイルシステム反映を目視確認する。

### AC-6: ProjectModeApp 統合

- [ ] ファイル作成後にエディタが新規ファイルを自動選択する（`onFileCreated`）
- [ ] ファイル削除後にエディタがクリアされる（`onFileDeleted`、削除対象が開かれていた場合）
- [ ] ファイルリネーム後にエディタが新パスで再選択される（`onFileRenamed`、リネーム対象が開かれていた場合）

> manual / visual review — FileTree → ProjectModeApp 間のコールバック連動はブラウザ操作で確認する受入観点。

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
