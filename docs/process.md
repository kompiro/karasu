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
| `docs/spec/` | 構文・タグの仕様リファレンス（i18n ポリシーは `docs/spec/i18n.md`） | — |
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

### Issue ステータスラベル

Issue の進捗は以下のラベルで管理する。

| ラベル | 意味 |
|--------|------|
| `status: ready` | 着手可能（依存関係が解消済み） |
| `status: designing` | Design Doc 作成中 |
| `status: designed` | Design Doc 承認済み・実装着手可能 |
| `status: implementing` | 実装中 |
| `status: in-review` | PR オープン・人間の確認待ち |
| `status: blocked` | 別 Issue の完了待ちでブロック中 |

**Design Doc あり のフロー:**
```
ready → implementing → designing → designed → implementing → in-review → (close)
```

**Design Doc なし のフロー:**
```
ready → implementing → in-review → (close)
```

> `close` は PR に `Closes #N` を記載することで GitHub が自動で行う。

### PR ワークフロー

```
1. GitHub Issue を作成する（gh issue create）
2. git worktree add .worktrees/<branch> <branch> で作業ブランチ・worktree を作成する
3. Issue ラベルを status: implementing に更新する
4. Plan モードで実装計画を作成し、レビューを受ける
   - 必要に応じて docs/design/ に設計ドキュメントを作成する（Issue を status: designing に更新）
   - Design Doc PR がマージされたら status: designed → 実装開始時に status: implementing に戻す
   - 受け入れテスト（docs/acceptance/）を計画に含める
5. 実装する
6. /claude-skills:commit でコミットする（Conventional Commits 形式）
7. PR を作成する（Closes #N で Issue と紐付ける）
8. CI（test / lint / format / typecheck / knip / check:cycles / build）が通過することを確認する
9. Issue ラベルを status: in-review に更新する
10. 手動検証チェックリストを実施する
11. レビュー → マージ → git worktree remove .worktrees/<branch> でクリーンアップ
```

詳細な手順は `/claude-skills:start-dev` スキル（[`kompiro/claude-skills`](https://github.com/kompiro/claude-skills) plugin）を参照。

### Claude Code plugin のセットアップ

karasu のワークフローを Claude Code 上で再現するには、portable な skill 群を提供する `kompiro/claude-skills` plugin をインストールする。

```
/plugin marketplace add kompiro/claude-skills
/plugin install claude-skills@kompiro-claude-skills
```

plugin にバンドルされる skill とその karasu 内での主な用途:

| Skill | 用途 |
|---|---|
| `/claude-skills:start-dev` | Issue → worktree → 計画 → 実装 → コミット → PR の全体フロー |
| `/claude-skills:commit` | Conventional Commits でコミット |
| `/claude-skills:ship` | push → PR → CI → クリーンアップ |
| `/claude-skills:design-doc` | `docs/design/` への設計検討記録の作成 |
| `/claude-skills:acceptance-test` | `docs/acceptance/NNNN-*.md` の受け入れテスト記録作成 |
| `/claude-skills:qa` | `docs/qa/YYYY-MM-DD-checklist.md` 生成 |
| `/claude-skills:review-docs` | リンク切れ・ドキュメント整合性レビュー |
| `/claude-skills:sync-docs` | コード現状に合わせてリファレンス系ドキュメントを更新 |

karasu 専用の skill（`/svg-icon`, `/update-examples`）は `.claude/skills/` 配下にローカル定義されている（plugin 化対象外）。

> **移行期間中**: ローカル `.claude/skills/{commit,ship,start-dev,...}/` も当面残しているため、`/commit` と `/claude-skills:commit` の両方が available skill として表示される。plugin 動作確認後に local 側は別 PR で削除予定（[#1089](https://github.com/kompiro/karasu/issues/1089)）。

### 循環依存チェック

`pnpm check:cycles` で `madge --circular` を 5 つのプロダクションパッケージ（core / app / cli / lsp / vscode）の `src/` に対して実行し、モジュール間の循環依存を検出する。

- pre-push の lefthook と CI の `Check` ジョブで自動実行されるため、ローカル / PR どちらでも循環導入時にブロックされる
- 型のみの import (`import type`) でも madge は循環として検出する。共有契約は専用の leaf module（例: `renderer/layout-types.ts`）に分離して回避する
- e2e パッケージ（`packages/e2e`, `packages/vscode-e2e`）はテスト専用で意図的にスキャン対象外

### Barrel import 禁止（core 内部）

`packages/core/src/` 配下のプロダクションコードから `**/index.js` への import を `no-restricted-imports` で禁止している（`.oxlintrc.json` の overrides）。`packages/core/src/index.ts` は 1,100 行超・78 export を持つ barrel で、内部から自分自身を経由する import を許すと runtime 循環依存に直結するため。

- 内部モジュールは直接 deep path（例: `from "./parser/parser.js"`）で import する
- テストファイル（`*.test.ts`, `*.spec.ts`）は引き続き `from "../index.js"` を許可（公開 API としての smoke test を兼ねるため）

### QA チェックリスト

`/claude-skills:qa` スキルはリリース前や任意のタイミングで実行できる。

```
/claude-skills:qa を実行
  → docs/acceptance/*.md を読み込む
  → bash コマンドを自動実行（build / test / lint 等）
  → 手動確認が必要な - [ ] 項目を収集
  → docs/qa/YYYY-MM-DD-checklist.md を生成
```

### 自動化アノテーションの書式

自動化されたケースを `docs/acceptance/*.md` に反映するときは、`/claude-skills:acceptance-test` スキル（plugin: `kompiro/claude-skills`）の「自動化アノテーション」節に従って `> ✅ Automated — ... › ...` 形式の blockquote を箇条書き直下に添える。書式は repo 全体で統一されており、過去の "Verified by" メタ欄や "Automated Checks" 節分割は順次本方式に畳まれる（#916）。

- 生成ファイルは git にコミットしない（`.gitignore` 対象）
- 手動確認項目は生成されたファイルをもとに順番に実施する
- `/claude-skills:qa` は手動 QA のチェックリストを生成する。機械化可能な AT は Playwright による E2E 層（`packages/e2e/`）が補完する。自動化は手動 QA を置き換えず補完する（詳細は ADR-20260412-05）

### 設計判断を ADR に残すタイミング

設計ドキュメントのステータスが「採用」または「取りやめ」に確定したら ADR を作成する。

ADR の内容:
- **Frontmatter**: `id` / `title` / `status` / `date` と、該当する関係性（`supersedes` / `depends_on` 等）を YAML frontmatter に記述する。雛形は `docs/adr/TEMPLATE.md` を参照。ローカル検証は `pnpm adr:validate`。
- **背景**: なぜ検討することになったか
- **決定**: 何を決めたか（一文で）
- **理由**: 採用・見送りの根拠（箇条書き）
- **関連**: GitHub Issue / 設計ドキュメントへのリンク

設計ドキュメントに詳細な分析が残っている場合は、ADR 作成後に設計ドキュメントを削除する。
（詳細は GitHub Issue のディスカッションや PR コメントで追えるため）

Frontmatter スキーマ・関係性セマンティクス・バリデータの詳細は `docs/design/adr-knowledge-graph.md` を参照。

### 既存 ADR を見直すとき

既に決定済みの ADR を覆す・方針変更する場合は、**旧 ADR を書き換えず新 ADR で supersede する**。

- 旧 ADR はそのまま歴史的記録として残す
- 新 ADR を作成し、背景に「何が変わったためこの再評価に至ったか」を明記する
- 旧 ADR のステータス行を `決定済み` から `Superseded by ADR-YYYYMMDD-NN` に更新する
- Frontmatter では旧 ADR を `status: superseded` + `superseded_by: ADR-YYYYMMDD-NN`、新 ADR を `supersedes: [旧 ADR ID]` とする。`pnpm adr:validate` が双方向整合をチェックする
- 新 ADR の「関連」に旧 ADR へのリンクを記載する

理由: ADR は時点の意思決定と根拠を保存するログであり、過去の判断が「当時は正しかった」
ことを消してはならない。前提条件の変化を読み取れるようにするには、新旧を並置できる方が良い。

## Dependabot 運用ルール

### 通常の version update

- スケジュールは weekly / Monday、cooldown は全 semver レベル 7 日（`.github/dependabot.yml`）。
- 月曜のバッチ起票後にレビュー → マージする。バッチ単位で取り込み判断を ADR に残すことがある（例: `ADR-20260428-02`）。

### Security update（GHSA 起因の即時 PR）

Dependabot security update は alert 検知時に即時起票され、`schedule` も `cooldown` も `updates:` の設定も参照しない。月曜以外に Dependabot PR が出ていたら、まず security update かどうかを確認する。

**pnpm workspace で同一 advisory に対して PR が複数起票された場合の処理:**

1. `pnpm-lock.yaml` を含む root スコープの PR を merge する。
2. `packages/<name>/package.json` のみを書き換える PR は close する。

理由: pnpm workspace では依存宣言（`packages/*/package.json`）と解決済みバージョン（root の `pnpm-lock.yaml`）が別 manifest として alert 化されるため、Dependabot は alert ごとに PR を作る。`packages/*` 単独 PR は workspace ルートの lockfile を更新できず、`pnpm install --frozen-lockfile` で必ず CI が落ちる構造的制約があり、`@dependabot recreate` でも直らない。`dependabot.yml` でも抑制不可（security update は `updates:` を参照しない）。

詳細・経緯は `ADR-20260429-08`（`docs/adr/20260429-08-dependabot-security-2026-04-29.md`）を参照。同様の事象が再発した場合は ADR を増やさず、本ルールに従って処理する。
