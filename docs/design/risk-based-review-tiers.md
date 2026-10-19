# リスク段階で PR のレビューの深さとマージ経路を決める

- **日付**: 2026-10-18
- **ステータス**: 検討中
- **PR**: #3287
- **関連**:
  - 引き金 Issue: [#3286](https://github.com/kompiro/karasu/issues/3286)
  - 関連 ADR: [ADR-2716](../adr/2716-coderabbit-request-changes-workflow.md)（CodeRabbit の approve はマージ許可ではない）、[ADR-2331](../adr/2331-adr-automerge-scope.md)（ADR-only PR の auto-merge）、[ADR-3117](../adr/3117-coderabbit-ignore-command-for-skip.md)（CodeRabbit から外す PR）、[ADR-3052](../adr/3052-review-branch-diff-before-draft-pr.md)（PR 前の `/engineering:code-review`）、[ADR-2643](../adr/2643-stacked-pr-workflow.md)（draft では分単位の CI を止める）
  - 関連 TPL: [TPL-1725](../test-perspectives/TPL-1725-gated-test-suite-detection-gap.md)、[TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)（本 PR で起こす proactive TPL）
  - コード: `.coderabbit.yaml`、`.claude/skills/coderabbit-converge/SKILL.md`、`.github/PULL_REQUEST_TEMPLATE.md`

## 背景・課題

CodeRabbit の rate limit が、PR が人間に届くまでの速さの上限になっている。
ADR-only の auto-merge PR と `skip-coderabbit` の PR を除くと、すべての PR が同じ流れを通る。
CodeRabbit が approve するまでラウンドを回し、人間がレビューして手でマージする。
変更がどこに触れているかは流れに影響しない。

直近にマージした 60 本の PR で CodeRabbit のレビュー回数を数えた
（Dependabot の PR は CodeRabbit の対象外なので 0 回）。

| 観測 | 値 |
| --- | --- |
| CodeRabbit のレビュー総数 | 115 回 |
| うち 2 回目以降の再レビュー | **78 回（68%）** |
| 1 本で最も多く使った PR | #3268 の 15 回（総数の 13%） |
| 下の Low に当たる PR の再レビュー | 8 回 |
| `docs/design/**` の PR の再レビュー | 7 回 |

枠を使っているのは初回レビューではなく再レビューである。
初回レビューを外す既存の手段（ADR-3117）では、この部分に届かない。

もう 1 つの観測として、CodeRabbit がサマリーに出す「Estimated code review effort」（1〜5）は
リスクの評価ではない。1〜2 と見積もられた PR に、workflow の変更（#3260）、
release train（#3239）、依存の override の変更（#3204）が含まれている。
逆に、テストだけを足した PR（#3217、#3219、#3222、#3224）は 3 と見積もられている。

[How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/)
（2026-10-15）は、「人間がコードを読んだか」ではなく「この変更で何が壊れうるか、
それを捕まえるのはどの検査か」を問い、変更からリスク段階を決めて人間の関わり方を変えている。
本 Design Doc はその考え方を、人間のレビュアーが 1 人の karasu に合わせて取り込む。

## 現状（インベントリ）

| 層 | karasu の現状 |
| --- | --- |
| PR 前の検証 | base との差分に `/engineering:code-review`（ADR-3052）、qa agent、lefthook |
| AI レビュー | 全 PR に CodeRabbit（`profile: chill`）。push のたびに自動で再レビューする。`/coderabbit-converge` は `changes` への対応が 5 ラウンドに達したら止まる |
| セキュリティレビュー | 差分を見るものはない。secret-scan と依存の alert sweep だけ |
| 必須 CI | Check / Validate / Reference docs / Playwright |
| 軽い経路 | `adr-auto-merge`（ADR-2331。CodeRabbit も人間も通らない）と `skip-coderabbit`（ADR-3011 / ADR-3117。CodeRabbit を通らず人間が見る）の 2 つ |
| ruleset | approving review は 0 件で可、thread の解決は要求しない。CodeRabbit の状態はマージを止めない |
| ガードレール | 2026-07-01 以降の 820 コミットで revert は 0 件。計測の仕組みはない |

## 制約・前提

- **人間のレビュアーは 1 人。** 記事の「2 人の承認」に当たる段階は作れない。段階の差は
  承認の人数ではなく、人間がどこまで読むかと、自動レビューをどこまで重ねるかで表す。
- **PR の作成者は自分の PR を approve できない。** Claude が作る PR も作成者は kompiro なので、
  ruleset の `required_approving_review_count` を 1 以上にすると全 PR がマージできなくなる。
  段階の強制は承認ではなく、ラベルと required check と auto-merge の条件で行う。
- **ADR-2716 は「マージ判断は引き続き人間が持つ」と決めている。** Low の auto-merge はこの
  一点を覆すので、昇格時の ADR で ADR-2716 のこの部分を supersede する。CodeRabbit を
  required check にしない、approve はマージ許可ではない、は変えない（Low でも CodeRabbit の
  approve を待たない）。
- **ADR-2716 が却下した `required_review_thread_resolution: true` は使わない。** 指摘への対応は
  ruleset ではなく、Low の手順と converge で求める。
- **ADR-3011 は判断を含む基準を Claude の判断だけで適用することを却下した。** そのため段階は
  パスという観測可能な事実で決め、Claude の判断で段階を下げることはしない。
- **リポジトリは public。** 外部からの PR は、変更内容にかかわらず High として扱う。
- out of scope: `engineering:code-review` と組み込みの `/code-review high` の比較。
  過去の PR で CodeRabbit の指摘をどれだけ先に拾えるかを測る実験は、やるなら別 Issue にする。

## 検討した選択肢

### 案1: パスで段階を決め、CodeRabbit の再レビューを段階ごとに絞る

PR の差分に含まれるファイルのパスから段階を決める。PR の段階は、含まれるファイルの段階の
最大値とする。どの規則にも当たらないパスは Medium に倒す。

| 段階 | パス | CodeRabbit | 人間 |
| --- | --- | --- | --- |
| Low | `docs/adr/**`、`docs/test-perspectives/**`、`docs/guide/**`、テストファイルだけ（`*.test.ts(x)`・`*.spec.ts`） | 初回 1 回だけ。再レビューはしない | 読まない。指摘に答え、CI が通ったら auto-merge |
| Design | `docs/design/**` | 初回 1 回だけ。再レビューは人間が頼んだときだけ | 必ずレビューする |
| Medium | 上と下に当たらないもの（`packages/*` の feat / fix、`packages/nest/**`、`docs/acceptance/**`、`examples/**` を含む） | 再レビューは 3 回まで。3 回目で止めて、進め方は人間が決める | サマリー・証拠・preview を見て判断する（今の運用） |

`docs/acceptance/**` と `examples/**` は Low に入れない。

- **`docs/acceptance/**`**：ADR-2331 は、AT の受け入れ条件を変える差分を人間のレビューなしに
  通さないとして、auto-merge の例外から外した。理由は 2 つで、手動項目のチェック状態は ADR-3169 で
  常に未チェックの定義になり消えたが、TC の増減は残っている。AT の変更は実装 PR と一緒に来ることが
  多く、AT だけの PR は少ないので、Medium に置いて失うものは小さい
- **`examples/**`**：パスでは typo と構造の変更を区別できない。登録済みのディレクトリは
  `packages/core/src/builtins/examples.ts` とミラーで同期するので、どのみち Medium になる。
  Low に入れて効くのは登録されていないディレクトリだけで、それも docs-site のギャラリーに出る内容である
| High | `.github/workflows/**`、`.github/actions/**`、release（各パッケージの `CHANGELOG.md` と `package.json` の `version`）、依存の変更（`package.json` の `dependencies` / `devDependencies` / `pnpm.overrides`、`pnpm-workspace.yaml`）、`docs/spec/**`、`docs/concepts*.md`、`docs/process.md`、`.claude/rules/**`、`.coderabbit.yaml`、`lefthook.yml`、`scripts/lint/**` | approve まで回す（今の converge、上限 5） | 差分を読む |

段階とは別に、**差分が `packages/nest/**` か `.github/workflows/**` に触れる PR は、PR 前の
`/engineering:code-review` に加えて `/security-review` を当てる。** nest はシークレットと
預かったデータをコードとして持たない方針なので段階は Medium のままにするが、外部に公開した
Worker であることは変わらない。workflow は権限と secret の扱いを変えうる。

CodeRabbit の effort 見積もりは段階を**上げる**ためにだけ使う。パスで Low と決まった PR でも、
初回レビューの見積もりが 4 以上なら Medium として扱う。見積もりで段階を下げることはしない
（背景の観測のとおり、見積もりはリスクと一致しない）。Low に当たる過去の PR は見積もり 2〜3
だったので、この条件で Low から外れる PR はほとんどない。

**メリット**

- 判定が観測可能な事実（パス）で閉じ、機械で検証できる（`.claude/rules/README.md` のチェックリスト 2・8）
- 当てはまらないパスが安全側（Medium）に倒れる。ADR-2331 が退けた「数え上げは漏れる」は、
  漏れたときに例外から外れるだけで危険側には倒れない形だったが、本案の Low も同じ性質を持つ
- 再レビューの 3 つの出どころ（Low・Design・長引く Medium）に同時に届く

**デメリット**

- High は数え上げで、漏れると危険側（Medium）に倒れる。High のパスを増やすときは本表を直す必要がある
- Low の修正コミットは CodeRabbit に見られずにマージされる（記事のいう「承認は特定のコミットに
  対して与える」とずれる）。Low をパスで docs とテストに限ることで受け入れる

### 案2: CodeRabbit の effort 見積もりで段階を決める

CodeRabbit が初回レビューで出す見積もりが 1〜2 なら再レビューを省いて auto-merge する。
スクリプトも required check も要らず、最も安い。

**メリット**

- 新しい仕組みがほぼ要らない。見積もりはすでにサマリーに出ている

**デメリット**

- 見積もりはレビューの手間であってリスクではない。60 本の実測で、見積もり 1〜2 の再レビュー
  31 回のうち約半分が deps・CI・release・process の PR だった。これらが人間を通らずにマージされる
- 段階を外部サービスの出力に預けることになり、CodeRabbit の振る舞いが変わると段階も黙って変わる

### 案3: 段階を作らず、converge のラウンド上限だけを下げる

全 PR で再レビューを 3 回までにする。変更は converge の 1 行で済む。

**メリット**

- 最小の変更で #3268 のような長引く PR を抑えられる

**デメリット**

- Low と Design の再レビュー（合わせて 15 回）が残る
- 人間が読む PR の数は変わらない。rate limit とは別の、人間の時間という目的に届かない

## 比較

| 観点 | 案1 | 案2 | 案3 |
| --- | --- | --- | --- |
| 減る再レビュー（60 本の実測から推定） | 約 27 回（Low 8・Design 7・Medium の上限 約 12） | 約 31 回（ただし High 相当を含む） | 約 12 回 |
| 人間を通らずにマージされる PR | docs とテストに限られる | workflow・依存・release を含みうる | 増えない |
| 判定の根拠 | パス（repo の中で検証できる） | 外部サービスの見積もり | なし |
| 必要な実装 | スクリプト・required check・設定・converge・process | converge の分岐 | converge の 1 行 |

## Related TPLs

- [TPL-1725](../test-perspectives/TPL-1725-gated-test-suite-detection-gap.md)：遅延実行や条件付きの検査は、
  その検査対象を変える PR で必ず起動させる。段階を検証する required check にパスフィルタを付けないのは
  この観点による（docs だけの PR こそ Low になるので、`ci.yml` の `paths-ignore` で飛ばされると検証が消える）
- [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)（本 PR で起こす proactive TPL）：
  人間を通らないマージを許す判定は最終の差分で行い、どの規則にも当たらない入力を厳しい側に倒す。
  ADR-2331 の auto-merge は判定が PR 作成前の 1 回で、機械の検査を持たない（ADR-2331 の未決）。
  本設計で Low の auto-merge に広げると、この形の誤りが届く範囲も広がるので、実装前に観点として置く

## 現時点の方針

**案1 を採用する。** 段階を変更そのもの（パス）から決め、人間を通らない経路を docs とテストに
限る。案2 は最も安いが、実測で人間を通らずにマージされる範囲が workflow と依存に広がる。
案3 は rate limit の一部に届くだけで、人間の時間には届かない。案3 の上限は案1 の Medium に含める。

### 段階ごとの流れ

**Low**

1. PR を作る前に段階判定のスクリプトでブランチの差分を判定し、Low なら `risk: low` ラベルを付けて
   draft で作り、ready にする
2. CodeRabbit の初回レビューが届く。effort の見積もりが 4 以上ならラベルを `risk: medium` に替えて
   Medium の流れに移る
3. 指摘をすべて、直すか理由を返信して解決する（thread は GraphQL の `resolveReviewThread` で名指しで閉じる）
4. 修正をまとめて 1 回 push する。CodeRabbit は再レビューしない
5. required check「Review tier」が最終の差分を判定し、Low のままなら通る。
   `gh pr merge --auto --squash --delete-branch` で auto-merge にする

CodeRabbit の状態は changes-requested のまま残るが、マージは止めない（ADR-2716 と同じ）。

**Design**：初回レビューの指摘に対応したら人間に渡す。再レビューは人間が頼んだときだけ
`@coderabbitai review` を投げる。

**Medium**：今の converge と同じだが、再レビューは 3 回まで。3 回目の再レビューに `changes` が
残ったら止めて、指摘の一覧と取りうる進め方を人間に渡す。

**High**：今の converge（approve まで、上限 5）。人間は差分を読む。

**外部からの PR**：作成者が信頼リスト（現状 `kompiro` だけ）にいなければ、段階は High になる。

**ADR-only の auto-merge（ADR-2331）** はそのまま残す。Low の特別な場合（CodeRabbit も通らない）
として位置づける。**`skip-coderabbit` と Low は組み合わせない。** 組み合わせると誰も読まない
PR になる。`skip-coderabbit` を付けた PR は段階にかかわらず人間がレビューする。

### main の取り込みは再レビューしない

CodeRabbit の approve の後や、段階の最後のラウンドの後に main を取り込んでコンフリクトを
解消しても、PR が変える中身が同じなら再レビューは何も足さない。並行する PR が同じ一覧表
（`docs/test-perspectives/README.md` の TPL 一覧など）に行を足すと、この取り込みは頻繁に起きる。

判定は 1 つ、**取り込みの前と後で、PR の差分（`git diff -U0 origin/main...HEAD`）の追加行と
削除行の集合が同じかどうか**。hunk の位置や前後の文脈が変わっても、集合が同じなら同じとみなす。

| 取り込みの結果 | どうするか |
| --- | --- |
| 集合が同じ（両方の行を残すだけの解消、コンフリクトのない取り込み） | 再レビューを頼まない。ラウンドにも数えない。Low は required check の段階判定だけが走る |
| 集合が違う（解消で PR の行を書き換えた） | 修正コミットとして扱う。Medium と High は 1 ラウンドに数えて再レビューを頼み、Low は Medium に移す |

本 PR（#3287）で実際に起きた例: #3272 が TPL 一覧に TPL-3180 の行を足し、本 PR の TPL-3286 の
行と同じ位置でコンフリクトした。両方の行を番号順に残して解消すると、追加行と削除行の集合は
取り込み前と一致し、違ったのは hunk の位置だけだった。

`auto_incremental_review: false` にすると、この push で CodeRabbit が自動で再レビューすることは
なくなる。converge は上の判定が「同じ」なら再レビューを頼まずに終わる。

### 実装の指針

1. 段階判定のスクリプトとそのテストを書く。
   <!-- absent-path-next-line: files this design creates (#3286) -->
   置き場は `scripts/review/tier.ts` と `scripts/review/tier.test.ts`。
   入力は変更ファイルの一覧と（あれば）`package.json` の差分、出力は段階とセキュリティレビューの要否。
   テストでは各段階の代表パス、最大値の取り方、どれにも当たらないパスが Medium になること、
   `package.json` の scripts だけの変更は依存の変更に数えないことを固める
2. required check の workflow `review-tier.yml` を足す。パスフィルタは付けない（TPL-1725）ので、
   skip stub は要らない。draft では動かさない（ADR-2643）。`if` で飛ばした job は required check に success を返すので、
   `types:` に `ready_for_review` を入れる。ラベルの付け替えでも判定し直すよう `labeled` / `unlabeled` も入れる。最終の差分を判定し、`risk: low` ラベルが
   付いているのに Low でない、または作成者が信頼リストにいない場合に失敗する。
   read-only の `GITHUB_TOKEN` で動くので、fork からの PR でも同じに動く
3. ラベル `risk: low` / `risk: medium` / `risk: high` を作る
4. `.coderabbit.yaml` で `reviews.auto_review.auto_incremental_review: false` にする。push のたびの
   自動再レビューが止まり、再レビューは `@coderabbitai review` を投げたときだけになる
5. `/coderabbit-converge` を段階で分岐させる。Low と Design は初回レビューへの対応で終わり、
   Medium は再レビュー 3 回、High は今の上限 5 で止まる。再レビューは push の後に
   converge が明示的に頼む。main を取り込んだ push は、段階判定のスクリプトに足す
   「取り込みの前後で追加行と削除行の集合が同じか」の判定で、再レビューを頼むかを決める
   （「main の取り込みは再レビューしない」）。ruleset の `dismiss_stale_reviews_on_push: true` が
   取り込みの push で CodeRabbit の approve を dismiss するかを確かめ、dismiss するなら
   「人間のレビューは CodeRabbit が approve してから始める」の判定（最新レビューの state）を
   この場合も approve とみなすよう直す
6. `.github/PULL_REQUEST_TEMPLATE.md` に「Risk」（段階と、その段階になった理由）と
   「How to revert」を足す
7. `docs/process.md` の PR ワークフローに段階ごとの流れを書き、「PR のマージはユーザー確認を経る」
   の例外として Low の auto-merge を明記する。`.claude/rules/adr.md` の auto-merge 節は Low の
   特別な場合として参照を張る
8. マージ後に ruleset の required checks へ「Review tier」を足す（先に足すと、この workflow を
   持たない PR が pending のまま止まる。Playwright を required にしたときと同じ順序）
9. AT は作らない。利用者に見える振る舞いは変わらず、段階の判定は `tier.test.ts` で、
   required check の挙動は導入 PR 自身で確かめる
10. ADR 昇格: 実装完了後、`docs/adr/3286-risk-based-review-tiers.md` として昇格し、
    本 Design Doc は同 PR で削除する。ADR-2716 の「マージ判断は人間が持つ」を supersede し、
    ADR-2331 からの参照を張る

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（開発プロセスだけの変更）
- ドキュメント更新: `docs/process.md`、`.claude/rules/adr.md`、`.github/PULL_REQUEST_TEMPLATE.md`
- 計測: 導入後 1 か月で、revert 数、マージ後 1 週間以内に同じ箇所を直した fix PR、
  CodeRabbit のレビュー回数（本 Design Doc の 115 回 / 60 本と比べる）を見る。revert か
  fix PR が増えたら Low の範囲を狭める

## 決めないこと

- `engineering:code-review` と組み込みの `/code-review high` の比較（制約・前提の out of scope）
- Low の範囲を広げること。導入後の計測（影響範囲・マイグレーションの「計測」）で revert と
  fix PR が増えないことを確かめてから、別途検討する
