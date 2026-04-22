---
id: ADR-20260422-06
title: Diff ペースト入力の UI 配置とストレージ方式
status: accepted
date: 2026-04-22
depends_on:
  - ADR-20260420-02
related_to:
  - ADR-20260317-02
scope:
  packages:
    - app
  domains:
    - rendering
    - testing
---

# ADR-20260422-06: Diff ペースト入力の UI 配置とストレージ方式

- **日付**: 2026-04-22
- **ステータス**: 決定済み
- **関連**:
  - Issue #739 (Closed), PR #782 (実装)
  - ADR-20260420-02 — グラフィカル diff ビューア（本 ADR の上位文脈）
  - Design Doc: `docs/design/graphical-diff-viewer.md`（Phase 4）
  - Acceptance Test: `docs/acceptance/0061-diff-paste-input.md`
  - `packages/app/src/components/PasteCompareDialog.tsx`
  - `packages/app/src/components/file-tree/FileTreeView.tsx`
  - `packages/app/src/ProjectModeApp.tsx`
  - `packages/app/src/hooks/useProjectInitialization.ts`

## 決定事項

diff ビューアの Phase 4（ペースト入力）について、以下 3 点を決定する。

| 軸 | 採用案 | 要点 |
|---|---|---|
| 起点 UI | **FileTree ヘッダーの「⇄ Paste」ボタン** | 既存の「⇄ Compare with current」（コンテキストメニュー）と左サイドバーに共置。feature-flag (`ENABLE_DIFF_VIEWER`) 下で表示 |
| 入力 UI | **モーダルダイアログ + textarea** | 表示/編集/閲覧を 1 つのコンポーネント（`PasteCompareDialog`、`readOnly` prop）で兼ねる |
| ストレージ | **プロジェクト直下の隠しファイル `.karasu-paste-compare.krs`** | FileTree ローダで `.karasu-*` を一律フィルタ。diff 終了時 + 起動時に best-effort 削除 |

## 採用しなかった案と理由

### 1. 起点 UI の配置

#### 却下: FileTree のコンテキストメニュー配下
「⇄ Compare with current」と並べる案。ただしコンテキストメニューは **ファイル（ノード）を対象とする操作** の文脈であり、「ワークスペースに存在しない blob を貼り付ける」という *nodeless* 操作とは相性が悪い。右クリック元のファイルが Paste 結果にどう関係するのか、ユーザーに誤読を招く。

#### 却下: プレビューペインのツールバー
diff ビューアは「プレビューに重ねて見せる」機能なので、プレビュー側に起点を置く選択肢もある。却下理由は 2 つ:
- プレビュー側ツールバーは **view モード（system/deploy/org）** のコントロールが中心で、ペースト入力は view モードの一段上（diff モード起動）の操作。スコープが合わない
- ファイルピッカー版の起点が FileTree にあるので、入力ソース（ピッカー / ペースト / OPFS スナップショット）を **FileTree サイドバーに集約** した方が学習コストが低い

#### 却下: コマンドパレット / ショートカット
将来的に追加する可能性はあるが、現時点では feature-flag 配下の実験機能であり、発見性の面で明示的な UI ボタンが望ましい。

### 2. 入力 UI の形式

#### 却下: 分割エディタ（画面内に before-side パネルを常設）
Monaco を before-side にもう 1 ペイン並べる案。却下理由:
- 画面スペースを恒常的に消費する。diff が現在の設計で **既定で無効（feature-flag）** な機能に対しては過剰投資
- ピッカー版は「別ファイルをクリック」だけで起動するので、ペースト版だけが常設パネルを持つと UI の一貫性が崩れる

#### 却下: 新規 `.krs` ファイルを作って編集させる
「そもそもワークスペースに保存しない」という Issue 要件に反する。#737 の OPFS スナップショット入力とは本質的に異なる運用になる。

#### 却下: ドラッグ&ドロップ / クリップボードイベント自動検出
発見性が低い。ユーザーがいつ diff モードに入ったか制御しづらい。

モーダル内部の `readOnly` モード（「👁 View pasted」で再オープン）を別コンポーネントにせず同一コンポーネントで兼ねた理由は、状態（textarea 値・Escape 処理・フォーカス管理）のほぼ全てが共通で、分離すると重複になるため。TypeScript の discriminated union で `readOnly` が真なら `onConfirm` を禁止し、使い分けをコンパイル時に担保している。

### 3. ストレージ方式

#### 却下: in-memory な仮想 FS / プロキシ FS
pasted 内容だけ in-memory で持ち、`compileSystemDiff` に渡す `FileSystemProvider` を合成する案。却下理由:
- `FileSystemProvider` 抽象は「単一のソース」を前提に各呼び出し側が設計されており、合成プロバイダを差し込むと `ImportResolver` を含む全経路の前提が崩れる
- pasted `.krs` が `import` 文を含んでも、**それは現プロジェクトの相対パスを解決したい** はず。独立 FS だと import 解決に既存ファイルが見えなくなる
- 実装コストに見合うメリットがない。削除タイミングを適切に扱えば OPFS 汚染は現実的に無視できる

#### 却下: プロジェクト外（例: `/tmp/` 相当）に保存
上記と同じ理由で、`import` 解決のためにプロジェクト直下が最も自然。

#### 採用理由: 隠しプレフィックス `.karasu-*`
- Unix 由来の「ドット始まり = 隠しファイル」慣習に準拠
- FileTree の `loadDir` で一律フィルタするだけで非表示にできる（単一箇所）
- `.karasu-` プレフィックスは将来の別用途（例: スナップショットキャッシュ）でも共用できる名前空間

### 4. ライフサイクル（クリーンアップ）

pasted ファイルを削除するタイミングを 2 系統用意:

1. **diff モード終了時 / 比較ソース切替時**: `ProjectModeApp` の `useEffect` が `compareSource === "pasted"` でなくなった瞬間に削除
2. **アプリ起動時の一括掃除**: `useProjectInitialization` で全プロジェクト配下の `.karasu-paste-compare.krs` を削除

2 を追加した理由は、タブクラッシュ / 強制終了でランタイム後片付けが走らなかったケースを救済するため。OPFS は永続なので、この保険がないとユーザーが気付かないうちに孤児ファイルが積もる可能性がある。レビュー指摘を受けて追加した。

また、`SET_CURRENT_PROJECT` では `compareEntryPath` / `compareSource` を **null にリセット** する。これはプロジェクト切替時に旧プロジェクトのパスが現状態に残ると、`pastedPath` がズレて削除対象が見つからない問題を避けるため。

## 視認性の設計トークン

ダイアログは当初 `--bg-primary` / `--border-primary` という存在しない変数を参照しており、ダークテーマで白背景 + 淡色テキストになる視認性バグがあった。プロジェクトの実在トークン（`--bg-overlay`, `--bg-base`, `--text-primary`, `--border-default` 等）へ差し替えて解決。新規ダイアログ系 UI を書く際は **必ず `packages/app/src/styles/app.css` 冒頭の `:root` ブロックで定義されているトークンのみを参照する** こと。

## 結果

- ペースト入力の Phase 4 が #650 / ADR-20260420-02 のフォローアップとして完了
- 残りは #740（OPFS スナップショット入力）。同様の「ワークスペース外入力」なので本 ADR の選択（隠しファイル + ライフサイクル管理）が再利用できる

## 未解決の論点

- pasted 内容のサイズ上限 — 現状は未設定。非常に大きな blob は `compileSystemDiff` 実行中にメインスレッドをブロックする可能性がある。実測で問題が出たら設計し直す
- ダイアログ内の Escape ハンドラが `document` 全体に張られている — 将来的にモーダルが入れ子になるケースが出たら、ダイアログ要素スコープに変更する
