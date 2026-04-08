# karasu — CLAUDE.md

**karasu**（鴉）はテキストベースのアーキテクチャモデリングツールです。
C4 Modelに触発されつつも独自の語彙を持ち、論理構造と物理構造を分離して表現します。

## ドキュメント

| ドキュメント                                       | 場所                            |
| -------------------------------------------------- | ------------------------------- |
| .krs 構文リファレンス                               | `docs/spec/syntax.md`           |
| .krs.style 構文リファレンス                         | `docs/spec/style.md`            |
| タグ・アノテーション一覧                            | `docs/spec/tags-annotations.md` |
| コアコンセプト（論理/物理分離など）                 | `docs/concepts.md`              |
| 設計判断の経緯（ADR）                               | `docs/adr/`                     |
| 詳細技術設計 — どう作るか（制約・代替案・実装方針） | `docs/design/`                  |
| 受け入れテスト基準                                  | `docs/acceptance/`              |
| 開発プロセス（ドキュメントライフサイクル・PR フロー） | `docs/process.md`               |
| サンプル `.krs` ファイル（チュートリアル・AT用）     | `examples/`                     |

---

## 実装方針

### リポジトリ構成

```
karasu/
├── CLAUDE.md
├── docs/
├── examples/          ← サンプル .krs ファイル（Getting Started・テーマ別シナリオ）
├── packages/
│   ├── core/          ← パーサー・スタイル解決・SVGレンダラー（Pure TS）
│   ├── app/           ← Vite + React のプレビューUI
│   ├── cli/           ← karasu serve / render コマンド
│   ├── lsp/           ← Language Server Protocol 実装
│   └── vscode/        ← VS Code 拡張
├── package.json       ← npm workspaces 設定
└── tsconfig.json
```

### 技術スタック

| 用途                   | 技術                        |
| ---------------------- | --------------------------- |
| 言語                   | TypeScript                  |
| ビルド（app）          | Vite                        |
| UIフレームワーク       | React                       |
| エディタコンポーネント | Monaco Editor               |
| テスト                 | Vitest                      |
| CLI                    | commander                   |
| 言語サーバー           | LSP（vscode-languageserver） |

---

## 開発ワークフロー

### ブランチ戦略

- `main` ブランチへの直接コミットは避け、PR 経由でマージする
- 機能開発はセッション内で `git worktree add` により worktree を作成して行う
- worktree の作成先は必ず `.worktrees/<branch-name>` とする（例: `git worktree add .worktrees/feat/my-feature feat/my-feature`）
- ブランチ命名規則: `feat/`, `fix/`, `docs/`, `chore/`, `refactor/` + kebab-case

### PR 記述ルール

- PR のタイトル・description（本文）は英語で書く
- commit メッセージも英語（subject）

### PR ワークフロー

1. GitHub Issue を作成する（`gh issue create`）
2. `git worktree add` で worktree を作成し、その中で開発する
3. Plan モードで実装計画を作成し、レビューを受ける
4. 実装 → `/commit` → PR 作成（`Closes #N` で Issue 紐付け）
5. CI（test, lint, format, typecheck, build）が通過することを確認する
6. 手動検証チェックリストを実施する
7. レビュー → マージ → `git worktree remove` でクリーンアップ

詳細な手順は `docs/process.md` および `/start-dev` スキルを参照。
