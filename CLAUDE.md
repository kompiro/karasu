# karasu — CLAUDE.md

**karasu**（鴉）はテキストベースのアーキテクチャモデリングツールです。
C4 Modelに触発されつつも独自の語彙を持ち、論理構造と物理構造を分離して表現します。

## 命名の由来

北欧神話のオーディンの使い魔ヒギン・ムニン（思考と記憶の鴉）に由来します。
世界を俯瞰して情報を集め、必要な場所へ降りていく鴉の姿が、
ドリルダウン型アーキテクチャ把握のコンセプトと重なります。

---

## ドキュメント

| ドキュメント                                       | 場所                            |
| -------------------------------------------------- | ------------------------------- |
| .krs 構文リファレンス                               | `docs/spec/syntax.md`           |
| .krs.style 構文リファレンス                         | `docs/spec/style.md`            |
| タグ・アノテーション一覧                            | `docs/spec/tags-annotations.md` |
| コアコンセプト（論理/物理分離など）                 | `docs/concepts.md`              |
| 設計判断の経緯（ADR）                               | `docs/adr/`                     |
| 機能概要 — 何を作るか（軽量・ユーザー視点）        | `docs/features/planned/`        |
| 検討中のアイデア                                    | `docs/features/ideas/`          |
| 詳細技術設計 — どう作るか（制約・代替案・実装方針） | `docs/design/`                  |
| 受け入れテスト基準                                  | `docs/acceptance/`              |

---

## 実装方針

### リポジトリ構成

```
karasu/
├── CLAUDE.md
├── docs/
├── packages/
│   ├── core/          ← パーサー・スタイル解決・SVGレンダラー（Pure TS）
│   └── app/           ← Vite + React のプレビューUI
├── package.json       ← npm workspaces 設定
└── tsconfig.json
```

### 技術スタック

| 用途                   | 技術          |
| ---------------------- | ------------- |
| 言語                   | TypeScript    |
| ビルド（app）          | Vite          |
| UIフレームワーク       | React         |
| エディタコンポーネント | Monaco Editor |
| テスト                 | Vitest        |

### 実装の進め方

**フェーズ1：packages/core**

1. `.krs` パーサー（lexer + 再帰下降パーサー）
2. `.krs.style` パーサーとカスケード解決（詳細度スコアによるマージ）
3. SVGレンダラー

**フェーズ2：packages/app**

1. 左ペイン：Monaco Editor（`.krs` の編集）
2. 右ペイン：SVGプレビュー（リアルタイム更新）
3. 警告パネル（スタイル衝突・ドメイン分散などの表示）

---

## 開発ワークフロー

### ブランチ戦略

- `main` ブランチへの直接コミットは避け、PR 経由でマージする
- 機能開発はセッション内で `git worktree add` により worktree を作成して行う
- ブランチ命名規則: `feat/`, `fix/`, `docs/`, `chore/`, `refactor/` + kebab-case

### PR ワークフロー

1. `docs/features/` で機能を定義する
2. GitHub Issue に転記する（`gh issue create`）
3. `git worktree add` で worktree を作成し、その中で開発する
4. Plan モードで実装計画を作成し、レビューを受ける
5. 実装 → `/commit` → PR 作成（`Closes #N` で Issue 紐付け）
6. CI（test, lint, format, typecheck, build）が通過することを確認する
7. 手動検証チェックリストを実施する
8. レビュー → マージ → `git worktree remove` でクリーンアップ

詳細な手順は `/start-dev` スキルを参照。
