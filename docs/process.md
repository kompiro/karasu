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

---

## 開発ワークフロー

### ブランチ戦略

- `main` への直接コミット・push は禁止 — PR 経由でマージする
- 機能開発は `git worktree add` により worktree を作成して行う
- worktree の作成先は必ず `.claude/worktrees/<branch-name>` とする（例: `git worktree add .claude/worktrees/feat/my-feature feat/my-feature`）
- ブランチ命名規則: `feat/`, `fix/`, `docs/`, `chore/`, `refactor/`, `spike/` + kebab-case
- `spike/` はマージを前提としない PoC 用。この prefix だけは CI 上の意味を持ち、push で preview がデプロイされる（「spike を PR なしで preview で動かす」節）
- **PR を出す前に main を取り込む — `rebase` は使わない。** `git fetch origin main` してから `git merge --no-edit origin/main`。rebase は他 PR のマージ済み成果を巻き添えで revert しうる。

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

### 複数スライスに分けるときの追跡

**到達状態**: 親 Issue を開けば「何スライス中いくつ落ちたか」と「今なにができて、
なにがまだできないか」が同時に読める。`pnpm program:slices` が問題を報告しない。

1 つの仕事を複数の Issue に割って実装するときは、親 Issue に次の 2 つを置く。
どちらか片方だけでは「全体としてどこまで実現できているか」に答えられない。

| 何を | どこに | 誰が更新するか |
| --- | --- | --- |
| どのスライスが落ちたか | **GitHub sub-issue**（親 Issue に登録する） | GitHub。Issue の open/closed がそのまま進捗バーになる |
| 各スライスで何ができるようになるか / その時点でまだできないこと | **親 Issue body の `## Slice status` 表** | 人。スライスを切ったときに書き、**スライスが増減した / 依存や順序が変わったとき**に直す（進捗の記録として書き換えるのではない） |

```
gh api repos/kompiro/karasu/issues/<parent>/sub_issues \
  -F sub_issue_id=$(gh api repos/kompiro/karasu/issues/<child> --jq .id)
```

> `sub_issue_id` は Issue 番号ではなく GitHub の内部 id。`-f` は値を文字列で送るので
> 422 になる — `-F` を使う。

規律は 2 つだけ:

- **完了マークを手で書かない。** `## Slice status` 表に ✅ 列を作らない。完了は
  sub-issue の state が唯一の正であり、表に持つと二重管理になって必ず drift する。
- **「その時点でできないこと」を必ず書く。** 途中のスライスを実際に使った人が
  「壊れている」と読むのを防ぐのがこの表の主目的で、「できること」だけの表は
  その役目を果たさない。

**スライスの開発中に見つけたバグは、そのスライスが作った（または到達可能にした）欠陥なら、
独立 Issue にせず親の sub-issue として登録し表に 1 行足す。** 判定はこの 1 つで、「バグか
機能か」では分けない。バグ行は前提列に**どのスライスが生んだ欠陥か**を書き、「できないこと」
列は `—` でよい。分母が動くのは正直な動きで、隠すと実態より進んで見える。

Design Doc は**なぜその切り方にしたか**を持ち、到達点の一覧は持たない（昇格時に削除される
ため、置くとプログラム完成と同時に失われる）。`docs/roadmap.md` はプログラム 1 本につき
1 行のみ。

検証:

```
pnpm program:slices          # open な親 Issue を全件チェック
pnpm program:slices 2161     # 1 本だけ
```

sub-issue を持つ親 Issue の body に `## Slice status` 節が無い、または節が
sub-issue を取りこぼしていると非ゼロ終了する。

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
8. PR を作成する（Closes #N で Issue と紐付ける）
9. CI（test / lint / format / typecheck / knip / check:cycles / build）が通過することを確認する
10. Issue ラベルを status: in-review に更新する
11. 手動検証チェックリストを実施する
12. レビュー → マージ → git worktree remove .claude/worktrees/<branch> でクリーンアップ
```

詳細な手順は `/hane:start-dev` スキル（[`kompiro/hane`](https://github.com/kompiro/hane) plugin）を参照。

### spike を PR なしで preview で動かす

**到達状態**: `spike/` ブランチを push すると、PR を作らずに
`https://<slug>.karasu.pages.dev` で実物を触れる。実 URL は Actions の該当 run の
Summary（"Spike preview deployed" 表）に出る。

```
git switch -c spike/<name> origin/main
# 実装して commit
git push -u origin spike/<name>
gh run list --workflow=spike-preview.yml --branch=spike/<name>   # run id を得る
gh run view <run-id>                                             # Summary に Preview URL
```

`.github/workflows/spike-preview.yml` が `push: branches: [spike/**]` で発火する。
判断基準は 1 つ、**ブランチ名が `spike/` で始まるかどうか**だけ。PR preview
（`preview.yml`）とは別ワークフローで、PR 側の発火条件・後始末は spike の都合で変えない。

- **URL は Summary に出たものを読む。** Cloudflare のブランチ alias は slug 化 +
  長さ切り詰めが入るため、ブランチ名から組み立てると外れる。
- **後始末はブランチ削除。** `git push origin --delete spike/<name>` で `delete`
  イベントが走り、そのブランチの preview デプロイが消える。spike を残したまま放置
  すると preview も残る。
- **この URL を記録に残さない。** ブランチを消した時点で 404 になるので、AT や
  ドキュメントの到達先には書かない（「手動確認の到達先は本番 URL で書く」節）。

> `push` イベントで使われるワークフロー定義は push されたブランチ自身のものなので、
> `spike-preview.yml` が main に入るより前に切ったブランチでは発火しない（エラーも
> 出ずに無反応になる）。上のコマンドのように `origin/main` から切る。

### Claude Code plugin のセットアップ

karasu のワークフローを Claude Code 上で再現するには、portable な skill 群を提供する `kompiro/hane` plugin をインストールする。

```
/plugin marketplace add kompiro/hane
/plugin install hane@kompiro-hane
```

plugin にバンドルされる skill とその karasu 内での主な用途:

| Skill | 用途 |
|---|---|
| `/hane:start-dev` | Issue → worktree → 計画 → 実装 → コミット → PR の全体フロー |
| `/hane:commit` | Conventional Commits でコミット |
| `/hane:ship` | push → PR → CI → クリーンアップ |
| `/hane:design-doc` | `docs/design/` への設計検討記録の作成 |
| `/hane:acceptance-test` | `docs/acceptance/NNNN-*.md` の受け入れテスト記録作成 |
| `/hane:qa` | `docs/qa/YYYY-MM-DD-checklist.md` 生成 |
| `/hane:review-docs` | リンク切れ・ドキュメント整合性レビュー |
| `/hane:sync-docs` | コード現状に合わせてリファレンス系ドキュメントを更新 |

karasu 専用の skill（`/svg-icon`, `/update-examples`）は `.claude/skills/` 配下にローカル定義されている（plugin 化対象外）。

### Sibling repo の clone（`adr-tools`, `tpl-tools`, `hane` 等）

devcontainer の `/workspaces` は `node` ユーザー所有に設定されており、karasu の隣に関連リポジトリを clone できる。Claude Code の sandbox にも `/workspaces` を `additionalDirectories` で追加済みのため、セッションを離れずに sibling repo の更新作業ができる。

```
git clone https://github.com/kompiro/adr-tools.git /workspaces/adr-tools
git clone https://github.com/kompiro/tpl-tools.git /workspaces/tpl-tools
git clone https://github.com/kompiro/hane.git     /workspaces/hane
```

karasu 側のセッション内で編集・コミット・PR 作成ができる。

### 循環依存チェック

`pnpm check:cycles` で `madge --circular` を 5 つのプロダクションパッケージ（core / app / cli / lsp / vscode）の `src/` に対して実行し、モジュール間の循環依存を検出する。

- pre-push の lefthook と CI の `Check` ジョブで自動実行されるため、ローカル / PR どちらでも循環導入時にブロックされる
- 型のみの import (`import type`) でも madge は循環として検出する。共有契約は専用の leaf module（例: `renderer/layout-types.ts`）に分離して回避する
- e2e パッケージ（`packages/e2e`, `packages/vscode-e2e`）はテスト専用で意図的にスキャン対象外

### Barrel import 禁止（core 内部）

`packages/core/src/` 配下のプロダクションコードから `**/index.js` への import を `no-restricted-imports` で禁止している（`.oxlintrc.json` の overrides）。内部から barrel を経由すると runtime 循環依存に直結するため。

- 内部モジュールは直接 deep path（例: `from "./parser/parser.js"`）で import する
- テストファイル（`*.test.ts`, `*.spec.ts`）は引き続き `from "../index.js"` を許可（公開 API としての smoke test を兼ねるため）

### QA チェックリスト

`/hane:qa` スキルはリリース前や任意のタイミングで実行できる。

```
/hane:qa を実行
  → docs/acceptance/*.md を読み込む
  → bash コマンドを自動実行（build / test / lint 等）
  → 手動確認が必要な - [ ] 項目を収集
  → docs/qa/YYYY-MM-DD-checklist.md を生成
```

- 生成ファイルは git にコミットしない（`.gitignore` 対象）
- 自動化（`packages/e2e/` の Playwright）は手動 QA を置き換えず補完する

### 自動化アノテーションの書式

自動化されたケースを `docs/acceptance/*.md` に反映するときは、`/hane:acceptance-test` スキルの「自動化アノテーション」節に従って `> ✅ Automated — ... › ...` 形式の blockquote を箇条書き直下に添える。

### 手動確認の到達先は本番 URL で書く

AT の `🧑 Manual` 項目は**一度 OK にして終わるものではない**（実機確認は再実行される
前提で、チェックは常に未チェックのまま置かれる）。そのため到達先には、記録より
寿命の短い参照を書かない。

| 対象 | 書く URL |
| --- | --- |
| app | `https://karasu.kompiro.dev/`（[ADR-1809](adr/1809-app-custom-domain-karasu-kompiro-dev.md)、`deploy.yml` が main への push で更新） |
| docs-site | `https://kompiro.github.io/karasu/`（`pages.yml` が main への push で更新） |

**ローカル dev サーバの起動コマンドも、ブランチ名入りの Cloudflare preview URL も
書かない。** 前者は読み手にチェックアウトを要求し、後者は PR がマージされた時点で
404 になる。PR 内で変更を先に見たいときは preview を使ってよいが、それは PR 本文の
Preview URL 欄の役割であって、AT に残す情報ではない。

観点は [TPL-2254](test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)。

### AT レコードは `docs/design/` を指さない

同じ理由で、**AT から Design Doc を参照しない**。Design Doc は昇格時に削除されるので、
AT が指した瞬間から**規約上いつか必ず切れるアドレス**になる。設計根拠は **Issue** で
指す。ADR が既にあるなら併記する:

```markdown
- **関連 Issue**: [#2259](https://github.com/kompiro/karasu/issues/2259)
- **設計 (ADR)**: [ADR-2259](../adr/2259-permalink-payload-cap.md)
```

実装 PR の時点ではまだ ADR が無いので Issue だけでよい。**ファイルが無いうちに ADR への
リンクを書かない** — 前方参照は切れたリンクと区別がつかない。昇格 PR で
`- **設計 (ADR)**: …` を足す。

強制は `pnpm at:check-coverage`（`--strict` で落ちる）。観点は同じく TPL-2254。

### AT に埋める `.krs` スニペットの fence 規約

手順に書いた `.krs` は誰も実行しないため、放っておくと文法から静かにズレる。`pnpm at:check-coverage` が `docs/acceptance/*.md` の ` ```krs ` ブロックを実際に parse するので、fence の情報文字列でスニペットの主張を宣言する。

| fence | 主張 | ガード |
|-------|------|--------|
| ` ```krs ` | 現行文法で通る完全なモデル | parse エラーゼロを検証 |
| ` ```krs fragment ` | 抜粋（ファイル全体ではない） | parse しない |
| ` ```krs invalid ` | 意図的に不正な入力（診断のデモ） | いまも parse エラーが出ることを検証 |

`invalid` を逆向きにも検証するのは、文法が緩んで例が例でなくなる変化も拾うため。観点は [TPL-2047](test-perspectives/TPL-2047-doc-embedded-krs-is-parsed-not-prose.md)。

### 設計判断を ADR に残すタイミング

設計ドキュメントのステータスが「採用」または「取りやめ」に確定したら ADR を作成する。

新規 Design Doc を書くときの雛形は `docs/design/TEMPLATE.md` を参照する。

ADR の内容:
- **Frontmatter**: `id` / `title` / `status` / `date` と、該当する関係性（`supersedes` / `depends_on` 等）を YAML frontmatter に記述する。雛形は `docs/adr/TEMPLATE.md` を参照。ローカル検証は `pnpm adr:validate`。
- **背景**: なぜ検討することになったか
- **決定**: 何を決めたか（一文で）
- **理由**: 採用・見送りの根拠（箇条書き）
- **関連**: GitHub Issue / 設計ドキュメントへのリンク

ADR 作成後に設計ドキュメントを削除する。Frontmatter スキーマ・関係性セマンティクス・
バリデータの詳細は [ADR-788](adr/788-adr-knowledge-graph.md) を参照。

### spec / concepts 改訂時の proactive TPL 同梱

`docs/spec/` または `docs/concepts*.md` に**新規セクションを追加する PR**は、そのセクションの規定が破られたときに検出する **proactive TPL を最低 1 件、同 PR で起こす**（または既存 TPL を当該 spec に back-ref で紐付ける）。

運用:

- spec 章末尾に `> Related TPLs:` 注釈を追加し、当該章を裏付ける TPL を一覧する（spec ↔ TPL の双方向リンク）
- 新規 TPL の本文末尾に「## 派生元 spec」セクションを置き、`docs/spec/...#anchor` を引用する
- spec 章の改訂 PR description のチェックリストに「対応する proactive TPL を起こした / 既存 TPL に back-ref した」を含める

### 既存 ADR を見直すとき

既に決定済みの ADR を覆す・方針変更する場合は、**旧 ADR を書き換えず新 ADR で supersede する**。

- 旧 ADR はそのまま歴史的記録として残す
- 新 ADR を作成し、背景に「何が変わったためこの再評価に至ったか」を明記する
- 旧 ADR のステータス行を `決定済み` から `Superseded by ADR-<n>` に更新する
- Frontmatter では旧 ADR を `status: superseded` + `superseded_by: ADR-<n>`、新 ADR を `supersedes: [旧 ADR ID]` とする。`pnpm adr:validate` が双方向整合をチェックする
- 新 ADR の「関連」に旧 ADR へのリンクを記載する
