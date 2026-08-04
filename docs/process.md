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
- worktree の作成先は必ず `.claude/worktrees/<branch-name>` とする（例: `git worktree add .claude/worktrees/feat/my-feature feat/my-feature`）
- ブランチ命名規則: `feat/`, `fix/`, `docs/`, `chore/`, `refactor/`, `spike/` + kebab-case
- `spike/` はマージを前提としない PoC 用。この prefix だけは CI 上の意味を持ち、push で preview がデプロイされる（「spike を PR なしで preview で動かす」節）
- **PR を出す前に main を取り込む — `rebase` は使わない。** `git fetch origin main` で main を最新化し、`git merge --no-edit origin/main` で作業ブランチに main を取り込んでから PR を作成する。rebase は事故になる（interactive rebase の todo 重複 / hook 干渉でスタックする、また main を取り込まないまま分岐の古い stale ブランチを squash すると他 PR のマージ済み成果を巻き添えで revert しうる）。merge なら乖離が通常のコンフリクトとして可視化され、履歴も非破壊。

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
- どちらでも TPL の素材になりうる（testing-topic TPL は `test-infra` 起源、product-topic TPL は `bug` 起源が典型）
- 3-Yes ルールの起動トリガーは `bug` と `test-infra` の双方

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
  sub-issue の state が唯一の正であり、表に持つと二重管理になって必ず drift する
  （[TPL-1032](test-perspectives/TPL-1032-derived-state-staleness.md) — 派生 state の二重持ち）。
- **「その時点でできないこと」を必ず書く。** 途中のスライスを実際に使った人が
  「壊れている」と読むのを防ぐのがこの表の主目的で、「できること」だけの表は
  その役目を果たさない。

**スライスの開発中に見つけたバグは、そのスライスが作った（または到達可能にした）欠陥なら、
独立 Issue にせず親の sub-issue として登録し表に 1 行足す。** 判定はこの 1 つで、「バグか
機能か」では分けない。バグ行は前提列に**どのスライスが生んだ欠陥か**を書き（後から原因を
辿れるように）、「できないこと」列は `—` でよい。分母が動くのは正直な動きで、隠すと実態より
進んで見える。実例は [#2221](https://github.com/kompiro/karasu/issues/2221)（boundary
slice A [#2178](https://github.com/kompiro/karasu/issues/2178) が cross-file 多重所属を
正常状態にしたが、その状態が無診断だった）。

Design Doc は**なぜその切り方にしたか**（スライスの依存関係・各スライスの実装手順）を
持ち、到達点の一覧は持たない。Design Doc は ADR 昇格時に削除されるため、そこに置くと
プログラムが完成した瞬間に一覧が失われる。この配線は ADR-2218 の
「決定 = ADR / 適用状態 = roadmap」を Issue 軸に広げたもので、`docs/roadmap.md` は
プログラム 1 本につき 1 行のみ保持する（ADR-2218 が ✅ による完了マークを禁じている）。

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
判断基準は 1 つ、**ブランチ名が `spike/` で始まるかどうか**だけ。

PR preview（`preview.yml`）とは**別ワークフロー**にしてある。共有しているのは
Cloudflare Pages プロジェクトだけで、PR 側の発火条件・concurrency・後始末は
spike の都合で一切変えない。spike の経路をいじって PR の経路を壊したら本末転倒になる。

- **`paths:` フィルタは spike 側には掛けない。** spike の push は意図的な行為なので、
  「push したのに何も起きない」ほうが余分なビルド 1 回より損。
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

karasu 側のセッション内で `/workspaces/adr-tools` / `/workspaces/tpl-tools` / `/workspaces/hane` の編集・コミット・PR 作成が可能。書き込み権限は image build 時に Dockerfile で `/workspaces` を `node:node` 所有に設定しているため、devcontainer を作り直した直後から有効。

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

`/hane:qa` スキルはリリース前や任意のタイミングで実行できる。

```
/hane:qa を実行
  → docs/acceptance/*.md を読み込む
  → bash コマンドを自動実行（build / test / lint 等）
  → 手動確認が必要な - [ ] 項目を収集
  → docs/qa/YYYY-MM-DD-checklist.md を生成
```

### 自動化アノテーションの書式

自動化されたケースを `docs/acceptance/*.md` に反映するときは、`/hane:acceptance-test` スキル（plugin: `kompiro/hane`）の「自動化アノテーション」節に従って `> ✅ Automated — ... › ...` 形式の blockquote を箇条書き直下に添える。書式は repo 全体で統一されており、過去の "Verified by" メタ欄や "Automated Checks" 節分割は順次本方式に畳まれる（#916）。

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
404 になる（実例: `https://fix-legend-human-annotation.karasu.pages.dev` 等 3 件が
腐ったまま残っていた — [#2254](https://github.com/kompiro/karasu/issues/2254)）。
PR 内で変更を先に見たいときは preview を使ってよいが、それは PR 本文の Preview URL
欄の役割であって、AT に残す情報ではない。

> 「マージ時点で 404 になる」が実際に成り立つようになったのは
> [#2294](https://github.com/kompiro/karasu/issues/2294) 以降。それ以前は削除が
> Cloudflare に拒否されており、上記 3 件を含む過去の preview URL は腐るどころか
> 生きたまま残っていた。溜まった分の掃除は `preview-janitor.yml`（手動実行）。

観点は [TPL-2254](test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)。

### AT レコードは `docs/design/` を指さない

同じ理由で、**AT から Design Doc を参照しない**。Design Doc は ADR 昇格時に
削除されるので（前掲「設計判断を ADR に残すタイミング」）、AT が指した瞬間から
**規約上いつか必ず切れるアドレス**になる。

設計根拠は **Issue** で指す。Issue は削除されず、design PR と実装 PR の両方へ
辿れる。ADR が既にあるなら併記する:

```markdown
- **関連 Issue**: [#2259](https://github.com/kompiro/karasu/issues/2259)
- **設計 (ADR)**: [ADR-2259](../adr/2259-permalink-payload-cap.md)
```

実装 PR の時点ではまだ ADR が無いので Issue だけでよい。ADR 番号は起点 Issue 番号と
一致する（[ADR-2188](adr/2188-tpl-issue-number-ids.md)）が、**ファイルが無いうちに
リンクを書かない** — 前方参照は切れたリンクと区別がつかない。昇格 PR で
`- **設計 (ADR)**: …` を足す。

強制は `pnpm at:check-coverage`（`scripts/acceptance/design-refs.ts`）。
`docs/acceptance/**` から `docs/design/` への参照が 1 つでもあれば finding として
報告し、`--strict` で落ちる。観点は同じく TPL-2254。

> この規約を入れた時点で、AT から Design Doc への 46 参照のうち **27 が既に
> 解決しない**アドレスを指しており、うち 1 件
> （`1821-layer-toggle-external-infra.md`）は main に残った壊れた markdown
> リンクだった。既存の link check は `packages/docs-site`（公開サブセット）しか
> 見ておらず、残りはバッククォートの地の文なのでどのリンクチェッカでも
> 検出できない形だった。

### AT に埋める `.krs` スニペットの fence 規約

手順に書いた `.krs` は誰も実行しないため、放っておくと文法から静かにズレる（AT-0006 AC-1.2 が現行文法で parse できない状態のまま放置されていた — #2047）。`pnpm at:check-coverage` が `docs/acceptance/*.md` の ` ```krs ` ブロックを実際に parse するので、fence の情報文字列でスニペットの主張を宣言する。

| fence | 主張 | ガード |
|-------|------|--------|
| ` ```krs ` | 現行文法で通る完全なモデル | parse エラーゼロを検証 |
| ` ```krs fragment ` | 抜粋（ファイル全体ではない） | parse しない |
| ` ```krs invalid ` | 意図的に不正な入力（診断のデモ） | いまも parse エラーが出ることを検証 |

`invalid` を逆向きにも検証するのは、文法が緩んで例が例でなくなる変化も拾うため。実装は `scripts/acceptance/krs-fences.ts`、観点は [TPL-2047](test-perspectives/TPL-2047-doc-embedded-krs-is-parsed-not-prose.md)。

- 生成ファイルは git にコミットしない（`.gitignore` 対象）
- 手動確認項目は生成されたファイルをもとに順番に実施する
- `/hane:qa` は手動 QA のチェックリストを生成する。機械化可能な AT は Playwright による E2E 層（`packages/e2e/`）が補完する。自動化は手動 QA を置き換えず補完する（詳細は ADR-529）

### 設計判断を ADR に残すタイミング

設計ドキュメントのステータスが「採用」または「取りやめ」に確定したら ADR を作成する。

新規 Design Doc を書くときの雛形は `docs/design/TEMPLATE.md` を参照する。

ADR の内容:
- **Frontmatter**: `id` / `title` / `status` / `date` と、該当する関係性（`supersedes` / `depends_on` 等）を YAML frontmatter に記述する。雛形は `docs/adr/TEMPLATE.md` を参照。ローカル検証は `pnpm adr:validate`。
- **背景**: なぜ検討することになったか
- **決定**: 何を決めたか（一文で）
- **理由**: 採用・見送りの根拠（箇条書き）
- **関連**: GitHub Issue / 設計ドキュメントへのリンク

設計ドキュメントに詳細な分析が残っている場合は、ADR 作成後に設計ドキュメントを削除する。
（詳細は GitHub Issue のディスカッションや PR コメントで追えるため）

Frontmatter スキーマ・関係性セマンティクス・バリデータの詳細は [ADR-788](adr/788-adr-knowledge-graph.md) を参照。

### spec / concepts 改訂時の proactive TPL 同梱

`docs/spec/` または `docs/concepts*.md` に**新規セクションを追加する PR**は、そのセクションの規定が破られたときに検出する **proactive TPL を最低 1 件、同 PR で起こす**（または既存 TPL を当該 spec に back-ref で紐付ける）。

理由: spec の明文化と TPL を時間差で進めると、明文化されない期間に「概念だけはあるがテスト観点が無い」状態が生まれ、そこで踏んだ bug が retrospective TPL を量産する。spec を書くタイミングで proactive TPL を起こすほうが、proactive-first ライフサイクル（`docs/test-perspectives/README.md` 「TPL のライフサイクル」）の理想形に近づく。

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

理由: ADR は時点の意思決定と根拠を保存するログであり、過去の判断が「当時は正しかった」
ことを消してはならない。前提条件の変化を読み取れるようにするには、新旧を並置できる方が良い。

## Dependabot 運用ルール

### 通常の version update

- スケジュールは weekly / Monday、cooldown は全 semver レベル 7 日（`.github/dependabot.yml`）。
- 月曜のバッチ起票後にレビュー → マージする。バッチ単位で取り込み判断を ADR に残すことがある（例: `ADR-909`）。

### Security update（GHSA 起因の即時 PR）

Dependabot security update は alert 検知時に即時起票され、`schedule` も `cooldown` も `updates:` の設定も参照しない。月曜以外に Dependabot PR が出ていたら、まず security update かどうかを確認する。

**pnpm workspace で同一 advisory に対して PR が複数起票された場合の処理:**

1. `pnpm-lock.yaml` を含む root スコープの PR を merge する。
2. `packages/<name>/package.json` のみを書き換える PR は close する。

理由: pnpm workspace では依存宣言（`packages/*/package.json`）と解決済みバージョン（root の `pnpm-lock.yaml`）が別 manifest として alert 化されるため、Dependabot は alert ごとに PR を作る。`packages/*` 単独 PR は workspace ルートの lockfile を更新できず、`pnpm install --frozen-lockfile` で必ず CI が落ちる構造的制約があり、`@dependabot recreate` でも直らない。`dependabot.yml` でも抑制不可（security update は `updates:` を参照しない）。

詳細・経緯は `ADR-1038`（`docs/adr/1038-dependabot-security-2026-04-29.md`）を参照。同様の事象が再発した場合は ADR を増やさず、本ルールに従って処理する。

## リリース運用

npm への公開は **changesets** で管理し、認証は **npm Trusted Publishing（GitHub OIDC）** で行う（token レス）。設計の経緯は [ADR-1315](adr/1315-release-automation-changesets.md)（changesets 採用）と [ADR-9020](adr/9020-npm-trusted-publishing-oidc.md)（OIDC 移行）を参照。

### 対象パッケージ

npm 公開対象は `karasu`（CLI、`packages/cli`）と `@karasu-tools/core`（ライブラリ）。CLI は esbuild で `@karasu-tools/core` を内包した単一 ESM バンドルとしてビルドする（`packages/cli` の `build` スクリプト。公開 core への依存には切り替えない）。`@karasu-tools/app` / `@karasu-tools/lsp` / `@karasu-tools/e2e` / `@karasu-tools/vscode-e2e` は `.changeset/config.json` の `ignore` に入っており版管理・公開とも対象外。

`karasu-vscode`（VS Code 拡張）も changesets の**版管理対象**（`ignore` から除外）。ただし `private: true` のため `changeset publish` は npm へ publish せず（自動スキップ）、配布は Marketplace 経由で別管理（手動 — Issue #1316、後述「VS Code 拡張のリリース」）。changesets は version bump と `packages/vscode/CHANGELOG.md` 生成のみを担う。経緯は [ADR-1758](adr/1758-vscode-changeset-versioning.md)（ADR-1315 を refine）を参照。

> **`@karasu-tools/core` は v0.x（TS API、無保証）**。`.krs` / `.krs.style` 言語は v1.0 だが、TS API は minor で破壊的変更を許す（[ADR-1314](adr/1314-krs-spec-v1-freeze.md)）。`exports` は公開先に `dist`（types + ESM）を指し、`development` 条件で repo 内は TS ソースを解決する（root tsconfig `customConditions: ["development"]`）ため `pnpm typecheck` は build 非依存のまま。`@karasu-tools` npm org は確保済み。

> **`karasu`（CLI）の version floor は 0.6.0**。npm の `karasu` 名には 2020–2021 の旧 incarnation の履歴があり `〜0.5.2` まで既出。現アーキテクチャツールは 0.0.1 / 0.1.0 で再スタートしたが、changeset 計算の版が旧版と衝突して `E400 Cannot publish over previously published version` になるため、`karasu` は 0.5.2 を越えて **0.6.0 へ手動 leap** 済み（#1774）。以降は 0.6.0 から changeset 駆動で進める。`@karasu-tools/core` は npm 上の履歴がクリーンなため独立して 0.x のまま（independent versioning）。

### 変更を加えるとき

公開・配布対象パッケージ（`karasu` / `@karasu-tools/core` / `karasu-vscode`）に利用者から見える変更を入れる PR では、`pnpm changeset` を実行して `.changeset/<name>.md` を追加し、PR に含める。

- bump レベルは semver に従う（破壊的変更 = major、機能追加 = minor、修正 = patch）。各パッケージとも 0.x なので、当面は破壊的変更も minor で扱ってよい。
- **どのパッケージを名指すか**（依存の cascade 非対称性に注意 — 詳細は [ADR-1758](adr/1758-vscode-changeset-versioning.md)）:
  - `packages/core` の利用者向け変更 → **`@karasu-tools/core` と `karasu` の両方**を名指す。`@karasu-tools/core` の bump は `karasu-vscode`（core を実 dependency に持つ）へ patch を自動 cascade するが、`karasu`（core を devDependency でバンドル）へは cascade しないため CLI は別途名指しが要る。
  - `packages/cli` 固有の変更 → `karasu`
  - `packages/vscode` 固有の変更 → `karasu-vscode`
- 内部リファクタ・テスト・ドキュメントのみ・公開対象外パッケージのみの変更では changeset 不要。
- `CHANGELOG.md` の文面は利用者向けに書く（コミット subject の流用ではなく）。
- **experimental notation に触れる変更は promotion gate を通す**: `docs/roadmap.md` の [§promotion gate](roadmap.md#promotion-gatenotation-評価の規律) に載る watch item（experimental notation）を stable 層へ昇格させる／挙動を変える changeset では、[ADR-1820](adr/1820-notation-promotion-gate.md) の gate を通す。昇格なら **載せる言語版（後方互換な追加 = 言語 v1.x / 既存構文の変更・再設計 = 言語 v2.0）を決め、changeset と `CHANGELOG.md` に言語版遷移を明記**する（パッケージの bump レベルは semver 規約で独立に決める — [ADR-2124](adr/2124-version-vocabulary.md)。語彙の正典は [roadmap §version vocabulary](roadmap.md#version-vocabulary版語彙の定義--正典)）。判断根拠（実利用証拠 = karasu-nest の共有 corpus）を PR に書く。据え置きが既定なので、証拠が無ければ experimental のままにする。

`pnpm changeset status` で「未リリースの変更があるか」を確認できる。

### リリースの流れ

リリースは **GitHub Actions 起動**で行う。ローカルで `changeset version` は実行しない。Actions に PR 作成権限を与えなくて済むよう、bot による "Version Packages" PR は使わない（経緯は Issue #1370）。配線の決定は [ADR-1370](adr/1370-release-flow-actions-driven.md) を参照。

リリース手順は以下のとおり:

1. **"Release — Prepare"**（`release-prepare.yml`）を Actions タブから `workflow_dispatch` で起動する。`changeset version`（版 bump + `CHANGELOG.md` 生成 + lockfile 更新）を実行し、`chore/release-<version>` ブランチを push する。pending changeset が無ければ何もせず終了する。
2. その push されたブランチから **PR を開く**（Actions は PR を作れないので「Compare & pull request」を 1 クリック。人が開くことで必須チェックも走る）。
3. **マージ前に版番号と `CHANGELOG.md` を必ず読む**（main ruleset の必須承認数は 0 = self-merge 可。目視確認はこの運用ルールで担保する）。このとき、**experimental notation の stable 昇格や破壊的変更が CHANGELOG に含まれるなら、promotion gate（[ADR-1820](adr/1820-notation-promotion-gate.md)）が通っているか・言語版に触れる変更が changeset / CHANGELOG に言語版遷移として明記されているか（[ADR-2124](adr/2124-version-vocabulary.md)、表記は `.krs language vX.Y`）を確認**する。問題なければ **squash マージ**する。
4. マージで `main` の `packages/**/CHANGELOG.md` が変わり、`release.yml`（`paths` filter）が発火 → `changeset publish` が bump 済みパッケージを npm に公開する（`workflow_dispatch` での手動再実行も可）。
5. 認証は **GitHub OIDC（Trusted Publishing）** — `release.yml` の `id-token: write` を npm が短命クレデンシャルに交換する。`NPM_TOKEN` は不要（保持しない）。provenance は trusted publishing で**自動付与**される（`--provenance` 不要）。要件は npm >= 11.5.1 / Node >= 22.14.0 で、workflow が `npm i -g npm@latest` で満たす。

> 前提: 公開対象パッケージごとに npmjs.com で **Trusted Publisher**（org `kompiro` / repo `karasu` / workflow `release.yml`）を登録しておくこと。未登録のパッケージは OIDC publish が失敗する。新規パッケージは Trusted Publisher を設定できる前に一度存在している必要があるため、**初回だけローカルから手動 publish**（`pnpm publish`、provenance off + OTP）してから登録する。
>
> changeset-bot（GitHub App、後述）を導入したらこのフローは bot-PR ベースに戻せる。

### VS Code 拡張のリリース

`karasu-vscode` の**版 bump と `CHANGELOG.md` は上記 changesets フローで自動**化される（`changeset version` が `packages/vscode/package.json` の version を更新）。`private: true` なので `changeset publish`（`release.yml`）は npm へ publish しない。**Marketplace への公開は手動**で、版が bump された後に行う:

1. リリース PR（`changeset version` 済み）をマージし、`packages/vscode/package.json` の version が確定した状態にする。
2. **"VS Code Extension Release"**（`vscode-release.yml`）を Actions タブから `workflow_dispatch` で起動する。`package.json` の version をそのまま Marketplace（publisher `karasu-tools`）へ publish する（pre-release チャネルは `pre_release` input で選択）。
3. 認証は **Microsoft Entra ID via GitHub OIDC**（`AZURE_CLIENT_ID` / `AZURE_TENANT_ID` 変数。未設定時は build + package のみで publish はスキップ）。前提セットアップは #1316 を参照。

> **`packages/vscode/README.md` の画像は絶対 URL で書く**（`https://raw.githubusercontent.com/kompiro/karasu/main/packages/vscode/images/...`）。`vsce` は相対画像パスを repository-**root** の raw URL に書き換えるが `repository.directory`（`packages/vscode`）を考慮しないため、monorepo では Marketplace 上で 404 になる（0.1.2 でリンク切れ → 0.1.3 で絶対 URL 化して解決、#1779）。スクリーンショットを追加するときも絶対 URL を使う。

> 拡張は CLI とは独立した cadence で出す（マージのたびに自動公開はしない）。CHANGELOG 変更での自動 publish は重さ・cadence の観点から採らない（[ADR-1758](adr/1758-vscode-changeset-versioning.md) の却下案）。

### 未対応のフォローアップ

- **changeset-bot**（GitHub App）— PR に changeset の有無をコメントしてくれる。リポジトリを public 化したので有効化を検討する。
