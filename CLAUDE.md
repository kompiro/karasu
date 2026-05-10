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
| テスト観点ライブラリ（過去 bug から抽出した再発防止観点） | `docs/test-perspectives/`       |
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
> 以下は必ず守る制約のみ記載する。詳細手順は `docs/process.md` および `/hane:start-dev` スキル（[`kompiro/hane`](https://github.com/kompiro/hane) plugin）を参照。

### ブランチ・worktree ルール

- `main` への直接コミット・push は禁止 — 必ずブランチ + PR 経由でマージする
- worktree の作成先は必ず `.claude/worktrees/<branch-name>` とする（例: `git worktree add .claude/worktrees/feat/my-feature feat/my-feature`）
- ブランチ命名規則: `feat/`, `fix/`, `docs/`, `chore/`, `refactor/` + kebab-case

### Issue・PR 記述ルール

- Issue のタイトル・本文・コメントは英語で書く
- PR のタイトル・description（本文）は英語で書く
- commit メッセージも英語（subject）

### テスト観点ライブラリ（TPL）の参照

`docs/test-perspectives/` には、過去の bug Issue から抽出した再発防止のためのテスト観点（TPL）が蓄積されている。運用方針の決定は [ADR-20260509-04](docs/adr/20260509-04-test-perspective-library.md) を参照。

- **DesignDoc 作成時 / 新機能実装時 / bug 修正時** に該当する `topic` / `scope.packages` の TPL を確認する
- 該当する観点が見つかったら、DesignDoc または PR description で TPL の ID を引用する
- **DesignDoc 作成時は既存 TPL の確認に加えて `docs/concepts.ja.md` と関連 ADR もスキャン** し、まだ TPL になっていない原則で今回の設計が違反しうるものがあれば proactive TPL を同じ PR で起こす（理想ライフサイクルは concept → proactive TPL → development → bug → retrospective TPL — `docs/test-perspectives/README.md` 「TPL のライフサイクル」節）
- bug 修正時、3-Yes ルール（横展開しうる / 構造的に再発しうる / 既存 TPL に未掲載）すべて満たすなら新規 TPL を起こす（詳細は `docs/test-perspectives/README.md`）

### メタフィルタ — 「ゆっくり変化する構造的な文脈」

新 feature / 構文拡張 / 連携機能を提案・レビューするときは、個別 TPL とは別に **`docs/concepts.ja.md` 「非目標 → 共通フィルタ」** に照らして必ず一度評価する:

> karasu が扱うのは ゆっくり変化する構造的な文脈 — 何が存在し、どう関係し、誰が所有するかであり、実装の詳細も運用の現況もその外側にある。

提案がこのフィルタを通るかを問う 3 つのチェック:

- 実装の詳細をモデルに引き込もうとしていないか（コード生成 / DB スキーマ設計 / 型生成 など）
- 運用の現況・ランタイムメトリクス・本番トポロジを取り込もうとしていないか（個々の pod / リージョン / ライブダッシュボード化）
- 情報の流れが詳細化方向（down）になっていないか（→ TPL-20260510-19 と相補。あちらは流れの方向、こちらは扱う情報のレイヤ）

このメタフィルタは個別 feature ではなく **すべての feature** に適用される性質のため、TPL ファイルではなく CLAUDE.md に置いている（決定経緯と alternative 比較は #1221）。
