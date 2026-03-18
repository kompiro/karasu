# AT-0004: プロジェクト管理と OPFS

- **日付**: 2026-03-18
- **関連ADR**: なし
- **対象**: `packages/app/src/fs/`、`packages/app/src/state/`、`packages/app/src/components/`、`packages/app/src/App.tsx` — OPFS プロバイダ、プロジェクト管理、モード切替 UI

## 概要

OPFS（Origin Private File System）によるプロジェクトの永続化と管理 UI を導入する。OPFS 非対応ブラウザでは既存の単一ファイル編集モード（MemoryModeApp）にフォールバックし、回帰なく動作する。

## 受け入れ条件

### AC-1: ProjectSelector UI

- [ ] ドロップダウンにプロジェクト一覧が表示される
- [ ] ドロップダウンでプロジェクトを切り替えられる
- [ ] 「+ New」ボタンで名前入力フィールドが表示され、Enter または OK で作成される
- [ ] 「Delete」ボタンで確認ダイアログ後にプロジェクトが削除される

### AC-2: FileTree UI

- [ ] プロジェクトのルートディレクトリ配下のファイル・ディレクトリが一覧表示される
- [ ] ディレクトリクリックで展開/折りたたみが切り替わる
- [ ] ファイルクリックで `onSelectFile` が呼ばれる
- [ ] 現在選択中のファイルがハイライトされる

### AC-3: ProjectModeApp — 初期化と統合

- [ ] 初回起動時（プロジェクト0件）に「Getting Started」プロジェクトが自動作成される
- [ ] 起動時に前回開いたプロジェクトが localStorage から復元される
- [ ] プロジェクト切り替え時に `index.krs` が自動的に選択・表示される
- [ ] エディタでの編集が OPFS に自動保存される
- [ ] 編集後にプレビューがリアルタイム更新される
- [ ] ドリルダウンとブレッドクラムが正常に動作する
- [ ] ワーニングパネルに警告が表示される

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
