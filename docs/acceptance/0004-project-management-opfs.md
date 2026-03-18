# AT-0004: プロジェクト管理と OPFS

- **日付**: 2026-03-18
- **関連ADR**: なし
- **対象**: `packages/app/src/fs/`、`packages/app/src/state/`、`packages/app/src/components/`、`packages/app/src/App.tsx` — OPFS プロバイダ、プロジェクト管理、モード切替 UI

## 概要

OPFS（Origin Private File System）によるプロジェクトの永続化と管理 UI を導入する。OPFS 非対応ブラウザでは既存の単一ファイル編集モード（MemoryModeApp）にフォールバックし、回帰なく動作する。

## 受け入れ条件

### AC-1: モード検出とフォールバック

- [ ] OPFS 対応ブラウザ（`navigator.storage.getDirectory` が function）で `detectStorageMode()` が `"opfs"` を返す
- [ ] OPFS 非対応環境（`navigator` 未定義 or `navigator.storage.getDirectory` 未定義）で `detectStorageMode()` が `"memory"` を返す
- [ ] `App` コンポーネントが `"memory"` モード時に `MemoryModeApp` をレンダリングする
- [ ] `App` コンポーネントが `"opfs"` モード時に `AppProvider` + `ProjectModeApp` をレンダリングする
- [ ] `MemoryModeApp` が旧 `App.tsx` と同一の動作をする（エディタ編集、プレビュー更新、ドリルダウン、ブレッドクラム、ワーニングパネル）
- [ ] `MemoryModeApp` にプロジェクトセレクタやファイルツリーが表示されない

### AC-2: ProjectManager — プロジェクト CRUD

- [ ] `createProject("MyProject")` でプロジェクトが作成される（UUID 付き `id`、`rootPath` が `/projects/{id}`、ISO 8601 の `createdAt`/`updatedAt`）
- [ ] 作成されたプロジェクトのディレクトリに `index.krs` と `default.krs.style` が配置される
- [ ] `listProjects()` が作成済みプロジェクトの一覧を返す
- [ ] プロジェクトが0件の場合 `listProjects()` が空配列を返す
- [ ] `deleteProject(id)` でプロジェクトのディレクトリとメタデータが削除される
- [ ] 存在しない ID の `deleteProject` が `"Project not found"` エラーを throw する
- [ ] `renameProject(id, "New Name")` でプロジェクト名が更新される
- [ ] 存在しない ID の `renameProject` が `"Project not found"` エラーを throw する
- [ ] `getProject(id)` が該当プロジェクトを返す
- [ ] 存在しない ID の `getProject` が `null` を返す

### AC-3: App 状態管理

- [ ] `SET_PROJECTS` アクションでプロジェクト一覧が更新される
- [ ] `SET_CURRENT_PROJECT` アクションで現在のプロジェクトが切り替わり、ファイル関連の状態（`currentFilePath`、`fileContent`、`fileTree`、`viewPath`）がリセットされる
- [ ] `SELECT_FILE` アクションで選択ファイルのパスと内容が設定され、`viewPath` がリセットされる
- [ ] `UPDATE_FILE_CONTENT` アクションでファイル内容が更新される
- [ ] `ADD_PROJECT` アクションでプロジェクト一覧に追加される
- [ ] `REMOVE_PROJECT` アクションでプロジェクト一覧から削除され、現在のプロジェクトが削除対象の場合は `null` になる
- [ ] `RENAME_PROJECT` アクションでプロジェクト一覧と現在のプロジェクト（該当する場合）の名前が更新される

### AC-4: ProjectSelector UI

- [ ] ドロップダウンにプロジェクト一覧が表示される
- [ ] ドロップダウンでプロジェクトを切り替えられる
- [ ] 「+ New」ボタンで名前入力フィールドが表示され、Enter または OK で作成される
- [ ] 「Delete」ボタンで確認ダイアログ後にプロジェクトが削除される

### AC-5: FileTree UI

- [ ] プロジェクトのルートディレクトリ配下のファイル・ディレクトリが一覧表示される
- [ ] ディレクトリクリックで展開/折りたたみが切り替わる
- [ ] ファイルクリックで `onSelectFile` が呼ばれる
- [ ] 現在選択中のファイルがハイライトされる

### AC-6: ProjectModeApp — 初期化と統合

- [ ] 初回起動時（プロジェクト0件）に「Getting Started」プロジェクトが自動作成される
- [ ] 起動時に前回開いたプロジェクトが localStorage から復元される
- [ ] プロジェクト切り替え時に `index.krs` が自動的に選択・表示される
- [ ] エディタでの編集が OPFS に自動保存される
- [ ] 編集後にプレビューがリアルタイム更新される
- [ ] ドリルダウンとブレッドクラムが正常に動作する
- [ ] ワーニングパネルに警告が表示される

### AC-7: useKarasuProject hook

- [ ] `compileProject()` を使ったデバウンス（300ms）付きコンパイルが行われる
- [ ] エラー発生時に最後の有効な SVG が保持される
- [ ] `recompile()` 呼び出しで再コンパイルが実行される
- [ ] `entryPath` または `fs` が `null` の場合はコンパイルが実行されない

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
