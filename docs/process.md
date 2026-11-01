# karasu — 開発プロセス

> このファイルは **CLAUDE.md が「作業開始時に必ず読む」と指定している**ため、毎セッション
> 全文がコンテキストに載る。**「今どうするか」だけを書く。**「なぜそうなったか」「いつ壊れたか」
> 「どの Issue が発端か」は ADR / Issue 側に置き、ここからは参照しない。従うために読む必要が
> あるもの（gate・TEMPLATE・`.claude/rules/`）へのポインタは残す。

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
| `docs/release.md` | リリース・依存更新の運用（発火時のみ読む） | — |

**設計ドキュメント (`docs/design/`) には「採用」「取りやめ」のドキュメントを置かない。**
決定が下りたら ADR に昇格させ、設計ドキュメントは削除する。
このため `docs/` の外（コード・設定・workflow・`.claude/rules/`）からは Design Doc を指さず、ADR を、まだ無ければ Issue を指す（検査が促す。仕組みは ADR-3471）。

---

## 開発ワークフロー

### ブランチ戦略

- `main` への直接コミット・push は禁止 — PR 経由でマージする
  - `main` の上で変更をステージしたコミットと、マージコミットは git のフックで拒否される。フックはすべての worktree で共有されるので、プロジェクトルートでも同じく止まる。止まったら、変更を worktree のブランチに移してからコミットする。仕組みと、止まらないケースは ADR-3335
- 機能開発は `git worktree add` により worktree を作成して行う
- worktree の作成先は必ず `.claude/worktrees/<branch-name>` とする（例: `git worktree add .claude/worktrees/feat/my-feature feat/my-feature`）
- ブランチ命名規則: `feat/`, `fix/`, `docs/`, `chore/`, `refactor/`, `spike/` + kebab-case
- `spike/` はマージを前提としない PoC 用。この prefix だけは CI 上の意味を持ち、push で preview がデプロイされる（[docs/process/spike.md](process/spike.md)「spike を PR なしで preview で動かす」節）
- spike は `spike/<issue>-<何を測ったか>` と名付け、その Issue が open なあいだは push して残す（[docs/process/spike.md](process/spike.md)「spike の名前と寿命」節）
- **PR を出す前に main を取り込む — `rebase` は使わない。** `git fetch origin main` してから `git merge --no-edit origin/main`。rebase は他 PR のマージ済み成果を巻き添えで revert しうる。
- **例外: stack 内のブランチは `gh stack sync` の rebase で `main` を取り込む。** スタックは各 PR の base を積み替える構造で、merge では表現できない。この 1 行は直上の rebase 禁止に優先する（[docs/process/stacked-pr.md](process/stacked-pr.md)「Stacked PR の進め方」）

### Issue・PR 記述ルール

- Issue のタイトル・本文・コメントは英語で書く
- PR のタイトル・description（本文）は英語で書く
- commit メッセージも英語（subject）

### Issue 種別ラベル — `bug` と `test-infra` の使い分け

Issue が表面化した「失敗の種類」によってラベルを使い分ける。バーンダウンや TPL 抽出の signal を分離するため、両者は混在させない。

| ラベル | 適用範囲 |
|--------|----------|
| `bug` | エンドユーザーが観測した（または観測しうる）プロダクト上の不具合 |
| `test-infra` | E2E flake、fixture drift、locale pinning など、テスト基盤側の問題でありプロダクトのユーザー影響を伴わないもの |

- `bug` と `test-infra` は **mutually exclusive**（同時に付けない）
- 3-Yes ルールの起動トリガーは双方

### Issue トピックラベル（ADR の topic で分類する）

Issue には `topic: <name>` ラベルを 1 つ付ける。`<name>` は
[`adr.config.json`](../adr.config.json) の `topics` のいずれかで、ADR の `topic` と同じ語彙である。

- 到達状態: open の Issue は種別（`bug` / `test-infra` / それ以外）を問わず、すべて `topic:` ラベルを
  ちょうど 1 つ持つ。起票時に付け、ラベルが無い・2 つ以上ある Issue は見つけたらその場で 1 つに直す
  （残す 1 つは下の「迷ったら」で決める）。Issue を起票する workflow も起票時に付ける。付け忘れは
  CI の検査が落とす（#3390）。次のコマンドが何も出力しなければ成り立っている:

  ```bash
  gh api --paginate 'repos/{owner}/{repo}/issues?state=open&per_page=100' \
    --jq '.[] | select(.pull_request == null) | select([.labels[].name | select(startswith("topic: "))] | length != 1) | .number'
  ```

- closed の Issue には遡って付けない（topic 別の判断の履歴は ADR の `topic` が持つ）
- 各 topic が何を含むかは [`docs/adr/README.md`](adr/README.md)「トピック別」の見出しで判断する
- 迷ったら、似た内容の既存 ADR で最も多い `topic` に合わせる:

  ```bash
  grep -il <キーワード> docs/adr/*.md | xargs grep -h '^topic:' | sort | uniq -c | sort -rn
  ```

- topics の追加・改名・削除は、ラベルの作成・`gh label edit`・付け替えを伴う。手順と到達状態は
  `.claude/rules/adr-topics.md`（`adr.config.json` / `tpl.config.json` の編集時に読み込まれる）

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

> 実装 PR の `close` は、PR に `Closes #N` を記載することで GitHub が自動で行う（Design Doc の PR は `Refs #N`。下の PR ワークフローの手順 10）。
>
> マージ後にしか確かめられない項目（次のリリース、本番にしか現れない設定、`main` でのバックフィルなど）は、PR を作る前に別の Issue に起こし、PR 本文から番号を示す。元の Issue は `Closes #N` のまま PR と一緒に閉じる。ADR への昇格などこの文書が手順として持つ後工程は書かない（ADR-3271）。

### PR ワークフロー

```
1. GitHub Issue を作成する（gh issue create）
2. git worktree add .claude/worktrees/<branch> <branch> で作業ブランチ・worktree を作成する
3. Issue ラベルを status: implementing に更新する
4. Plan モードで実装計画を作成し、レビューを受ける
   - 必要に応じて docs/design/ に設計ドキュメントを作成する（Issue を status: designing に更新）
   - Design Doc PR がマージされたら status: designed → 実装開始時に status: implementing に戻す
   - 受け入れテスト（docs/acceptance/）を計画に含める
5. 実装する
6. /hane:commit でコミットする（Conventional Commits 形式）
7. PR 前に main を取り込む — git fetch origin main && git merge --no-edit origin/main（rebase は使わない。「ブランチ戦略」参照）。コンフリクトを解消し、lint / test を再確認する
8. 手順 8〜11 に入る前に docs/process/review.md を読む。base ブランチとの差分（git diff origin/main...HEAD）に、実装の文脈を持たない新しい subagent で /engineering:code-review を当てる。指摘は review.md「指摘の重大度と対応」に従って扱い、直したら修正で触れたファイル全体にもう一度当てる（3 回まで）。lint / test を再確認する。PR はまだ作らない
9. 同じ差分に CodeRabbit CLI を 1 回だけ当てる（coderabbit review --agent --deep --base origin/main --committed）。指摘は手順 8 と同じ基準で扱い、lint / test を再確認する。修正後に CLI を回し直さない
10. 段階を判定し（node scripts/review/tier.ts classify。`securityReview` が true なら /security-review も当てる）、手順 8・9 の指摘と対応をローカルレビューの記録として本文に書いて、PR を draft で作成する（gh pr create --draft --label "risk: <段階>"、Closes #N で Issue と紐付ける。Design Doc の PR は Refs #N にして Issue を残す。ADR-3271）。draft には CodeRabbit も分単位の CI も走らない。描画や UI が変わる PR は、本文の `## Before / after` 節に before/after の画像を添付する（Claude が gh pr create を実行すると、フックが促す。仕組みは ADR-3359）
11. gh pr ready <PR番号> で draft を外す。CI はここで走り、`risk: high` と `risk: design` の PR では CodeRabbit の初回レビューもここで走る（`.coderabbit.yaml` で除外した bot の PR と、base が `main` でない PR を除く）。Claude のセッションでは、手順 9 の CLI のレビューがこのブランチで済んでいないと gh pr ready は拒否され、--draft の無い gh pr create も拒否される（仕組みと、拒否しない場合は ADR-3342）
12. CI（test / lint / format / typecheck / knip / check:cycles / build、それに段階と記録を検査する Review tier）が通過することを確認する
13. Issue ラベルを status: in-review に更新する
14. 手動検証チェックリストを実施する
15. 段階に従って進める（review.md「リスク段階」）。High は CodeRabbit のラウンドを収束させる（ラウンドを始める前に docs/process/coderabbit-rounds.md を読む。`/coderabbit-converge` で Critical / Major の未対応が無くなるまで回す。記録済みの決定を変える指摘だけ人間に確認する。Claude が `gh pr ready` で draft を外すと、Claude Code のフックがこの手順を始めるよう促す。仕組みは ADR-3333）。Low は auto-merge を有効にする（gh pr merge <PR番号> --auto --squash --delete-branch）
16. 人間のレビュー → マージ（Low は auto-merge）→ git worktree remove .claude/worktrees/<branch> でクリーンアップ
```

詳細な手順は `/hane:start-dev` スキル（[`kompiro/hane`](https://github.com/kompiro/hane) plugin）を参照。

### 規約の所在

本ファイルは常時要る流れだけを持つ。それ以外の規約は、読む時点が来たときに読む場所に分けてある。
作業を始めたときに要る手順は `docs/process/` のトピックファイル、編集行為に直結する規約はその編集を
しているときに自動で読み込まれる `.claude/rules/*.md` が正本。下の表の「発火条件」が成り立ったら、
その行の正本を読んでから進める。

| 何をするとき | 正本 | 発火条件 |
| --- | --- | --- |
| PR のレビュー（レビューの順序・リスク段階・指摘の重大度と対応・ローカルレビューの記録） | [docs/process/review.md](process/review.md) | PR ワークフローの手順 8 に入る前 |
| High の PR で CodeRabbit のラウンドを回す（収束の判定・人間に確認する指摘・ラウンドの回し方） | [docs/process/coderabbit-rounds.md](process/coderabbit-rounds.md) | 手順 15 で High の PR のラウンドを始める前、`/coderabbit-converge` を回すとき |
| stacked PR の進め方（draft の置き方・sync の順序・draft で skip される job） | [docs/process/stacked-pr.md](process/stacked-pr.md) | `gh stack` を打つ前 |
| spike と PoC のレポート（名前と寿命・preview・`reports/`） | [docs/process/spike.md](process/spike.md) | `spike/` で始まるブランチを切るとき、`reports/` の下に書くとき、`pnpm report:*` を走らせるとき |
| 開発環境（Claude Code plugin・sibling repo の clone） | [docs/process/environment.md](process/environment.md) | hane のスキルが見つからないとき、`/workspaces` の隣の repo を編集するとき |
| 受け入れテスト（アノテーション書式・到達先） | `.claude/rules/acceptance.md` | `docs/acceptance/**` の編集 |
| ドキュメントに埋める `.krs`（fence の主張宣言） | `.claude/rules/krs-fences.md` | `docs/{acceptance,spec,guide}/**` `docs/concepts*.md` の編集 |
| ADR / Design Doc（昇格・supersede・permalink・auto-merge） | `.claude/rules/adr.md` | `docs/adr/**` `docs/design/**` の編集 |
| spec / concepts（proactive TPL 同梱・適合性監査） | `.claude/rules/spec-audit.md` | `docs/spec/**` `docs/concepts*.md` の編集 |
| 複数スライスに分けた仕事の追跡 | `.claude/rules/program-slices.md` | Design Doc に `### スライス` を書いたとき |
| changeset の要否と名指し | `.claude/rules/changesets.md` | 公開対象パッケージの編集 |
| workflow の draft 判定（skip する job と `ready_for_review` の対） | `.claude/rules/stacked-pr.md` | workflow の編集 |
| ソースの行数予算（pin を上げる・下げる） | `.claude/rules/line-budget.md` | `.oxlintrc.json` の編集 |
| docs サイトの preview（レンダリング結果を PR 上で読む） | `.claude/rules/docs-site-preview.md` | サイトが公開する doc か `packages/docs-site/**` の編集 |
| リリース・依存更新の手順 | `docs/release.md` | リリース時・Dependabot PR 処理時 |

一覧と authoring 規約は `.claude/rules/README.md`。`docs/process/` の各ファイルが索引に載っていることと
本ファイルの大きさ（16,384 バイト以下）は `pnpm lint:process-index` が検査する。
