---
name: design-doc
description: >
  Create design documents in docs/design/ for brainstorming and exploring architectural ideas.
  Trigger when the user says: "設計ドキュメント", "デザインドキュメント", "設計を残す", "壁打ち",
  "design doc", "create design doc", or similar phrases requesting design documentation.
---

# Design Document Skill

設計の壁打ちや検討過程を `docs/design/` にドキュメントとして残す。
ADR（決定記録）の前段階として、アイデアの探索・比較・整理を行うためのドキュメント。

## ADR との違い

| | Design Doc | ADR |
|---|---|---|
| 目的 | 設計の探索・壁打ち・検討過程の記録 | 最終的な設計判断の記録 |
| ステータス | ドラフト → 検討中 → 完了/ADR化 | 提案 → 決定済み/却下 |
| 内容 | 問題の深掘り・選択肢の比較・トレードオフ分析 | 決定事項・理由・却下した案 |
| 配置先 | `docs/design/` 直下 | `docs/design/adr/` |

## 手順

1. ユーザーと対話しながら設計の論点を明確にする
   - 何を解決したいのか（問題・課題）
   - どういう制約があるか
   - どんな選択肢を考えているか
2. `docs/design/` 内の既存ドキュメントを確認し、重複や関連するものがないか確認する
3. 壁打ちの内容を整理してドキュメント化する
4. ブランチ・worktree を作成してからファイルを作成する
   - ブランチ名の例: `docs/design-<kebab-case-title>`
   - `git worktree add .worktrees/<branch> <branch>`
   - worktree 内でファイルを作成し、コミット・push・PR 作成まで行う
5. ユーザーにレビューを依頼する
6. PR がマージされたら、紐付いている Issue がある場合はラベルを `status: designed` に更新する:
   ```
   gh issue edit <N> --remove-label "status: designing" --add-label "status: designed"
   ```
   > `status: designed` は「設計完了・実装着手可能」を意味する。
   > 実装を開始する際（`/start-dev` など）に `status: implementing` に更新すること。
7. 設計が固まった場合は、ADR化を提案する

## ファイル形式

```markdown
# タイトル

- **日付**: YYYY-MM-DD
- **ステータス**: ドラフト | 検討中 | 完了 | ADR化（ADR-XXXX）
- **関連**: 関連するドキュメントやADRへのリンク

## 背景・課題

解決したい問題や現状の課題を記述。
なぜこの設計検討が必要になったのかの文脈。

## 制約・前提

設計上の制約や前提条件を列挙。

## 検討した選択肢

### 案1: タイトル

概要、メリット・デメリット、トレードオフ。

### 案2: タイトル

概要、メリット・デメリット、トレードオフ。

## 比較

選択肢を比較する表や議論の要約。

## 現時点の方針

（固まっていれば）現時点での方向性。
（未定であれば）次に検討すべきこと。

## 未解決の問い

まだ答えが出ていない論点をリストアップ。
```

## 壁打ちの進め方ガイドライン

- **探索的に**: 最初から結論を出そうとせず、まず選択肢を広げる
- **トレードオフ重視**: 各案のメリット・デメリットを明示する
- **具体例で検証**: 抽象的な議論に留まらず、具体的なコード例やユースケースで検証する
- **制約を明確に**: 「なぜその案がダメか」の理由となる制約を明示する
- **段階的に深掘り**: 一度に全てを決めず、大きな方針から詳細へと進める

## 命名規則

- ファイル名: `docs/design/kebab-case-title.md`
- ADR と異なり連番は不要（トピック名で識別する）
- タイトルは検討テーマを端的に表す
