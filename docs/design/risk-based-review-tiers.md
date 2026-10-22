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

直近にマージした 60 本の PR のうち、CodeRabbit がレビューした 37 本で、レビューが走った回数と
その結果を数えた。数えたのは本文を持つレビュー、approve、そして後の push で取り消された approve
（state が `DISMISSED` に書き換わり本文も空になるので、timeline の `review_dismissed` から数えた）である。
本文が空の `COMMENTED`（thread への返信に CodeRabbit が答えたもの）は除いた。
何も投稿せずに終わったレビューは数えられないので、使った枠の下限である。

| 観測 | 値 |
| --- | --- |
| レビューが走った回数 | 80 回（うち 2 回目以降の再レビュー 43 回） |
| 初回だけで approve され、その後レビューが走らなかった PR | 10 本 |
| 再レビューが走った PR | 27 本（新しい指摘が出たのはそのうち 5 本） |
| approve の後の push で approve が取り消され、もう一度レビューが走った回数 | 13 回 |
| 再レビューで新しい指摘が出た PR | 5 本（#3268、#3242、#3222、#3205、#3204） |
| 再レビューで出た新しい指摘 | 10 件、すべて Minor |
| その 10 件が付いた行 | 初回レビューの時点にあった行 5 件、初回の指摘への修正コミットが入れた行 5 件 |
| その 10 件が付いたファイル | **10 件すべてが、初回の指摘への修正コミットが触れたファイル** |
| 最もラウンドを使った PR | #3268（レビュー 8 回） |

再レビューの多くは、新しい指摘を出さずに approve する確認である。ただし初回だけでは拾えない
指摘も出ている（10 件のうち半分は初回の時点にあった行）。初回レビューの後に指摘への対応を
確認させることには価値があり、それを省くのではなく、回し方の無駄を減らす。

後から出た指摘は、修正で触れたファイルを CodeRabbit が読み直したときに、その周りで見つかっている。
#3268 では同じ `packages/core/src/translate/db.ts` の指摘がラウンドごとに 1〜2 件ずつ出た。記事が
「ラウンドごとに古いバグを少しずつ見つける」と書いている形と同じで、修正の前に、触れるファイルを
こちらで読み直しておけば先に拾える。

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
| ruleset | approving review は 0 件で可、thread の解決は要求しない。CodeRabbit の状態はマージを止めない。`dismiss_stale_reviews_on_push: true` |
| ガードレール | 2026-07-01 以降の 820 コミットで revert は 0 件。計測の仕組みはない |

## 制約・前提

- **人間のレビュアーは 1 人。** 記事の「2 人の承認」に当たる段階は作れない。段階の差は
  承認の人数ではなく、人間がどこまで読むかと、自動レビューをどこまで重ねるかで表す。
- **PR の作成者は自分の PR を approve できない。** Claude が作る PR も作成者は kompiro なので、
  ruleset の `required_approving_review_count` を 1 以上にすると全 PR がマージできなくなる。
  段階の強制は承認ではなく、ラベルと required check と auto-merge の条件で行う。
- **ADR-2716 は「マージ判断は引き続き人間が持つ」と決めている。** Low の auto-merge はこの
  一点を覆すので、昇格時の ADR で ADR-2716 のこの部分を supersede する。CodeRabbit を
  required check にしない、は変えない。Low は CodeRabbit の approve を auto-merge を有効にする
  条件として手順で待つが、ruleset は待たない。CodeRabbit が止まっても PR はマージ不能にならず、
  auto-merge されずに人間の手に戻るだけである。
- **ADR-2716 が却下した `required_review_thread_resolution: true` は使わない。** 指摘への対応は
  ruleset ではなく converge で求める。
- **ADR-3011 は判断を含む基準を Claude の判断だけで適用することを却下した。** そのため段階は
  パスという観測可能な事実で決め、Claude の判断で段階を下げることはしない。
- **リポジトリは public。** 外部からの PR は、変更内容にかかわらず High として扱う。
- out of scope: `engineering:code-review` と組み込みの `/code-review high` の比較。
  過去の PR で CodeRabbit の指摘をどれだけ先に拾えるかを測る実験は、やるなら別 Issue にする。
  CodeRabbit のプランの見直しも本 Design Doc では扱わない。

## 検討した選択肢

### 案1: パスで段階を決め、どの段階も approve まで回して再レビューを 3 回で打ち切る

PR の差分に含まれるファイルのパスから段階を決める。PR の段階は、含まれるファイルの段階の
最大値とする。どの規則にも当たらないパスは Medium に倒す。

CodeRabbit のラウンドは、どの段階でも approve まで回す。**再レビューが 3 回に達しても
approve されなければ止めて、人間が見る。** 段階が変えるのは、approve の後に人間が何をするかである。

| 段階 | パス | approve の後 |
| --- | --- | --- |
| Low | `docs/adr/**`、`docs/test-perspectives/**`、`docs/guide/**`、テストファイルだけ（`*.test.ts(x)`・`*.spec.ts`） | CI が通れば auto-merge。人間は読まない |
| Design | `docs/design/**` | 人間が必ずレビューする |
| Medium | 上と下に当たらないもの（`packages/*` の feat / fix、`packages/nest/**`、`docs/acceptance/**`、`examples/**` を含む） | 人間がサマリー・証拠・preview を見て判断する（今の運用） |
| High | `.github/workflows/**`、`.github/actions/**`、release（各パッケージの `CHANGELOG.md` と `package.json` の `version`）、依存の変更（`package.json` の `dependencies` / `devDependencies` / `pnpm.overrides`、`pnpm-workspace.yaml`）、`docs/spec/**`、`docs/concepts*.md`、`docs/process.md`、`.claude/rules/**`、`.coderabbit.yaml`、`lefthook.yml`、`scripts/lint/**` | 人間が差分を読む |

`docs/acceptance/**` と `examples/**` は Low に入れない。

- **`docs/acceptance/**`**：ADR-2331 は、AT の受け入れ条件を変える差分を人間のレビューなしに
  通さないとして、auto-merge の例外から外した。理由は 2 つで、手動項目のチェック状態は ADR-3169 で
  常に未チェックの定義になり消えたが、TC の増減は残っている。AT の変更は実装 PR と一緒に来ることが
  多く、AT だけの PR は少ないので、Medium に置いて失うものは小さい
- **`examples/**`**：パスでは typo と構造の変更を区別できない。登録済みのディレクトリは
  `packages/core/src/builtins/examples.ts` とミラーで同期するので、どのみち Medium になる。
  Low に入れて効くのは登録されていないディレクトリだけで、それも docs-site のギャラリーに出る内容である

段階とは別に、**差分が `packages/nest/**` か `.github/workflows/**` に触れる PR は、PR 前の
`/engineering:code-review` に加えて `/security-review` を当てる。** nest はシークレットと
預かったデータをコードとして持たない方針なので段階は Medium のままにするが、外部に公開した
Worker であることは変わらない。workflow は権限と secret の扱いを変えうる。

CodeRabbit の effort 見積もりは段階を**上げる**ためにだけ使う。パスで Low と決まった PR でも、
CodeRabbit のサマリーにある見積もりが 4 以上なら Medium として扱う。見積もりで段階を下げることはしない
（背景の観測のとおり、見積もりはリスクと一致しない）。この引き上げは required check「Review tier」が
機械で検査する。push の時点ではまだサマリーがないので、check は CodeRabbit がレビューを出した時点
（`pull_request_review` の `submitted`）でも走り、サマリーの見積もりを読む。見積もりが 4 以上なのに
`risk: low` が付いていれば失敗する。読むのは `coderabbitai[bot]` が書いたサマリーだけである。public
リポジトリでは誰でも PR にコメントを書けるので、ほかの人が書いた見積もりは使わない。CodeRabbit のサマリーが
あるのに見積もりが 1〜5 の整数として読めなければ、`risk: low` を通さない（読めない入力は厳しい側に倒す、
TPL-3286）。サマリーがなければ（CodeRabbit が止まっているなど）パスの段階だけで判定する。見積もりは
段階を上げる方向にしか効かないので、CodeRabbit が止まってもマージ不能にはならない。

ラウンドを減らすために、初回の指摘で出し切らせる手も合わせて入れる。

- **修正で触れたファイルは、push の前にファイル全体をローカルでレビューする。** 再レビューで出た指摘は
  10 件すべて修正で触れたファイルにあり、半分は修正コミットが入れた行、半分はその周りの既存の行だった。
  修正の差分だけでなく触れたファイル全体に `/engineering:code-review` を当ててから push する
- **同じ種類の問題は、すべての箇所をまとめて指摘させ、まとめて直す。** 記事の「Flag the class of bug」。
  `.coderabbit.yaml` の指示に足し、こちらも指摘を直すときに同じパターンを検索して全箇所を直す

**メリット**

- 判定が観測可能な事実（パス）で閉じ、機械で検証できる（`.claude/rules/README.md` のチェックリスト 2・8）
- 当てはまらないパスが安全側（Medium）に倒れる。ADR-2331 が退けた「数え上げは漏れる」は、
  漏れたときに例外から外れるだけで危険側には倒れない形だったが、本案の Low も同じ性質を持つ
- 人間を通らないマージは、CodeRabbit の approve と CI を通った docs とテストに限られる
- ラウンドの上限が全段階で 1 つの数（3）になり、#3268 のような長引く PR が人間に早く戻る

**デメリット**

- High は数え上げで、漏れると危険側（Medium）に倒れる。High のパスを増やすときは本表を直す必要がある
- rate limit への効き目は限られる。37 本の実測では、上限 3 で減る再レビューは 4 回（#3268）で、
  新しい指摘を出さない確認の再レビューはそのまま残る。上限のほかに効くのは、main の取り込みで再レビューしないことと、
  修正をローカルで確かめてラウンドそのものを減らすことで、どちらも過去の数字からは見積もれない

### 案2: CodeRabbit の effort 見積もりで段階を決める

CodeRabbit が初回レビューで出す見積もりが 1〜2 なら、人間を通らずにマージする。
スクリプトも required check も要らず、最も安い。

**メリット**

- 新しい仕組みがほぼ要らない。見積もりはすでにサマリーに出ている

**デメリット**

- 見積もりはレビューの手間であってリスクではない。見積もり 1〜2 の PR には deps・CI・release・
  process の PR が含まれ、これらが人間を通らずにマージされる
- 段階を外部サービスの出力に預けることになり、CodeRabbit の振る舞いが変わると段階も黙って変わる

### 案3: 段階を作らず、converge のラウンド上限だけを下げる

全 PR で再レビューを 3 回までにする。変更は converge の 1 行で済む。

**メリット**

- 最小の変更で #3268 のような長引く PR を抑えられる

**デメリット**

- 人間が読む PR の数は変わらない。人間の時間という目的に届かない

### 案4: CodeRabbit は初回レビューだけにし、修正の確認はローカルで行う

確認の再レビューを省く。修正はローカルの `/engineering:code-review` で確かめ、
CodeRabbit の approve を待たずに人間に渡す。実測で、Design と Medium の再レビュー 29 回が減る。

**メリット**

- rate limit に最も効く

**デメリット**

- 初回だけでは不十分である。実測で、再レビューは 37 本中 5 本で新しい指摘（10 件）を出しており、
  その半分は初回の時点にあった行に付いていた。ローカルのレビューが拾える保証はない
- Low の auto-merge の条件から CodeRabbit の approve が消え、人間を通らないマージを CodeRabbit の
  初回の 1 回と CI だけで決めることになる

## 比較

| 観点 | 案1 | 案2 | 案3 | 案4 |
| --- | --- | --- | --- | --- |
| 減る再レビュー（37 本の実測から） | 4 回 + approve 後の取り込みの分 + 見積もれない分（ローカルでの修正確認） | 約 20 回（うち 10 回は High に当たる PR） | 4 回 | 約 29 回 |
| 人間を通らずにマージされる PR | CodeRabbit が approve した docs とテスト | workflow・依存・release を含みうる | 増えない | 初回レビューだけを通った docs とテスト |
| 初回で拾えない指摘 | approve までで拾う | 拾わない | approve までで拾う | 拾わない |
| 判定の根拠 | パス（repo の中で検証できる） | 外部サービスの見積もり | なし | パス |

## Related TPLs

- [TPL-1725](../test-perspectives/TPL-1725-gated-test-suite-detection-gap.md)：遅延実行や条件付きの検査は、
  その検査対象を変える PR で必ず起動させる。段階を検証する required check にパスフィルタを付けないのは
  この観点による（docs だけの PR こそ Low になるので、`ci.yml` の `paths-ignore` で飛ばされると検証が消える）
- [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)（本 PR で起こす proactive TPL）：
  人間を通らないマージを許す判定は最終の差分で行い、どの規則にも当たらない入力を厳しい側に倒す。
  ADR-2331 の auto-merge は判定が PR 作成前の 1 回で、機械の検査を持たない（ADR-2331 の未決）。
  本設計で Low の auto-merge に広げると、この形の誤りが届く範囲も広がるので、実装前に観点として置く

## 現時点の方針

**案1 を採用する。** 初回レビューだけでは拾えない指摘が実測で出ているので、どの段階も
approve まで回す。そのうえで、3 回の再レビューで approve されなければ人間が見る。段階は
変更そのもの（パス）から決め、approve の後に人間を通らない経路を docs とテストに限る。
案2 は人間を通らずにマージされる範囲が workflow と依存に広がる。案3 は人間の時間に届かない。
案4 は rate limit に最も効くが、初回で拾えない指摘を落とす。

本案は rate limit の主な原因（確認の再レビュー）を残す。rate limit への効き目は、main の
取り込みで再レビューしないことと、修正をローカルで確かめてラウンドを減らすことに頼る。
効いたかどうかは導入後の計測で確かめる。

### 段階ごとの流れ

**全段階に共通**

1. PR を作る前に段階判定のスクリプトでブランチの差分を判定し、段階のラベル
   （`risk: low` / `risk: medium` / `risk: high`、Design は `risk: design`）を付けて draft で作り、ready にする
2. CodeRabbit の初回レビューが届く。Low で effort の見積もりが 4 以上なら、ラベルを `risk: medium` に替える
3. 指摘をすべて、直すか理由を返信して解決する。直す前に同じパターンの箇所を検索して全部直し、
   修正で触れたファイル全体に `/engineering:code-review` を当ててから、まとめて 1 回 push する
4. converge が `@coderabbitai review` で再レビューを頼む。approve されるまで 3 から 4 を繰り返す
5. **再レビューが 3 回に達しても approve されなければ止める。** 残っている指摘と取りうる進め方を
   人間に渡す。Low はこの時点で auto-merge の対象から外れ、人間がマージを判断する

**approve の後**

- **Low**：required check「Review tier」が、最終の差分・作成者・CodeRabbit のサマリーの見積もりから段階を出し、
  Low のときだけ通る。そのうえで `gh pr merge --auto --squash --delete-branch` で auto-merge にする
- **Design**：人間がレビューする
- **Medium**：人間がサマリー・証拠・preview を見て判断する
- **High**：人間が差分を読む

**PR の差分の外への指摘は直さず、Issue にする。** 判定は 1 つ、**指摘された行が PR の差分
（`git diff -U0 origin/main...HEAD`）の hunk に含まれるかどうか**。含まれなければ、PR が持ち込んだ
問題ではないので、この PR では直さない。重複がないか既存の Issue を検索してから Issue を起こし、
指摘にはその Issue へのリンクを返して閉じる（thread は `resolveReviewThread`、本文だけの指摘は
`<!-- cr-comment:v1:<id> -->` を書いたコメント）。直し始めると PR のスコープが広がり、approve の後なら
approve が外れて再レビューにもなる。

**場所が判定できない指摘は、PR の範囲として扱う。** ファイルと行を持たない指摘や、指す行が PR の差分の
中か外か決められない指摘は、差分の外として Issue に回さない。通常の指摘と同じく直すか理由を返して却下し、
どちらも決められなければ人間に確認する。Issue に回すのは、差分の外だと確かめられた指摘だけである。

CodeRabbit の「Outside diff range」はこの判定に使わない。CodeRabbit の言う範囲外は、たいていその回の
push の差分の外で、PR の差分の外とは限らない。本 PR でも、approve と一緒に届いた「Outside diff range」の
2 件はどちらも本 PR が足したファイルの行で、うち 1 件は正しい Major だった。PR の差分の中の行への指摘は、
CodeRabbit の分類にかかわらず、この PR の範囲として直すか理由を返して却下する。

**人間のレビューの後**：人間が修正を頼み、その修正を push したら、CodeRabbit に再レビューを頼む。
再レビュー 3 回の上限は、ここから数え直す。人間の指摘への修正は CodeRabbit の approve より後に入る
コードなので、確かめずに残さない。一方で、人間がすでに PR を読んでいるので、それまでのラウンドの
回数で止めることはしない。

**外部からの PR**：作成者が信頼リスト（現状 `kompiro` だけ）にいなければ、段階は High になる。

**ADR-only の auto-merge（ADR-2331）** はそのまま残す。Low の特別な場合（CodeRabbit も通らない）
として位置づける。**`skip-coderabbit` と Low は組み合わせない。** 組み合わせると誰も読まない
PR になる。`skip-coderabbit` を付けた PR は段階にかかわらず人間がレビューする。

### main の取り込みは再レビューしない

CodeRabbit の approve の後に main を取り込んでコンフリクトを解消しても、PR が変える中身が
同じなら再レビューは何も足さない。並行する PR が同じ一覧表（`docs/test-perspectives/README.md`
の TPL 一覧など）に行を足すと、この取り込みは頻繁に起きる。

判定は 1 つ、**取り込みの前と後で、PR の差分（`git diff -U0 origin/main...HEAD`）の追加行と
削除行の集合が同じかどうか**。hunk の位置や前後の文脈が変わっても、集合が同じなら同じとみなす。
比べるのは、`.coderabbit.yaml` の `path_filters` で除外していないファイルの行だけにする。CodeRabbit が
読まないファイル（`pnpm-lock.yaml`、`pnpm adr:regenerate` が出す `docs/adr/effective.md` や graph、
`pnpm gen:guide-diagrams` が出す guide の図）は、取り込みの後に作り直して行が変わっても再レビューを起こさない。
実測では、approve の後に main を取り込み、lockfile を作り直した push が 2 回、それだけのために再レビューを
起こしていた（#3247、#3225）。

| 取り込みの結果 | どうするか |
| --- | --- |
| 集合が同じ（両方の行を残すだけの解消、コンフリクトのない取り込み） | 再レビューを頼まない。ラウンドにも数えない。Low は required check の段階判定だけが走る |
| 集合が違う（解消で PR の行を書き換えた） | 修正コミットとして扱い、1 ラウンドに数えて再レビューを頼む |

この判定が拾えないことが 1 つある。main の変更が PR の行の意味を変えても、行そのものが同じなら
「同じ」になる（例: PR が足した行の上の見出しを main が書き換えた）。見出しや構文のまとまりが
変わったかを観測できる形で判定する方法はなく、判定を前後の文脈まで広げると、上の TPL 一覧の例のような
日常的な取り込みも毎回再レビューになる。そこで判定は行の集合のままにする。main 側の変更はその PR で
レビュー済みであること、Medium 以上は人間が読むこと、で受け入れる。

本 PR（#3287）で実際に起きた例: #3272 が TPL 一覧に TPL-3180 の行を足し、本 PR の TPL-3286 の
行と同じ位置でコンフリクトした。両方の行を番号順に残して解消すると、追加行と削除行の集合は
取り込み前と一致し、違ったのは hunk の位置だけだった。

**ラウンドの途中では main を取り込まない。取り込みは approve の後に行う。** 本 PR では、初回の
指摘への修正と main の取り込みを 1 回の push にまとめたところ、CodeRabbit は
`Review skipped: We couldn't safely recover the incremental review` を返し、その push をレビューしなかった。
次のラウンドでも修正と main の取り込みを 1 回で push したが、こちらは普通にレビューされた。
merge commit を含む push では差分だけの再レビューを組み立てられないことがあり、そのときは
PR 全体を見直す `@coderabbitai full review` を頼むしかない。コンフリクトはマージを止めるがレビューは
止めないので、取り込みを approve の後に回しても失うものはない。これまでの規則（ADR-3052 が ADR-2898 から
引き継いだ「ラウンド中の取り込みは単独で push せず、そのラウンドの修正と一緒に push する」）は、
この観測で置き換える。2 回のうち 1 回で起きたので、毎回起きるわけではない。

**approve の後も、取り込むのはコンフリクトがあるときだけにする。** ruleset は base に追いついていることを
求めない（`strict_required_status_checks_policy: false`）ので、コンフリクトがなければ取り込まずに
squash merge できる。取り込みの push を減らせば、下の approve の取り消しも起きない。

`auto_incremental_review: false` にすると、この push で CodeRabbit が自動で再レビューすることは
なくなる。converge は上の判定が「同じ」なら再レビューを頼まずに終わる。

**approve は取り込みの push で取り消される。** ruleset の `dismiss_stale_reviews_on_push: true` は、
main を取り込んだだけの push でも CodeRabbit の approve を dismiss する（maintainer が確認済み）。
直近 80 本では、approve を取り消した push のうち 8 回（#3278、#3277、#3267、#3247、#3244 の 5 本）が
merge commit で、そのたびに CodeRabbit がもう一度レビューして枠を使っていた。今の設定
（`auto_incremental_review` が有効）では、push そのものがレビューを起こすからである。
この場面は日常的に起きる。approve の取り消しはマージを止めない（ruleset は approve を 0 件で許す）が、
「CodeRabbit の approve を待ってから人間がレビューする」と「Low は approve の後に auto-merge する」の
2 つの判定が、HEAD に対する最新レビューの state を見ているので、取り込みのたびに外れる。

そこで、**approve の有効性も同じ判定で決める。** CodeRabbit が approve したコミットから HEAD までの push が
すべて main の取り込みで、approve したコミットと HEAD とで PR の差分の追加行と削除行の集合が同じなら、
その approve は HEAD に対しても有効とみなす。集合が違えば、approve は無効で、再レビューを頼む。

ruleset の `dismiss_stale_reviews_on_push` は外さない。外すと、修正を push した後も古い approve が
`APPROVED` のまま残り、見た目と中身が食い違う。取り消しは残したまま、こちらの判定を「approve された
中身が HEAD まで変わっていないか」に揃える。

### 実装の指針

1. 段階判定のスクリプトとそのテストを書く。
   置き場は `scripts/review/tier.ts` と `scripts/review/tier.test.ts`。
   入力は変更ファイルの一覧と（あれば）`package.json` の差分、出力は段階とセキュリティレビューの要否。
   テストでは各段階の代表パス、最大値の取り方、どれにも当たらないパスが Medium になること、
   `package.json` の scripts だけの変更は依存の変更に数えないことを固める。
   main の取り込みの前後で追加行と削除行の集合を比べる判定も同じスクリプトに置く。比較から外すファイルは
   `.coderabbit.yaml` の `path_filters` から読み、一覧を二重に持たない
2. required check の workflow `review-tier.yml` を足す。パスフィルタは付けない（TPL-1725）ので、
   skip stub は要らない。draft では動かさない（ADR-2643）。`if` で飛ばした job は required check に
   success を返すので、`types:` に `ready_for_review` を入れる。ラベルの付け替えでも判定し直すよう
   `labeled` / `unlabeled` も入れ、CodeRabbit の見積もりを読むために `pull_request_review` の `submitted` でも
   走らせる。見積もりは `coderabbitai[bot]` が書いたサマリーからだけ読み、サマリーがあるのに 1〜5 の整数として
   読めなければ `risk: low` を通さない。最終の差分・作成者・（あれば）見積もりから段階を出し、**`risk: low` ラベルが付いているのに
   その段階が Low でない場合だけ失敗する。** 作成者が信頼リストにいない PR は段階が High になるので、
   `risk: low` が付いていなければ通り、人間のレビューを経てマージできる。read-only の `GITHUB_TOKEN` で
   動くので、fork からの PR でも同じに動く
3. ラベル `risk: low` / `risk: design` / `risk: medium` / `risk: high` を作る
4. `.coderabbit.yaml` を変える。`reviews.auto_review.auto_incremental_review: false` にして、push のたびの
   自動再レビューを止め、再レビューは `@coderabbitai review` を投げたときだけにする。同じ種類の問題は
   すべての箇所を 1 つの指摘にまとめるよう指示を足す。`profile` は `chill` のまま
   （`assertive` は初回の指摘を増やすが nitpick も全 PR に増え、それを直すラウンドが増える）
5. `/coderabbit-converge` を変える。上限を「`changes` への対応 5 ラウンド」から「再レビュー 3 回」にし、
   全段階で同じにする。修正を push する前に、同じパターンの箇所の検索と、修正で触れたファイル全体への
   `/engineering:code-review` を入れる。再レビューは push の後に converge が明示的に頼む。
   人間のレビューの後の修正では再レビューを頼み、上限を数え直す。
   指摘を分ける最初の段で、指摘された行が PR の差分の hunk に含まれるかを判定し、含まれなければ
   直さずに Issue を起こして閉じる（重複を検索してから。Issue は英語で、指摘の要旨と PR へのリンクを書く）。
   ファイルと行を持たない指摘など、含まれるかを判定できない指摘は Issue に回さず、PR の範囲として扱う。
   この判定は 1 のスクリプトに置く。
   ラウンド中は main を取り込まず、approve の後に取り込む（「main の取り込みは再レビューしない」）。
   main を取り込んだ push は、1 の判定で再レビューを頼むかを決める。converge の到達状態と
   `docs/process.md`「人間のレビューは CodeRabbit が approve してから始める」の判定は、HEAD に対する
   最新レビューの state ではなく、「approve したコミットと HEAD とで追加行と削除行の集合が同じか」で決める。
   取り込みの push で dismiss された approve の commit は、timeline の `review_dismissed` イベント
   （`dismissed_review.state` が `approved`）から引ける。この判定は `scripts/coderabbit/review-state.ts` に置き、
   converge と Low の auto-merge の手順が使う。required check「Review tier」は approve を見ない
   （CodeRabbit を required check にしない、という ADR-2716 の決定を保つ）
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
- ドキュメント更新: `docs/process.md`、`.claude/rules/adr.md`、`.github/PULL_REQUEST_TEMPLATE.md`、
  `.claude/skills/coderabbit-converge/SKILL.md`
- 計測: 導入後 1 か月で次を見る。基準は本 Design Doc の 37 本・80 回・再レビュー 43 回
  - CodeRabbit のレビュー回数と、1 本あたりの再レビュー回数
  - 再レビューで出た新しい指摘のうち、修正コミットが入れた行に付いたものの数（本 Design Doc では 5 件）
  - revert 数と、マージ後 1 週間以内に同じ箇所を直した fix PR。増えたら Low の範囲を狭める

## 決めないこと

- `engineering:code-review` と組み込みの `/code-review high` の比較（制約・前提の out of scope）
- PR を作る前に、CodeRabbit CLI（`coderabbit review --agent`）で同じレビュアーをローカルで当てるか。
  初回で拾えない指摘を PR の前に拾える可能性があるが、PR のレビューと枠を共有するか、
  `.coderabbit.yaml` の `path_instructions` が効くかを確かめてから決める
- Low の範囲を広げること（例: `packages/e2e/**` のヘルパーまで含めるか）。過去の 37 本では、テストの PR も
  e2e のヘルパーに触れて Medium になり、Low に当たる PR はなかった。導入後の計測で revert と fix PR が
  増えないことを確かめてから、別途検討する
