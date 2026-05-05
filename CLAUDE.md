# karasu — CLAUDE.md

**karasu**（鴉）はテキストベースのアーキテクチャモデリングツールです。
C4 Modelに触発されつつも独自の語彙を持ち、論理構造と物理構造を分離して表現します。

## ドキュメント

| ドキュメント                                       | 場所                            |
| -------------------------------------------------- | ------------------------------- |
| .krs 構文リファレンス                               | `docs/spec/syntax.md`           |
| .krs.style 構文リファレンス                         | `docs/spec/style.md`            |
| タグ・アノテーション一覧                            | `docs/spec/tags-annotations.md` |
| i18n ポリシー（ユーザー向け文字列）                  | `docs/spec/i18n.md`             |
| コアコンセプト（論理/物理分離など）                 | `docs/concepts.md`              |
| 設計判断の経緯（ADR）— 有効な決定一覧               | `docs/adr/effective.md` (auto-generated; see also `docs/adr/graph.md`) |
| 設計判断の経緯（ADR）— 全履歴                        | `docs/adr/`                     |
| 詳細技術設計 — どう作るか（制約・代替案・実装方針） | `docs/design/`                  |
| 受け入れテスト基準                                  | `docs/acceptance/`              |
| 開発プロセス（ドキュメントライフサイクル・PR フロー） | `docs/process.md`               |
| サンプル `.krs` ファイル（チュートリアル・AT用）     | `examples/`                     |

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

## 開発ワークフロー

> **作業開始時は必ず `docs/process.md` を読んでから着手すること。**
> 以下は必ず守る制約のみ記載する。詳細手順は `docs/process.md` および `/claude-skills:start-dev` スキル（[`kompiro/claude-skills`](https://github.com/kompiro/claude-skills) plugin）を参照。

### ブランチ・worktree ルール

- `main` への直接コミット・push は禁止 — 必ずブランチ + PR 経由でマージする
- worktree の作成先は必ず `.claude/worktrees/<branch-name>` とする（例: `git worktree add .claude/worktrees/feat/my-feature feat/my-feature`）
- ブランチ命名規則: `feat/`, `fix/`, `docs/`, `chore/`, `refactor/` + kebab-case

### Issue・PR 記述ルール

- Issue のタイトル・本文・コメントは英語で書く
- PR のタイトル・description（本文）は英語で書く
- commit メッセージも英語（subject）
