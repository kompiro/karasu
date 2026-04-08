# karasu — 開発プロセス

## ドキュメントのライフサイクル

アイデアから意思決定まで、以下の流れでドキュメントを管理する。

```
アイデア
  └→ GitHub Issues          ← 思いついたこと、試してみたいこと

実装着手
  └→ docs/design/           ← 「どう作るか」の詳細設計（ドラフト/検討中）

決定後（採用 or 見送り）
  └→ docs/adr/              ← 「なぜそうしたか」の決定記録（簡潔に）
```

### 各ディレクトリの役割

| 場所 | 何を置くか | ステータス |
|------|-----------|-----------|
| GitHub Issues | アイデア・機能要望・バグ | オープン/クローズ |
| `docs/design/` | 実装の詳細設計（制約・代替案・実装方針） | ドラフト / 検討中 |
| `docs/adr/` | 確定した設計判断の記録（採用・見送り） | 決定済み |
| `docs/spec/` | 構文・タグの仕様リファレンス | — |
| `docs/acceptance/` | 受け入れテスト基準 | — |

**設計ドキュメント (`docs/design/`) には「採用」「取りやめ」のドキュメントを置かない。**
決定が下りたら ADR に昇格させ、設計ドキュメントは削除する。

---

## 開発ワークフロー

### ブランチ戦略

- `main` への直接コミット・push は禁止 — PR 経由でマージする
- 機能開発は `git worktree add` により worktree を作成して行う
- worktree の作成先は必ず `.worktrees/<branch-name>` とする（例: `git worktree add .worktrees/feat/my-feature feat/my-feature`）
- ブランチ命名規則: `feat/`, `fix/`, `docs/`, `chore/`, `refactor/` + kebab-case

### Issue・PR 記述ルール

- Issue のタイトル・本文・コメントは英語で書く
- PR のタイトル・description（本文）は英語で書く
- commit メッセージも英語（subject）

### PR ワークフロー

```
1. GitHub Issue を作成する（gh issue create）
2. git worktree add .worktrees/<branch> <branch> で作業ブランチ・worktree を作成する
3. Plan モードで実装計画を作成し、レビューを受ける
   - 必要に応じて docs/design/ に設計ドキュメントを作成する
   - 受け入れテスト（docs/acceptance/）を計画に含める
4. 実装する
5. /commit でコミットする（Conventional Commits 形式）
6. PR を作成する（Closes #N で Issue と紐付ける）
7. CI（test / lint / format / typecheck / build）が通過することを確認する
8. 手動検証チェックリストを実施する
9. レビュー → マージ → git worktree remove .worktrees/<branch> でクリーンアップ
```

詳細な手順は `/start-dev` スキルを参照。

### QA チェックリスト

`/qa` スキルはリリース前や任意のタイミングで実行できる。

```
/qa を実行
  → docs/acceptance/*.md を読み込む
  → bash コマンドを自動実行（build / test / lint 等）
  → 手動確認が必要な - [ ] 項目を収集
  → docs/qa/YYYY-MM-DD-checklist.md を生成
```

- 生成ファイルは git にコミットしない（`.gitignore` 対象）
- 手動確認項目は生成されたファイルをもとに順番に実施する
- E2E フレームワークは使用しない（詳細は ADR-0008 を参照）

### 設計判断を ADR に残すタイミング

設計ドキュメントのステータスが「採用」または「取りやめ」に確定したら ADR を作成する。

ADR の内容:
- **背景**: なぜ検討することになったか
- **決定**: 何を決めたか（一文で）
- **理由**: 採用・見送りの根拠（箇条書き）
- **関連**: GitHub Issue / 設計ドキュメントへのリンク

設計ドキュメントに詳細な分析が残っている場合は、ADR 作成後に設計ドキュメントを削除する。
（詳細は GitHub Issue のディスカッションや PR コメントで追えるため）
