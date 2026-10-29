# docs/process.md を常時読む核と、作業を始めたときに読むトピックに分ける

- **日付**: 2026-10-29
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3337](https://github.com/kompiro/karasu/issues/3337)
  - 関連 ADR: [ADR-2356](../adr/2356-doc-placement-by-read-timing.md)（読まれる時点で置き場を決める 3 層。本設計はその「発火時」層を広げる）、[ADR-2351](../adr/2351-process-md-holds-instructions.md)（process.md は「今どうするか」だけを持つ）、[ADR-2687](../adr/2687-adr-body-is-immutable.md)（ADR 本文は書き換えない）、[ADR-3286](../adr/3286-risk-based-review-tiers.md)（リスク段階）
  - 関連 TPL: [TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)（記録は記録より長生きするアドレスを指す）、[TPL-2253](../test-perspectives/TPL-2253-removal-sweep-needs-a-search-not-a-file-list.md)（取り除いた名前の掃除はファイル一覧ではなく検索で行う）
  - コード: `scripts/review/tier.ts`、`.coderabbit.yaml`、`.claude/skills/coderabbit-converge/SKILL.md`、`.claude/rules/stacked-pr.md`

## 背景・課題

`CLAUDE.md` は「作業開始時は必ず `docs/process.md` を読む」と指定している。したがって process.md は全文が毎セッションのコンテキストに載る。

ADR-2356（2026-08-05）は規約を読まれる時点で 3 層に分け、process.md を 12,659 バイトまで縮めた。

| 層 | 読まれる時点 | 置き場 |
| --- | --- | --- |
| 常時 | セッション開始時 | `docs/process.md` |
| 発火時 | その作業を始めたとき | `docs/*.md`（`docs/release.md`） |
| 編集時 | 該当ファイルを編集するとき | `.claude/rules/*.md` |

その後、レビューの段階（ADR-3286）、CodeRabbit のラウンド、stacked PR、spike と `reports/` などの節が process.md に足され、2026-10-29 の `main` で 45,512 バイト / 618 行に戻った。足された節の大半は常時層ではなく、特定の作業を始めたときにだけ要る。ADR-2356 が未決に残した「発火時層のカバレッジ」がこの状態である。

## 現状（インベントリ）

2026-10-29 の `main` で節ごとのバイト数を測った。

| 節 | バイト | 要る時点 |
| --- | ---: | --- |
| ドキュメントのライフサイクル、各ディレクトリの役割 | 1,378 | 常時 |
| ブランチ戦略、Issue・PR 記述ルール | 1,915 | 常時 |
| Issue 種別 / トピック / ステータスラベル | 3,247 | Issue を起票する・status を付け替えるとき（ほぼ毎セッション） |
| PR ワークフロー（番号付き手順と、`/hane:start-dev` への 1 行） | 3,606 | PR を作るとき（ほぼ毎セッション） |
| PR ワークフロー直後の 2 段落（CodeRabbit の初回レビュー、CLI を ready の前に 1 回） | 2,111 | 手順 8〜11 |
| リスク段階、指摘の重大度と対応、ローカルレビューの記録 | 6,422 | 手順 8〜11 |
| High の PR の収束、人間に確認する指摘の判定、ラウンドの回し方 | 9,211 | High の PR で CodeRabbit のラウンドを回すとき |
| Stacked PR の進め方 | 3,477 | `gh stack` を打つとき |
| draft PR では分単位のジョブが走らない | 888 | スタックの上位層を待つとき、workflow の draft 判定を編集するとき。job 一覧の更新先として `.claude/rules/stacked-pr.md` がこの節を指す（`scripts/ci/workflow-draft-gate.test.ts` のコメントは親の「Stacked PR の進め方」を指す）。draft には分単位の CI が走らないこと自体は手順 10 にもある |
| docs サイトの変更は PR 上でレンダリング結果を読む | 1,197 | サイトが公開する doc を変える PR |
| spike の名前と寿命、spike preview、`reports/` | 6,341 | `spike/` ブランチを切るとき、PoC のレポートを出すとき |
| Claude Code plugin のセットアップ、Sibling repo の clone | 1,917 | 環境を作るとき、隣の repo を編集するとき |
| 循環依存チェック、Barrel import 禁止 | 1,292 | `pnpm check:cycles` か oxlint が落ちたとき |
| 規約の所在 | 1,439 | 常時（地図） |
| QA チェックリスト | 527 | なし（`/hane:qa` は廃止済み） |

process.md を名指しする参照は、`docs/process.md` 以外の追跡ファイルに 165 件ある。

- **ADR frontmatter の `assumptions:` が 14 件**。`pnpm adr:check-assumptions` が検査する。`grep: <path> :: <regex>` は 1 ファイルの全文に正規表現を当てる形式で、glob は使えない。status を問わず全 ADR を検査する。移動で落ちるのは次の 5 件で、残りは核に残る行に当たるので通り続ける。
  - ADR-3286: `### リスク段階`、`#### 指摘の重大度と対応`
  - ADR-3011、ADR-3117（superseded）: `skip-coderabbit`（リスク段階の箇条書き）
  - ADR-2859: `### spike の名前と寿命`
- **ADR 本文**: 書き換えない（ADR-2687）。本文の dead path は `record-source-paths.ts` も追わない。
- **ポインタ**: `CLAUDE.md`、`.claude/rules/{stacked-pr,adr,acceptance}.md`、`.claude/skills/coderabbit-converge/SKILL.md`、`.claude/agents/qa.md`、スクリプトのコメントとエラーメッセージ（`scripts/review/`、`scripts/coderabbit/`、`scripts/ci/workflow-draft-gate.test.ts`）、`.github/PULL_REQUEST_TEMPLATE.md`、`.github/workflows/{review-request,review-tier}.yml`、`.coderabbit.yaml`、`docs/acceptance/` の 2 件、`docs/design/TEMPLATE.md`、`reports/README.md`、`CONTRIBUTING.md`。ほかに、パスを書かず節名（「指摘の重大度と対応」など）だけで指す参照が process.md の中と外にある。リンクを機械で検査する仕組みは無い
- **段階の分類**: `scripts/review/tier.ts` の `HIGH_GLOBS` は `docs/process.md` だけを High にする。`docs/process/` に新しいファイルを置くと、どの規則にも当たらず Medium（CodeRabbit が走らない）になる。`.coderabbit.yaml` の `knowledge_base.code_guidelines.filePatterns` も `docs/process.md` だけを持つ
- **CI**: `adr check-assumptions` が CI で走るのは `ci.yml`（`docs/**` を無視する）と `adr-validate.yml`（`docs/adr/**` だけで発火する）だけ。process.md だけを変える PR では CI で走らず、lefthook の pre-push だけが見ている
- **docs サイト**: process.md は公開対象（`PUBLISHED_EN_FILES`）に入っていない。サイトのビルドは影響を受けない

## 制約・前提

- `CLAUDE.md` の「作業開始時は必ず `docs/process.md` を読む」は残す（ADR-2351 と ADR-2356 が外す案を却下している）
- 分けたトピックは、読むべき時点に読む手がかりを持つ。手がかりの無いファイルは誰にも読まれない
- ADR は frontmatter だけを直す
- **移す文章の規則は変えない。** 分割 PR のレビューを「どこに置いたか」に絞るため。変えてよいのは次の 4 種だけで、表現の手直しは別 PR にする
  - 指し先: 相対リンクのパス、節名や手順の番号（「手順 9」など）だけで別ファイルの節を指す参照へのファイル名の追加、`docs/process.md` を指すポインタの張り替え
  - 分割そのものに伴う記述: 索引、手順 8・15 の読む指示、リスク段階の表の High の行への `docs/process/**` の追加、各トピックファイル冒頭の注記、docs サイトの preview の節をルールにするときの frontmatter（`paths:`）とタイトルの見出し、`.claude/rules/stacked-pr.md` から `gh stack` の入口の宣言と `docs/process/stacked-pr.md` と重複する手順を除くこと
  - 廃止済みのものの削除: QA チェックリストの節と、plugin の表の `/hane:qa` の行
  - ツールが失敗時に伝えている節の削除: 循環依存チェックと Barrel import 禁止。代わりにツールの出力を直す（`check:cycles` の失敗時の助言、oxlint の `message`）
- **対象外**: `docs/release.md` の置き場（参照が多く、分割と独立に判断できる）、`CLAUDE.md` と process.md の重複の整理（ADR-2356 の未決 1 番目）、`/hane:qa` の受け入れテスト `docs/acceptance/0007-qa-skill.md` と `.gitignore` の `docs/qa/`（hane 側の廃止に合わせて別に扱う）

## 検討した選択肢

### 案1: `docs/process/<topic>.md` に分け、process.md の索引から引く

核は process.md に残し、作業を始めたときに要る節を `docs/process/` 配下のトピックファイルへ移す。process.md の「規約の所在」を索引にし、各トピックを読む時点を観測できる事実で書く。編集時に要るものは ADR-2356 どおり `.claude/rules/` に置き、ツールが既に伝えているものはツールに任せる。

**メリット**

- ADR-2356 の 3 層をそのまま使う。新しい層を作らない
- 1 つの glob（`docs/process/**`）で段階の分類・CodeRabbit の規約・索引の検査を書ける
- 人間も同じファイルを読める

**デメリット**

- ファイルが増え、どこに何があるかは索引に頼る

### 案2: トピックを入口のスキルとルールに直接移す

CodeRabbit のラウンドは `/coderabbit-converge` の本文へ、stacked PR は `.claude/rules/stacked-pr.md` へ、のように、すでに発火するスキルとルールに中身を移す。

**メリット**

- 読む手がかりと中身が 1 ファイルにまとまる

**デメリット**

- ラウンドの規約は人間も読む（「High の PR は収束してから人間がレビューする」）。スキルの本文は人間の読み物ではない。スキルはすでに 16 KB ある
- ADR-2356 は、ファイル編集を伴わない作業の手順を `.claude/rules/` に置かないと決めている。`gh stack` は編集を伴わないので、ルールは手順の置き場にならない

### 案3: process.md の中で削るだけ

**デメリット**

- ADR-2356 が却下済み。削れるのは表現で、手順の中身は削れない

## 現時点の方針

**案1 を採用する**。ADR-2356 の発火時層を `docs/release.md` 1 本から `docs/process/` に広げる。

### 置き場と、読む手がかり

| 今の節 | 移す先 | 読む手がかり（観測できる事実） |
| --- | --- | --- |
| ライフサイクル、ブランチ戦略、Issue・PR 記述ルール、Issue ラベル 3 種、PR ワークフローの番号付き手順 | `docs/process.md` に残す | 常時 |
| 規約の所在 | `docs/process.md` に残し、索引にする。見出しの名前は変えない（ADR-2356 が grep する） | 常時 |
| リスク段階、指摘の重大度と対応、ローカルレビューの記録、手順直後の 2 段落 | `docs/process/review.md` | PR ワークフローの手順 8 に「手順 8〜11 の前に読む」と書く |
| High の PR の収束、人間に確認する指摘の判定、ラウンドの回し方 | `docs/process/coderabbit-rounds.md` | 手順 15、`/coderabbit-converge`（判定基準をすでに process.md に委ねている）、`gh pr ready` の後に動くフックのメッセージ |
| Stacked PR の進め方、draft PR では分単位のジョブが走らない | `docs/process/stacked-pr.md` | 索引の行に「`gh stack` を打つ前に読む」と書く。`.claude/rules/stacked-pr.md` は workflow の編集で読み込まれ、job 一覧の更新先としてこのファイルを指す。ルールの冒頭の「`gh stack` の前に読む」はルール自身が読まれないと届かないので、`gh stack` の手がかりは索引に移し、ルールからは入口の宣言と重複する手順を除いて workflow 編集時の規則だけを残す。索引ではこのファイルを手順の正本、ルールを workflow 編集時の規則と書く（今の索引はルールを正本と書き、ルールは process.md を正本と書いていて食い違っている） |
| spike の名前と寿命、spike preview、`reports/` | `docs/process/spike.md` | `spike/` で始まるブランチを切るとき、`reports/` の下に書くとき、`pnpm report:*` を走らせるとき（索引に書き、`CLAUDE.md` の spike の 2 行もここを指す） |
| docs サイトの preview | `.claude/rules/docs-site-preview.md`（`paths:` は `docs-preview.yml` の `paths:` と同じ）。索引に行を足す | 公開対象の doc の編集。編集時に発火して PR 時の行動を求める形は `changesets.md` と同じ |
| Claude Code plugin のセットアップ、Sibling repo の clone | `docs/process/environment.md` | hane のスキルが見つからないとき、`/workspaces` の隣の repo を編集するとき |
| 循環依存チェック | 削除し、`pnpm check:cycles` が落ちたときの出力に助言を出す（`import type` も循環に数える、共有の型は leaf module に分ける） | `check:cycles` の失敗そのもの |
| Barrel import 禁止 | 削除する。oxlint の `no-restricted-imports` の `message`（`.oxlintrc.json`）を、入れ子の `index.js` も対象になることとテストファイルは対象外であることが分かる文に直す | oxlint の失敗そのもの |
| QA チェックリスト | 削除する。plugin の表から `/hane:qa` の行も消す | `/hane:qa` は廃止され、`qa` エージェントと `/hane:acceptance-test` が後を継いだ |

各トピックファイルの冒頭には、process.md 冒頭と同じ「今どうするか」だけを書くという注記を置く（ADR-2351。`docs/release.md` も同じ注記を持つ）。分けたファイルにも経緯を溜めない。

トピックファイルの見出しは今の深さ（`###` / `####`）を保つ。ADR の `grep:` の正規表現は見出しの `#` を含むので、深さを変えるなら frontmatter の正規表現も合わせて直す。

### 大きさの目標と検査

**`docs/process.md` は 16,384 バイト以下にする**（今の約 3 分の 1）。分割後の核と索引は約 13 KB の見込みで、先に入る #3359 と #3389 の追記と、通常の追記の余地を残す。

<!-- absent-path-next-line: the lint this design proposes; created by the implementation PR (#3337) -->
ADR-2351 が書いたとおり、process.md は追記でしか育たない。上限を検査に置けば、超えたときに「どれを発火時層へ出すか」を決める機会になる。次の 4 つを落とす `pnpm lint:process-index`（`scripts/lint/process-index.ts` とテスト）を足す。

1. `docs/process/*.md` のうち、process.md の索引からリンクされていないファイルがある
2. 索引のリンク先のファイルが無い
3. `docs/process.md` と `docs/process/*.md` の相対リンクのうち、指し先のファイルが無いものがある（移動で `../` を足し忘れたリンクを拾う）
4. `docs/process.md` が上限を超えている

<!-- absent-path-next-line: the lint this design proposes; created by the implementation PR (#3337) -->
lefthook の pre-push で走らせる。CI では `ci.yml` が `docs/**` を無視するので、docs の検査がすでに置かれている `reference-docs-check.yml`（と対になる `-skip` 側。対の同期は `docs-site-ci-paths-sync` が検査する）の `pull_request` と `push` の両方の `paths:` に `docs/process.md`、`docs/process/**`、`scripts/lint/process-index.ts` を足し、`lint:process-index` と `adr check-assumptions` を走らせる。後者は、トピックファイルの見出しを変える PR を CI でも落とすため。両ファイルの冒頭コメントと skip 側の echo も合わせて直す。

1〜3 は「分けたトピックに読む手がかりがあり、リンクが切れていない」ことを機械で見る。手がかりが正しい時点を書いているかは人が読む。

### 実装の指針

実装は 1 PR で行う。途中の状態で分けると `adr:check-assumptions` が落ちる。

1. 節を移す。文章は「制約・前提」の 4 種の変更だけにとどめる
2. process.md に索引と、手順 8・15 からの読む指示を書く。索引には `docs/process/*.md` の各行（`stacked-pr.md` の行が「`gh stack` を打つ前に読む」という手がかりを持つ）と、`.claude/rules/docs-site-preview.md` の行を置く。トピックファイルの冒頭に注記を置く
3. 段階と CodeRabbit の対象を広げる: `scripts/review/tier.ts` の `HIGH_GLOBS` に `docs/process/**`（`tier.test.ts` に例を足す）、`.coderabbit.yaml` の `filePatterns`、`docs/process/review.md` に移ったリスク段階の表の High の行
4. ADR frontmatter の 5 件の `grep:` を移した先のファイルに向ける（ADR-3286、ADR-3011、ADR-3117、ADR-2859）
5. ポインタを張り替える。インベントリの一覧から始めるが、取りこぼしは一覧ではなく検索で拾う（TPL-2253）。検索するのは `process.md` と、移した節の見出し名の両方。`/coderabbit-converge` の「`docs/process.md` の手順 1・2」は PR ワークフローの手順と紛らわしいので、移した先の節名で書く
6. 同じ種類の古いポインタも直す。すでに process.md から出た節を指しているもの（`scripts/acceptance/design-refs.ts`、`CONTRIBUTING.md`、`.github/workflows/release.yml`、`.github/workflows/vscode-release.yml`、`docs/design/TEMPLATE.md` のスライス表の置き場）。ADR 本文は直さない
7. ツールの出力を直す: `check:cycles` が落ちたときに助言を出す（`package.json` の script を失敗時に 1 段落を表示する形にする）。oxlint の `no-restricted-imports` の `message` を直す。`.claude/rules/stacked-pr.md` の job 一覧の指し先と `workflow-draft-gate.test.ts` のコメントの指し先を `docs/process/stacked-pr.md` に張り替え、ルールから `gh stack` の入口の宣言と重複する手順を除く
8. `lint:process-index` とテストを足し、lefthook と `reference-docs-check.yml` に配線する
9. `CLAUDE.md` のドキュメント表に `docs/process/` の行を足す

実装の PR がマージされた後、別の `docs(adr):` PR で `docs/adr/3337-split-process-md.md`（`refines: [ADR-2356]`）として昇格し、本 Design Doc を同じ PR で削除する。

受け入れテストは作らない。リンクとファイルの到達は機械で確かめられ、手がかりの妥当性は PR のレビューで読む。人が画面で見るものは無い。

```
wc -c docs/process.md                       # 16384 以下
pnpm lint:process-index
pnpm adr:check-assumptions && pnpm adr:validate
git grep -n 'process\.md' -- ':!docs/adr/*.md'   # 核に残った節だけを指している
# 移した節の見出し名すべてについて、節名だけの参照が移した先を指している
grep -h '^###* ' docs/process/*.md | sed 's/^#* //' | while read -r h; do
  git grep -n -F "$h" -- ':!docs/adr/*.md' ':!docs/process/'
done
```

### 影響範囲・マイグレーション

- 毎セッション読まれる量が約 33 KB 減る（索引の増分を除く）。PR を作るセッションは手順 8 で `review.md`（約 8.5 KB）も読むので、その場合の削減は約 25 KB。High の PR でラウンドを回すセッションは手順 15 で `coderabbit-rounds.md`（約 9.2 KB）も読むので約 16 KB
- `docs/process/` の変更は process.md と同じく High になる
- 着手順: #3389 と #3359 の実装が process.md を先に直す。分割はその後に、両者の最終的な文章を移す

## 未決 / 決めないこと

- `docs/release.md` を `docs/process/release.md` に揃えるか。揃えれば索引の検査が release も見るが、参照の張り替えが多い。必要になってから決める
- `.claude/rules/docs-site-preview.md` の `paths:` と `docs-preview.yml` の `paths:` の同期を、既存の `lint:docs-site-ci-paths-sync` に検査させるか。実装の PR で手間が小さければ入れる
