---
id: ADR-3337
title: docs/process.md を常時読む核と、作業を始めたときに読むトピックに分ける
status: accepted
date: 2026-10-30
topic: build
authors: [kompiro]
refines: [ADR-2356]
related_to:
  - ADR-2351
  - ADR-2687
  - ADR-3286
  - ADR-3011
  - ADR-3117
  - ADR-2859
scope:
  packages: []
assumptions:
  - "file: docs/process/review.md"
  - "file: docs/process/coderabbit-rounds.md"
  - "file: docs/process/stacked-pr.md"
  - "file: docs/process/spike.md"
  - "file: docs/process/environment.md"
  - "file: .claude/rules/docs-site-preview.md"
  - "grep: docs/process.md :: ### 規約の所在"
  - "grep: docs/process.md :: 発火条件"
  - "symbol: scripts/lint/process-index.ts :: SIZE_BUDGET"
  - "grep: package.json :: \"lint:process-index\""
  - "grep: lefthook.yml :: lint:process-index"
  - "grep: .coderabbit.yaml :: docs/process/\\*\\.md"
  - "grep: .github/workflows/reference-docs-check.yml :: lint:process-index"
  - "grep: .github/workflows/reference-docs-check.yml :: adr:check-assumptions"
  - "grep: scripts/review/tier.ts :: \"docs/process/\\*\\*\""
  - "symbol: scripts/lint/docs-site-ci-paths-sync.ts :: PREVIEW_RULE"
---

# ADR-3337: docs/process.md を常時読む核と、作業を始めたときに読むトピックに分ける

- **日付**: 2026-10-30
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3337](https://github.com/kompiro/karasu/issues/3337)（設計 PR #3394、実装 PR #3402）
  - [ADR-2356](2356-doc-placement-by-read-timing.md)（読まれる時点で置き場を決める 3 層。本 ADR はその「発火時」層を広げる）
  - [ADR-2351](2351-process-md-holds-instructions.md)（process.md は「今どうするか」だけを持つ）
  - [ADR-2687](2687-adr-body-is-immutable.md)（ADR 本文は書き換えない。移動に伴う張り替えは frontmatter だけで行った）
  - [ADR-3286](3286-risk-based-review-tiers.md)（リスク段階。`docs/process/**` を High に含める）
  - 関連 TPL: [TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)、[TPL-2253](../test-perspectives/TPL-2253-removal-sweep-needs-a-search-not-a-file-list.md)
  - `docs/process.md`、`docs/process/`、`.claude/rules/docs-site-preview.md`、`.claude/rules/stacked-pr.md`、`scripts/lint/process-index.ts`

## 背景

`CLAUDE.md` は「作業開始時は必ず `docs/process.md` を読む」と指定している。したがって process.md は全文が
毎セッションのコンテキストに載る。

ADR-2356（2026-08-05）は規約を読まれる時点で 3 層（常時 / 発火時 / 編集時）に分け、process.md を 12,659 バイト
まで縮めた。その後、レビューの段階（ADR-3286）、CodeRabbit のラウンド、stacked PR、spike と `reports/` などの節が
足され、2026-10-29 の `main` で 45,512 バイト / 618 行に戻った。足された節の大半は常時層ではなく、特定の作業を
始めたときにだけ要る。発火時層の置き場が `docs/release.md` 1 本しか無く、ほかの発火時の手順を置く場所が
無かったことが、process.md に戻ってきた原因である。

## 決定

`docs/process.md` は常時要る流れだけを持つ核にし、16,384 バイト以下に保つ。作業を始めたときにだけ要る手順は
`docs/process/<topic>.md` に分け、process.md の「規約の所在」を、各トピックを読む時点（観測できる事実）を
書いた索引にする。索引・リンク・大きさは `pnpm lint:process-index` が検査する。

### 置き場と、読む手がかり

| 節 | 置き場 | 読む手がかり |
| --- | --- | --- |
| ライフサイクル、ブランチ戦略、Issue・PR 記述ルール、Issue ラベル 3 種、PR ワークフローの番号付き手順、規約の所在（索引） | `docs/process.md` | 常時 |
| レビューの順序（手順直後の 2 段落）、リスク段階、指摘の重大度と対応、ローカルレビューの記録 | `docs/process/review.md` | PR ワークフローの手順 8 |
| High の PR の収束、人間に確認する指摘の判定、ラウンドの回し方 | `docs/process/coderabbit-rounds.md` | 手順 15、`/coderabbit-converge`、`gh pr ready` の後に動くフックのメッセージ |
| Stacked PR の進め方、draft PR で skip される job | `docs/process/stacked-pr.md` | `gh stack` を打つ前（索引の行） |
| spike の名前と寿命、spike preview、`reports/` | `docs/process/spike.md` | `spike/` ブランチを切るとき、`reports/` に書くとき、`pnpm report:*` |
| Claude Code plugin、sibling repo の clone | `docs/process/environment.md` | hane のスキルが見つからないとき、隣の repo を編集するとき |
| docs サイトの preview | `.claude/rules/docs-site-preview.md`（`paths:` は `docs-preview.yml` と同じ） | 公開対象の doc の編集 |
| 循環依存チェック、Barrel import 禁止 | 削除。`pnpm check:cycles` の失敗時の出力と oxlint の `message` が同じ助言を出す | ツールの失敗そのもの |
| QA チェックリスト | 削除（`/hane:qa` は廃止済み） | なし |

各トピックファイルの冒頭には、process.md と同じく「今どうするか」だけを書くという注記を置く（ADR-2351）。

### `.claude/rules/stacked-pr.md` の役割

`gh stack` はファイル編集を伴わないので、`paths:` で読み込まれるルールは `gh stack` の時点に届かない
（ADR-2356）。ルールからは `gh stack` の入口の宣言と手順を除き、workflow の draft 判定を編集するときの規則だけを
残した。スタックの到達状態（draft でない PR が最下層の 1 本だけ）と、`submit --auto` が既定で draft を作るという
事実は、`gh stack` の前に読む `docs/process/stacked-pr.md` に移した。ルールには workflow 編集の到達状態
（skip する job の一覧の一致と `ready_for_review` の対）を書いた。

### 検査

`pnpm lint:process-index`（`scripts/lint/process-index.ts`）は次のときに落ちる。

1. `docs/process/**/*.md` のうち、索引の行が名指ししていない（リンクもバッククォートのパスも無い）ファイルがある
2. 索引の行がファイルを名指ししていない、または指し先が無い
3. `docs/process.md` と `docs/process/**` の相対リンクの指し先が無い（移動で `../` を足し忘れたリンクを拾う）
4. 索引の行の「発火条件」が空（列は見出しの名前「正本」「発火条件」で探すので、列名を変えない）
5. `docs/process.md` が 16,384 バイトを超える

lefthook の pre-push と `reference-docs-check.yml` で走る。`ci.yml` は `docs/**` を無視するので、process だけを
変える PR は `reference-docs-check.yml` が拾う。この workflow は索引が名指す `.claude/rules/**` と
`docs/release.md` でも発火し、`pnpm adr:check-assumptions` も走らせる（トピックファイルの見出しを変える PR を
CI で落とすため）。`docs-site-ci-paths-sync` は `.claude/rules/docs-site-preview.md` の `paths:` が
`docs-preview.yml` の `paths:` と一致することも検査する。

`scripts/review/tier.ts` の `HIGH_GLOBS` は `docs/process/**`、`.coderabbit.yaml` の規約のパターンは `docs/process/*.md` を含む。
process のトピックの変更は process.md と同じく High になる。

### 移した文章の扱い

分割の PR では、移した文章の規則を変えなかった。変えたのは次の 4 種だけで、表現の手直しは別の PR にする。

- 指し先: 相対リンク、節名や手順の番号だけで別ファイルの節を指す参照へのファイル名の追加、ポインタの張り替え
- 分割そのものに伴う記述: 索引、手順 8・15 の読む指示、リスク段階の表の High の行、トピックファイル冒頭の注記、ルールにした節の frontmatter とタイトル、上記の `.claude/rules/stacked-pr.md` の整理
- 廃止済みのものの削除: QA チェックリストと plugin の表の `/hane:qa` の行
- ツールが失敗時に伝える節の削除: 循環依存チェックと Barrel import 禁止

ADR は frontmatter の `assumptions:` だけを直した（ADR-3286・ADR-3011・ADR-3117 は `docs/process/review.md`、
ADR-2859 は `docs/process/spike.md` を指す）。

## 理由

- ADR-2356 の 3 層をそのまま使い、新しい層を作らない。発火時層の置き場を 1 ファイルから 1 ディレクトリに広げただけである
- 1 つの glob（`docs/process/**`）で段階の分類・CodeRabbit の規約・索引の検査を書ける
- トピックファイルは人間も読める。ラウンドの規約（収束してから人間がレビューする）は人間も読む
- 毎セッション読まれる量は 46 KB から約 15 KB になった（実装後の process.md は 14,876 バイト）。PR を作るセッションは手順 8 で `review.md`（約 9 KB）も読む
- ADR-2351 が書いたとおり、process.md は追記でしか育たない。大きさの上限を検査に置けば、超えたときが「どれを発火時層へ出すか」を決める機会になる
- 手がかりの無いトピックファイルは誰にも読まれない。索引の行と手がかりの有無を機械で見ることで、分けたファイルが読まれない状態を防ぐ。手がかりが正しい時点を指しているかは人が読む

## 却下した案

- **トピックを入口のスキルとルールに直接移す**（ラウンドは `/coderabbit-converge` の本文へ、stacked PR はルールへ）。
  ラウンドの規約は人間も読むが、スキルの本文は人間の読み物ではなく、スキルはすでに 16 KB ある。
  ADR-2356 は、ファイル編集を伴わない作業の手順を `.claude/rules/` に置かないと決めている
- **process.md の中で削るだけ**。ADR-2356 が却下済み。削れるのは表現で、手順の中身は削れない
- **循環依存と Barrel import の節を `docs/process/` に移す**。どちらもツールが落ちたときにだけ要る知識で、
  ツールの出力に置けば落ちた時点で必ず届く
- **分割を複数の PR に分ける**。途中の状態では ADR の `grep:` assumptions が移動前と移動後のどちらかで落ちる

## 未決

- `docs/release.md` を `docs/process/release.md` に揃えるか。揃えれば索引の検査が release も見るが、参照の張り替えが多い。必要になってから決める
- `CLAUDE.md` と process.md の重複の整理（ADR-2356 の未決 1 番目）は扱っていない
- `/hane:qa` の受け入れテスト `docs/acceptance/0007-qa-skill.md` と `.gitignore` の `docs/qa/` は、hane 側の廃止に合わせて別に扱う
