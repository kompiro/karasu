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
- **例外: stack 内のブランチは `gh stack sync` の rebase で `main` を取り込む。** スタックは各 PR の base を積み替える構造で、merge では表現できない。この 1 行は直上の rebase 禁止に優先する（「Stacked PR の進め方」）

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
12. CodeRabbit のレビューを収束させる（approve が付くまで指摘に対応する。記録済みの決定を変える指摘だけ人間に確認する）
13. 人間のレビュー → マージ → git worktree remove .claude/worktrees/<branch> でクリーンアップ
```

詳細な手順は `/hane:start-dev` スキル（[`kompiro/hane`](https://github.com/kompiro/hane) plugin）を参照。

### 人間のレビューは CodeRabbit が approve してから始める

**到達状態**: 人間がレビューを開いた時点で、CodeRabbit の最新レビューが `APPROVED`、
未解決の review thread が 0、そして人間の判断が要る論点は PR 上で質問済みになっている。

2 本目は **`--paginate` で全ページ数える**。`reviewThreads` を 1 ページだけ読むと、
古い未解決 thread が範囲外に落ちて `0` が返る。`--slurp` は `--jq` と併用できないので
`jq` に繋ぐ。

```
gh pr view <n> --json reviews \
  --jq '[.reviews[] | select(.author.login == "coderabbitai")] | last | .state'
# => APPROVED

gh api graphql --paginate --slurp -F n=<n> -f query='query($n: Int!, $endCursor: String) {
  repository(owner: "kompiro", name: "karasu") {
    pullRequest(number: $n) {
      reviewThreads(first: 100, after: $endCursor) {
        nodes { isResolved }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}' | jq '[.[].data.repository.pullRequest.reviewThreads.nodes[]
          | select(.isResolved == false)] | length'
# => 0
```

CodeRabbit は actionable な指摘があるあいだ changes-requested を出し、未対応が
なくなると approve する（`request_changes_workflow`、
[ADR-2716](adr/2716-coderabbit-request-changes-workflow.md)）。
**この approve は「自動レビューが収束した」印であって、マージ許可ではない。**
required check ではなく、default branch の ruleset は approving review を要求しない
ので、changes-requested はマージを止めず approve はマージを許可しない。マージ判断は
人間が持つ。

**PR を出した側が approve までのラウンドを回しきってから人間に渡す。** 人間の
レビューを CodeRabbit のラウンドと並走させない。並走させると収束途中の差分を人間が
読むことになり、次のラウンドで消える指摘に人間の時間を使う。

#### 人間に確認する指摘の判定

判断基準は 1 つ、**その指摘に従うと記録済みの決定が変わるかどうか**。記録済みの決定とは
Issue に書いたスコープ、`docs/adr/` の accepted な ADR、`docs/spec/`、`.claude/rules/`、
およびその PR で人間が明示した方針を指す。

| 指摘 | どうするか |
| --- | --- |
| 記録済みの決定を変えない（実装の誤り・記述の同期漏れ・誤検知・好みの範囲） | 対応可否を自分で決めて、直すか却下して解決する |
| 記録済みの決定を変える（スコープの拡縮、ADR / spec / rules の書き換え、別 ADR との衝突） | **直さずに人間へ確認する。** 指摘・該当する記録・取りうる選択肢を並べて聞く |

確認が要る論点が出ても、**それ以外の指摘は先に収束させる**。人間を待つあいだ手を止めない。
人間に渡すときは、残っている質問と、却下した指摘およびその理由をまとめて 1 回で伝える。

#### ラウンドの回し方

- 対象外は draft PR と `dependabot[bot]` / `renovate[bot]` の PR（依存更新は
  `/hane:dependabot` が別途トリアージ）。`ignore_usernames` は完全一致なので、
  他の bot を除外するには login を `.coderabbit.yaml` に足す
- 採用しない指摘は**返信で理由を書いてから閉じる**。approve は指摘に従わなくても
  到達できる。**approve を取ることを目的に指摘へ従わない**。従うべきか迷うものは、
  上の表に従って人間へ回す
- **閉じるのは読んだ thread だけ。** 判断基準はこの 1 つで、閉じ方はそれを守れる方を
  選ぶ。thread を名指しできるのは GraphQL の `resolveReviewThread` で、
  `@coderabbitai resolve` は開いている thread を**全部**閉じる（名指しできない）

  ```
  # 未解決 thread を id 付きで読む
  gh api graphql --paginate --slurp -F n=<n> -f query='query($n: Int!, $endCursor: String) {
    repository(owner: "kompiro", name: "karasu") {
      pullRequest(number: $n) {
        reviewThreads(first: 100, after: $endCursor) {
          nodes { id isResolved path line comments(first: 10) { nodes { author { login } body } } }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }' | jq '.[].data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)'

  # 読んで対応を決めた thread だけを閉じる
  gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "<id>"}) { thread { isResolved } } }'
  ```

- **一括の `@coderabbitai resolve` を使うなら、投げる前に未解決 thread を全件読む。**
  投げてから処理されるまでに数分あり、**その間に届いたレビューの指摘も一緒に閉じられる**。
  投げたあとは、resolve コメントより後に届いたレビューがないか確かめる。あれば、その
  指摘は未読のまま閉じられている

  ```
  gh pr view <n> --json reviews \
    --jq '[.reviews[] | select(.author.login == "coderabbitai")] | last | .submittedAt'
  # resolve コメントの投稿時刻より後なら、その回の指摘を読み直す
  ```

- **`@coderabbitai resolve` は PR の top-level コメントとして投げる。** review thread
  への返信の中に書いても効かない（CodeRabbit が「Post it as a new top-level PR
  comment」と返して終わる）
- 返信が learnings になるのは `Learnings Added` が返ったときだけで、再発防止は
  次の 2 項で担保する
- 同じ規約違反を繰り返し指摘されるなら、`scripts/lint/` + lefthook の drift ガードに
  落とす合図として扱う
- 同じ**誤検知**を繰り返されるなら、`path_instructions` が規約の実態とずれている合図
  として扱う。返信で毎回閉じるのではなく、glob を実際の適用範囲まで絞るか、例外を
  instruction に書く
- 設定は `.coderabbit.yaml`（レビュー言語・除外パス・path ごとの規約）

### Stacked PR の進め方

1 つの仕事を依存順のブランチ列に割り、各層を 1 PR にする運用（`gh stack`）。
コマンドの詳細は `/gh-stack` スキル、作業中に守るルールは
[.claude/rules/stacked-pr.md](../.claude/rules/stacked-pr.md)、決定の経緯は
[ADR-2643](adr/2643-stacked-pr-workflow.md) を参照。

**レビュー対象はスタック最下層（base が `main`）の 1 本だけで、残りは draft のまま
置く。** 検証もレビューも最下層でだけ起きる。

| # | すること |
| --- | --- |
| 0 | 最下層以外を draft にする（`gh pr ready <n> --undo`） |
| 1 | 最下層の draft を外す（`gh pr ready <n>`）。CodeRabbit と分単位の CI はここで動き出す |
| 2 | 先に `/code-review <n>` を当てる |
| 3 | code-review と CodeRabbit の指摘の対応可否を決める（記録済みの決定を変えるものだけ人に確認する） |
| 4 | 対応すると決めた指摘を直す |
| 5 | push すると CodeRabbit が再レビューする。3 に戻り、CodeRabbit が approve するまで繰り返す |
| 6 | CodeRabbit の approve が付いたら、そのスライスで観測できることを人が確認し、マージ可否を決める |
| 7 | `gh stack merge <n> --yes --squash` → `gh stack sync --prune` → 新しい最下層の draft を外して 1 に戻る |

- **`gh stack submit --auto --open` は使わない。** `--open` は新規 PR だけでなく
  既存 PR も ready にするので、スタック全体が一度にレビュー対象になりステップ 0 が
  壊れる。draft を外すのは常に `gh pr ready <番号>` で 1 本ずつ
- `gh stack sync` はマージ直後にだけ実行する。sync は上位ブランチを force-push し、
  走っている required E2E を cancel する。レビュー対応の push と混ぜない
- ステップ 7 の順序は sync が先、ready が後。逆にすると ready で走り出した CI を
  直後の force-push が cancel する。sync を先に置けば CodeRabbit も main 取り込み後の
  diff を読む
- マージは `gh stack merge <PR番号>`。`gh pr merge` はスタックでは通らない。PR 番号を
  渡すと、スタック全体ではなくその PR までがマージ対象になる
- Issue の status ラベルは、draft のあいだ `status: implementing`、draft を外したら
  `status: in-review`。親 Issue の `## Slice status` 表に draft / ready は書かない
  （[.claude/rules/program-slices.md](../.claude/rules/program-slices.md) の二重管理禁止）
- 受け入れテストは、そのスライスが観測可能にしたものだけを対象にする。内部だけの
  スライスは AT なしでマージしてよい

#### draft PR では分単位のジョブが走らない

`Check` / `Playwright` / VS Code E2E / preview・docs preview のデプロイは、draft の
あいだ skip される（[ADR-2643](adr/2643-stacked-pr-workflow.md)）。上位層は最下層に
降りてきて draft を外した時点で、初めて本番の CI を通る。秒で終わる validator
（ADR / TPL / reference docs / AT coverage）と gitleaks は draft でも走り続ける。

skip は workflow ごと止めるのではなく job の `if:` で行う。**job-level の `if:` で
skip されたジョブは Required check に success を報告する**ので、`types:` の
`ready_for_review` と必ず対で置く。片方だけだと、draft を外した瞬間に「一度も
走っていない green」でマージできてしまう。両者のズレは
`scripts/ci/workflow-draft-gate.test.ts` が落とす。

### docs サイトの変更は PR 上でレンダリング結果を読む

**到達状態**: サイトが公開する doc を触る PR に、レンダリング済みの docs サイトが
デプロイされている。URL は Actions の "Docs preview deployed" 表に出る。

`.github/workflows/docs-preview.yml` が `karasu-docs` プロジェクトへデプロイする。
app の preview と違い **URL は 1 階層深い** — サイトは本番と同じ `base: "/karasu/"`
で提供されるので、到達先は `https://<alias>.karasu-docs.pages.dev/karasu/`。
bare host はそこへリダイレクトされる。

- **URL は run summary に出たものを読む**（ブランチ alias は slug 化 + 切り詰めが入る）。
  PR 本文の `## Preview URL` 欄に貼る。
- **AT には書かない。** マージで消えるアドレスなので、手動確認の到達先は公開サイト
  （`https://kompiro.github.io/karasu/`）のまま — `.claude/rules/acceptance.md`。
- 発火条件はサイトが公開する doc（`PUBLISHED_EN_FILES`）と `packages/docs-site/**`。
  公開集合と `paths:` の drift は `pnpm run lint:docs-site-ci-paths-sync` が落とす。

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

### PoC のレポートは `reports/` に生成する

**到達状態**: PoC が生成した before/after 比較や計測結果が `reports/<topic>/` に
あり、`git status` は clean のまま（`reports/*` は gitignore、追跡されるのは
`reports/README.md` だけ）。規約と API の詳細は
[`reports/README.md`](../reports/README.md)、決定の経緯は
[ADR-2419](adr/2419-poc-report-directory.md)。

```
pnpm report:demo   # reports/demo/index.html — 新規レポートはこれをコピーして始める
```

判断基準は 1 つ、**その成果物が結論そのものか、結論を支える証拠か**。結論は
design doc / ADR / Issue に書く（ブランチより長生きする）。証拠は `reports/` に
置き、`docs/` からは参照しない — spike preview URL と同じ扱いで、作業中に共有する
のはよいが、ドキュメントの到達先にはしない。

- **共通のスキャフォールディングは `scripts/report/`。** HTML シェル・before/after
  ペア・`.krs` → SVG・Chromium スクリーンショットは実装済みなので、PoC ごとに
  書き直さない（`reports/` 配下はライブラリを置けない — gitignore されるため）。
- **`spike/` ブランチでは `git add -f reports/<topic>` してよい。** spike はマージ
  されないので main には届かず、レポートが spike ブランチと一緒に生き死にする。
- **読むときは `artifact.html` を private な Claude Artifact として publish する**
  （[Issue #2436](https://github.com/kompiro/karasu/issues/2436)）。生成器は
  `index.html`（file:// で開く用）と `artifact.html`（publish 用、document の骨格を
  持たない形）を毎回そろって書く。spike のレポートの読み手は回した本人ひとりなので、
  preview URL の配下に置いたり CI に運ばせたりはしない。**spike を畳むときは Artifact も
  消す**（期限で自動的に消える仕掛けは無い）。Artifact URL も `reports/` と同じ扱いで、
  `docs/` からは参照しない。

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

`pnpm check:cycles` で `madge --circular` を 7 つのプロダクションパッケージ（core / i18n / app / cli / lsp / nest / vscode）の `src/` に対して実行し、モジュール間の循環依存を検出する。

- pre-push の lefthook と CI の `Check` ジョブで自動実行されるため、ローカル / PR どちらでも循環導入時にブロックされる
- 型のみの import (`import type`) でも madge は循環として検出する。共有契約は専用の leaf module（例: `renderer/layout-types.ts`）に分離して回避する
- e2e パッケージ（`packages/e2e`, `packages/vscode-e2e`）はテスト専用で意図的にスキャン対象外

### Barrel import 禁止（core 内部）

`packages/core/src/` 配下のプロダクションコードから `**/index.js` への import を `no-restricted-imports` で禁止している（`.oxlintrc.json` の overrides）。内部から barrel を経由すると runtime 循環依存に直結するため。

- 内部モジュールは直接 deep path（例: `from "./parser/parser.js"`）で import する
- テストファイル（`*.test.ts`, `*.spec.ts`）は引き続き `from "../index.js"` を許可（公開 API としての smoke test を兼ねるため）

### 規約の所在

編集行為に直結する規約は、その編集をしているときに自動で読み込まれる
`.claude/rules/*.md` が正本。本ファイルは置き場と流れだけを持つ。

| 何を書くとき | 正本 | 発火条件 |
| --- | --- | --- |
| 受け入れテスト（アノテーション書式・到達先） | `.claude/rules/acceptance.md` | `docs/acceptance/**` の編集 |
| ドキュメントに埋める `.krs`（fence の主張宣言） | `.claude/rules/krs-fences.md` | `docs/{acceptance,spec,guide}/**` `docs/concepts*.md` の編集 |
| ADR / Design Doc（昇格・supersede・permalink・auto-merge） | `.claude/rules/adr.md` | `docs/adr/**` `docs/design/**` の編集 |
| spec / concepts（proactive TPL 同梱・適合性監査） | `.claude/rules/spec-audit.md` | `docs/spec/**` `docs/concepts*.md` の編集 |
| 複数スライスに分けた仕事の追跡 | `.claude/rules/program-slices.md` | Design Doc に `### スライス` を書いたとき |
| changeset の要否と名指し | `.claude/rules/changesets.md` | 公開対象パッケージの編集 |
| stacked PR の進め方（draft の置き方・sync の順序） | `.claude/rules/stacked-pr.md` | workflow の編集、および `gh stack` を打つとき |
| リリース・依存更新の手順 | `docs/release.md` | リリース時・Dependabot PR 処理時 |

一覧と authoring 規約は `.claude/rules/README.md`。

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
