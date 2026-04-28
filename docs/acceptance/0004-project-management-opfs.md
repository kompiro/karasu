---
type: product
---

# AT-0004: プロジェクト管理と OPFS

- **日付**: 2026-03-18
- **関連ADR**: なし
- **対象**: `packages/app/src/fs/`、`packages/app/src/state/`、`packages/app/src/components/`、`packages/app/src/App.tsx` — OPFS プロバイダ、プロジェクト管理、モード切替 UI

## 概要

OPFS（Origin Private File System）によるプロジェクトの永続化と管理 UI を導入する。OPFS 非対応ブラウザでは既存の単一ファイル編集モード（MemoryModeApp）にフォールバックし、回帰なく動作する。

## 受け入れ条件

### AC-1: ProjectSelector UI

- [x] ドロップダウンにプロジェクト一覧が表示される
> ✅ Automated — `packages/e2e/tests/at-0004-project-management-opfs.spec.ts` › `dropdown lists seeded projects in the order they were written`

- [x] ドロップダウンでプロジェクトを切り替えられる
> ✅ Automated — `packages/e2e/tests/at-0004-project-management-opfs.spec.ts` › `lastProjectId in localStorage restores the previously selected project`

- [x] 「+ New」ボタンで名前入力フィールドが表示され、Enter または OK で作成される
> ✅ Automated — `packages/e2e/tests/at-0004-project-management-opfs.spec.ts` › `+ New flow creates a project and persists it to OPFS`

- [x] 「Delete」ボタンで確認ダイアログ後にプロジェクトが削除される
> ✅ Automated — `packages/e2e/tests/at-0004-project-management-opfs.spec.ts` › `✕ Delete with confirm removes the project from the dropdown and OPFS`

### AC-2: FileTree UI

- [x] プロジェクトのルートディレクトリ配下のファイル・ディレクトリが一覧表示される
> ✅ Automated — `packages/e2e/tests/at-0004-project-management-opfs.spec.ts` › `FileTree lists files at the project root and toggles directory expansion`

- [x] ディレクトリクリックで展開/折りたたみが切り替わる
> ✅ Automated — `packages/e2e/tests/at-0004-project-management-opfs.spec.ts` › `FileTree lists files at the project root and toggles directory expansion`

- [x] ファイルクリックで `onSelectFile` が呼ばれる
> ✅ Automated — `packages/e2e/tests/at-0004-project-management-opfs.spec.ts` › `FileTree click switches the editor and applies the selected highlight`

- [x] 現在選択中のファイルがハイライトされる
> ✅ Automated — `packages/e2e/tests/at-0004-project-management-opfs.spec.ts` › `FileTree click switches the editor and applies the selected highlight`

### AC-3: ProjectModeApp — 初期化と統合

- [ ] 初回起動時（プロジェクト0件）に `01-system`〜`07-cross-system` の 7 プロジェクトが自動作成される
- [ ] 初回起動時、`01-system` プロジェクトが選択状態になり `index.krs` が表示される
- [ ] `05-multifile` / `06-deploy` / `07-cross-system` でファイルツリーに複数ファイルが表示され、import が正常に解決される
- [x] 起動時に前回開いたプロジェクトが localStorage から復元される
> ✅ Automated — `packages/e2e/tests/at-0004-project-management-opfs.spec.ts` › `lastProjectId in localStorage restores the previously selected project`

- [x] プロジェクト切り替え時に `index.krs` が自動的に選択・表示される
> ✅ Automated — `packages/e2e/tests/at-0004-project-management-opfs.spec.ts` › `FileTree click switches the editor and applies the selected highlight`

- [x] エディタでの編集が OPFS に自動保存される
> ✅ Automated — `packages/e2e/tests/at-0004-project-management-opfs.spec.ts` › `editor edits autosave to OPFS`

- [ ] 編集後にプレビューがリアルタイム更新される
- [ ] ドリルダウンとブレッドクラムが正常に動作する
- [ ] ワーニングパネルに警告が表示される

> AC-3 の未チェック項目について:
>
> - 「7 プロジェクト自動作成」「`01-system` 選択状態」「multifile imports 解決」は、
>   E2E 側では「empty OPFS から複数プロジェクトが seed される」までを下限値で
>   検証している（具体的な名称・件数は example pack の改編で揺れるためユニット
>   テスト側でカバー: `packages/app/src/hooks/useProjectInitialization.test.ts`）。
> - 「プレビューがリアルタイム更新」は視覚判定が必要なため AI / 人間レビューに残す。
> - 「ドリルダウン・ブレッドクラム」は AT-0029 / AT-0030 で、「ワーニングパネル」
>   は AT-0045 / AT-0057 で別途自動化されている。

## 検証方法

```bash
# ユニットテスト（ProjectManager）
npx vitest run packages/app/src/fs/project-manager.test.ts  # 9テスト

# 全テスト
npx vitest run                                               # 159テスト全通過

# ビルド
npm run build                                                # 成功

# 手動検証（ブラウザ）
# 1. npm run dev で起動
# 2. OPFS モード: プロジェクト作成 → ファイル選択 → 編集 → プレビュー確認
# 3. InMemory モード: DevTools Console で以下を実行後リロード
#    delete navigator.storage
#    → MemoryModeApp が表示されることを確認
```
