# リスク段階で PR のレビューの深さとマージ経路を決める

- **日付**: 2026-10-18（2026-10-25 改訂: 方針を案1 から案5 に差し替えた）
- **ステータス**: 検討中
- **PR**: #3287（初版）、改訂の PR
- **関連**:
  - 引き金 Issue: [#3286](https://github.com/kompiro/karasu/issues/3286)
  - 関連 ADR: [ADR-2716](../adr/2716-coderabbit-request-changes-workflow.md)（CodeRabbit の approve はマージ許可ではない）、[ADR-2331](../adr/2331-adr-automerge-scope.md)（ADR-only PR の auto-merge）、[ADR-3011](../adr/3011-skip-coderabbit-label.md) / [ADR-3117](../adr/3117-coderabbit-ignore-command-for-skip.md)（CodeRabbit から外す PR）、[ADR-3052](../adr/3052-review-branch-diff-before-draft-pr.md)（PR 前の `/engineering:code-review`）、[ADR-3326](../adr/3326-coderabbit-cli-once-before-ready.md)（ready の前に CLI を 1 回）、[ADR-3333](../adr/3333-converge-after-ready-hook.md)（ready の直後に converge へ引き継ぐフック）、[ADR-3342](../adr/3342-ready-gate-local-review.md)（CLI が済むまで ready を拒否する）、[ADR-2643](../adr/2643-stacked-pr-workflow.md)（draft では分単位の CI を止める）
  - 関連 TPL: [TPL-1725](../test-perspectives/TPL-1725-gated-test-suite-detection-gap.md)、[TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)（初版で起こした proactive TPL。改訂でローカルレビューの記録の観点を足す）
  - コード: `.coderabbit.yaml`、`.claude/skills/coderabbit-converge/SKILL.md`、`.github/PULL_REQUEST_TEMPLATE.md`、`scripts/coderabbit/converge-after-ready.sh`

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

### 改訂の経緯（2026-10-25）

初版は案1（どの段階も CodeRabbit の approve まで回す）を採り、案4（CodeRabbit は初回だけ）を
「初回で拾えない指摘を落とす」として却下した。改訂では、同じ観測を読み直して方針を案5 に差し替える。

- **初回で拾えなかった 10 件は、すべて Minor だった。** 再レビューのラウンドを全 PR で回して得ていたのは
  Minor の指摘で、その代わりに rate limit で全 PR の待ち時間を延ばしていた。人間が差分を読まない、または
  承認役を CodeRabbit に頼る段階にだけラウンドを残せば、失うのは Medium 以下の PR の Minor の指摘になる
- **初版の後に、ready の前のローカルレビューが機械で前提条件になった。** CodeRabbit CLI を `--deep` で
  1 回当てる手順（ADR-3326）と、それが済むまで `gh pr ready` を拒否するゲート（ADR-3342）が入った。
  CLI は PR とは別の枠で数えられる。PR の CodeRabbit を外しても、Claude のセッションで ready にした PR は
  CLI を通っている。CLI を飛ばせるのは `KARASU_LOCAL_REVIEW_SKIPPED` に理由を書いたときだけで、案5 では
  飛ばしたことを記録にも残し、Low では通さない（「ローカルレビューの記録」）
- **ローカルレビューは、何を指摘されてどう対応したかが残らない。** 初版が案4 を却下したもう 1 つの理由は、
  人間を通らないマージを「CodeRabbit の初回の 1 回と CI だけ」で決めることだった。ローカルレビューの指摘と
  対応を PR に記録し、required check でその形式と HEAD との整合を検査する。記録は自己申告で、レビューが
  実際に行われたことを check は確かめない（確かめるのは、CLI について ADR-3342 のゲートだけ）。それでも、
  指摘を放置したまま、または記録より後のコミットを確かめないままマージすることは機械で止まり、人間は
  何が指摘されどう扱われたかを PR 本文で読める

## 現状（インベントリ）

| 層 | karasu の現状 |
| --- | --- |
| PR 前の検証 | base との差分に `/engineering:code-review`（ADR-3052）と CodeRabbit CLI を 1 回（ADR-3326。済むまで `gh pr ready` を拒否する、ADR-3342）、qa agent、lefthook。指摘と対応の記録は残らない |
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
  required check にしない、は変えない。案1 では、Low は CodeRabbit の approve を auto-merge を有効にする
  条件として手順で待つが、ruleset は待たない。CodeRabbit が止まっても PR はマージ不能にならず、
  auto-merge されずに人間の手に戻るだけである。案5 では Low は PR の CodeRabbit を通らず、
  CodeRabbit の approve は check の外に置いたままにする。check は、差分から出した段階・ラベル・
  ローカルレビューの記録（`head` の一致、修正コミットの祖先関係、`declined` / `waived` の扱い）を検査する。
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

### 案5: 段階で PR の CodeRabbit を回すかを決め、ローカルレビューの記録を通す条件にする

段階はパスで決める。決め方は案1 と同じである。案1 では、段階は「approve の後に人間が何をするか」を決めていた。
案5 ではそれに加えて、**PR で CodeRabbit を回すかどうか**も段階で決める。CodeRabbit を回さない段階では、
ローカルレビューの指摘と対応を PR 本文に記録し、required check がその記録を検査する。

段階の順序は Low < Design < Medium < High とし、PR の段階は含まれるファイルの段階の最大値にする
（案1 と同じ）。設計ドキュメントとコードを 1 本の PR に入れると Medium になり、PR の CodeRabbit は走らない。

案1 の段階の表に、2 点を足す。

- **段階を決める仕組みそのものを High に入れる。** `scripts/review/**`、`scripts/coderabbit/**`、`scripts/bin/**`、
  `.claude/settings.json`、`.claude/skills/**`、`.github/PULL_REQUEST_TEMPLATE.md` である。required check は
  `pull_request` で PR 側の分類器を実行する。そのため、分類器を軽い側に書き換える PR は、自分自身を軽く判定できる。
  案1 ではそうした PR も CodeRabbit を通ったが、案5 の Medium は通らない。High に入れれば、
  CodeRabbit の approve と、人間が差分を読むことを通る（workflow はもともと High である）
- **ADR の昇格の差分は Low にする。** ADR-2331 の適用条件を分類器の規則にする。昇格の PR は
  `docs/design/**` の削除（Design）を含み、`docs/acceptance/**` などのリンクの張り替え（Medium）を含みうる。
  パスだけで判定すると Low にならない。そこで次の 2 つを Low に数える。
  - `docs/design/**` のファイルの削除
  - 変更行の組が、削除した Design Doc へのリンクを新しい ADR へのリンクに置き換えただけのもの
  
  ADR-2331 が未決にしていた機械の検査を、この規則で兼ねる

| 段階 | PR での CodeRabbit | 通す条件 |
| --- | --- | --- |
| High | approve まで回す。再レビューは 3 回まで（案1 と同じ） | CodeRabbit の approve と、人間が差分を読むこと |
| Design | ready の直後に 1 回だけ回す。ゲートにしない | ローカルレビューの記録と、人間のレビュー |
| Medium | 回さない | ローカルレビューの記録と、サマリー・証拠・preview を見た人間の判断 |
| Low | 回さない | ローカルレビューの記録と CI が通れば auto-merge |

**CodeRabbit の起動は明示的な依頼で行い、依頼は GitHub Actions から出す。** `.coderabbit.yaml` の
`reviews.auto_review.enabled` を `false` にして、自動レビューを止める。依頼の workflow は次のように動く。

- **起動するイベント**: `pull_request_target` の `opened`（draft でないもの）、`ready_for_review`、`labeled`
- **依頼の条件**: 段階が High か Design なら、`@coderabbitai full review` をコメントする。同じ head コミットに
  依頼済みなら投げない
- **段階の出し方**: base 側の分類器で出す。PR のコードは checkout せず、差分は API で読む。
  `pull_request_target` を使うのは 2 つの理由による。1 つは、fork からの PR でもコメントを書ける権限を得るため。
  もう 1 つは、PR が書き換えた分類器で判定させないため（上の、仕組みそのものを High に入れる理由と同じ）

Claude のセッションの外で ready にした PR も、これで同じに扱える。外部からの PR、GitHub の UI で ready にした PR、
draft を経ずに開いた PR、ready の後に `risk: high` へ上げた PR がこれに当たる。

ready の直後のフック（ADR-3333）はコメントを投げない。High のときに、セッションへ `/coderabbit-converge` を
促すだけにする。Design とそれ以外では何も差し込まない。

ラベルで外す方式は、PR を開いた時点の 1 回を止められなかった（ADR-3117）。依頼したときだけ走る方式では、
この問題がそもそも起きない。

**Design で 1 回だけ回すのは、人間が読む前に照合を済ませておくためである。** 設計ドキュメントは、
既存の ADR やコードについての主張である。周辺と照合して初めて正否が決まり、それは CodeRabbit の
`path_instructions` が受け持つ面である（ADR-3011 の基準）。初版の PR（#3287）でも、approve と一緒に
届いた指摘のうち 1 件が正しい Major だった。人間は Design を必ず読むので、CodeRabbit は承認役ではない。
そのため次のようにゲートにしない。

- converge は回さない
- 再レビューもしない。自動レビューを止めているので、push で走ることもない
- 人間は、CodeRabbit のレビューが届くのを待たずに読み始めてよい
- required check は CodeRabbit の状態を見ない

届いた指摘は、Claude が直すか理由を返す。対応はローカルレビューの記録の表に、レビュアーを CodeRabbit として
残す。check はこの行を判定に入れない。入れると、レビューが届く前は check が通り、届いた後に落ちる、という
逆転が起きるからである。指摘への修正をコミットすれば記録の `head` が古くなるので、下の確認をやり直すことになる。
消費する枠は小さい。直近にマージした 100 本（2026-10-14〜10-25）のうち、`docs/design/` を含み、それ以外は
`docs/test-perspectives/` しか触らない PR は 7 本だった。

#### ローカルレビューの記録

**到達状態**: PR 本文に記録の節が 1 つある。その `head` は PR の HEAD で、すべての指摘に対応が書かれている。

```markdown
<!-- local-review:v1 base=<40-hex> head=<40-hex> -->

## Local review

Reviewers: /engineering:code-review (fresh subagent), coderabbit CLI --deep

| #   | Reviewer    | Sev   | Where                     | Finding | Disposition        |
| --- | ----------- | ----- | ------------------------- | ------- | ------------------ |
| 1   | engineering | Major | packages/core/src/x.ts:42 | ...     | fixed in a1b2c3d   |
| 2   | cli         | Minor | packages/core/src/y.ts:10 | ...     | declined: <reason> |
| 3   | engineering | Minor | (outside PR diff)         | ...     | → #3360            |

Verification: pass 1 at <40-hex>, files touched by fix commits, 0 new findings
<!-- /local-review -->
```

- **記録は Claude が書く。** `/engineering:code-review` は、実装の文脈を持たない新しい subagent で、base との
  差分に当てる。自分で書いたコードを、同じ文脈のままレビューしないためである。CLI（ADR-3326）の指摘も同じ表に並べる
- **`Reviewers:` の行には CLI を必ず書く。** CLI を飛ばしたときは `coderabbit CLI skipped: <理由>` と書く。
  理由は ready のときに `KARASU_LOCAL_REVIEW_SKIPPED` に渡したものと同じにする。Low では、CLI を飛ばした記録を通さない
  （Low の PR で飛ばしたなら、下の `waived` と同じくラベルを上げる）。案5 の Medium と Low では、CLI が
  CodeRabbit の唯一の目になる。そのため ADR-3326 の「CLI は PR レビューの前段であって、代わりではない」は、
  この 2 段階については改める
- **対応は 3 種類のどれかで書く。**
  - `fixed in <sha>`
  - `declined: <理由>`（Low では使わない。直さない判断は人間が読む段階で行う。Low の PR で指摘を却下するなら、
    ラベルを `risk: medium` に上げる）
  - `→ #<Issue>`: PR の差分の外への指摘。判定は「段階ごとの流れ」の「指摘された行が PR の差分の hunk に含まれるか」を使う
- **修正したら、修正で触れたファイル全体を確かめる。** 修正コミットが触れたファイル全体に、
  `/engineering:code-review` を当てる。これを確認と呼ぶ。背景の観測では、再レビューで出た指摘は 10 件すべて、
  修正で触れたファイルにあった。確認で出た指摘も同じ表に足して、対応を書く。確認でまた修正すれば
  `head` が進むので、確認をやり直す。確認は 3 回まで行い、それで収まらなければ人間に渡す
  （案1 の再レビュー 3 回と同じ数）
- **記録を作れない事情があるときは `waived: <理由>` と書く。** 人間が手で作った PR などがこれに当たる。
  理由が空なら通さない。飛ばすことはできるが痕跡が残る、という点で ADR-3342 の
  `KARASU_LOCAL_REVIEW_SKIPPED` と同じ考え方である。ただし Low のラベルのままでは `waived` を通さない。
  Low の PR で記録を作れないときは、ラベルを `risk: medium` に上げ、auto-merge を有効にしていれば外す。
  check は上げたラベルの段階で判定するので通り、人間がマージを判断する

置き場所は PR 本文にする。コメントにしない理由は 2 つある。

- **書ける人が限られる。** PR 本文を書き換えられるのは作成者と maintainer だけで、コメントは誰でも書ける
  （リポジトリは public）
- **本文の編集で、check が head コミットに対して走り直す。** 本文の編集は `pull_request` の `edited` イベントになる。
  一方、`issue_comment` で起動した run は PR の head コミットに紐づかない

GitHub は本文の編集履歴も残す。commit status は詳細を持てない。repo のファイルにすると PR の差分を汚す。
GitHub の review は、作成者が自分の PR を approve できないので承認の代わりにならない。

#### required check「Review tier」が足す判定

案1 の判定（`risk: low` ラベルと段階の食い違い）を広げ、次を足す。

- **段階は base 側の分類器で出す。** check は PR の差分を読むが、分類器は base のコミットのものを別のディレクトリに
  取り出して実行する。分類器を書き換えた PR が、書き換えた分類器で自分を判定しないためである
- **段階のラベルが、差分から出した段階より低ければ失敗する。** 案1 では、ラベルが低くて困るのは Low だけだった。
  案5 では、ラベルが低いと CodeRabbit も走らなくなる（`risk: medium` の付いた High の PR）。高いほうへの付け替えは許す。
  人間が CodeRabbit を回したいと判断した PR を、`risk: high` に上げられるようにするためである
- **ラベルが無ければ High として扱う。** 外部の作成者や bot はラベルを付けられないので、失敗にすると
  Dependabot の PR がすべて止まる。High として扱えば記録は求めず、CodeRabbit の依頼と人間の差分の確認に回る。
  Claude が作る PR は手順でラベルを付けるので、付け忘れは重い側に倒れる
- 以下の段階は、差分から出した段階とラベルの段階の高いほうを使う
- **段階が Low でないのに auto-merge が有効なら失敗する。** Low 以外を auto-merge しないことを、手順ではなく check で止める
  （`types:` に `auto_merge_enabled` を入れ、`pull_request.auto_merge` を見る）
- **段階が Low / Design / Medium のときだけ、記録を検査する。** High は記録を見ない。High には、信頼リストに
  いない作成者や bot の PR が入り、そうした PR は記録を作れない。High は CodeRabbit の approve と、人間が差分を
  読むことで通す
- **記録の `head` が PR の HEAD と一致すること。** 一致しない場合でも、`head` から HEAD までの push がすべて
  main の取り込みで、PR の差分の追加行と削除行の集合が同じなら、一致とみなす（「main の取り込みは再レビューしない」の判定）
- すべての指摘に対応が書かれていること。`fixed in <sha>` の sha が `head` の祖先であること
- `waived`、`declined`、CLI を飛ばした記録は、Design / Medium では通し、Low では通さない（Low でこれらが要るなら、
  ラベルを上げる）。Low で人間を通らずにマージされるのは、指摘をすべて直したか、差分の外として Issue に回した PR だけになる
- 記録の節が無い、または読めないときは失敗させる（TPL-3286）

案1 では、Medium の PR は check で落ちることがなかった。案5 では、記録の無い Medium の PR はマージできない。
段階の強制が Medium にも及ぶ。

**残る穴が 1 つある。** `pull_request` の check は、PR 側の workflow ファイルで動く。そのため `review-tier.yml` 自身を
書き換える PR は、書き換えた workflow で判定される。workflow の変更は base 側の分類器で High になる。Claude は
auto-merge を、base 側の分類器が Low と出したときにしか有効にしない。この 2 点で、この穴から auto-merge に
届く経路を閉じる。人間が手で auto-merge を有効にした場合は、この限りではない。

**メリット**

- PR で CodeRabbit を回すのが High と Design だけになる。rate limit の主な原因だった全 PR の確認の再レビューは、
  High にだけ残る
- Low の auto-merge の条件が、手順で待つ CodeRabbit の approve から、required check が検査する記録に変わる。
  auto-merge は GitHub が check を待つので、手順を飛ばしても通らない
- 人間が読む前に、指摘と対応の一覧が PR 本文に揃う。CodeRabbit のスレッドを辿るより短い
- CodeRabbit を外す例外（`skip-coderabbit`、ignore コマンド、#3341 の取り込みだけの push）は、High 以外では要らなくなる

**デメリット**

- 自分で書いたコードを自分でレビューする構図が残る。新しい subagent と CLI で文脈を分けるが、独立したレビュアーではない
- Medium 以下では、初回で拾えなかった Minor の指摘（背景の実測で 37 本中 10 件）を拾わないことがある。
  修正で触れたファイルの確認で一部は拾えるが、保証はない
- 記録を書く手間が増え、記録を読むスクリプトも必要になる
- Medium の PR でも、記録が無ければ check が落ちる

## 比較

| 観点 | 案1 | 案2 | 案3 | 案4 | 案5 |
| --- | --- | --- | --- | --- | --- |
| 減る再レビュー（37 本の実測から） | 4 回 + approve 後の取り込みの分 + 見積もれない分（ローカルでの修正確認） | 約 20 回（うち 10 回は High に当たる PR） | 4 回 | 約 29 回 | High 以外のすべて（初回レビューも Medium・Low では走らない） |
| 人間を通らずにマージされる PR | CodeRabbit が approve した docs とテスト | workflow・依存・release を含みうる | 増えない | 初回レビューだけを通った docs とテスト | ローカルレビューの記録が check を通った docs とテスト |
| 初回で拾えない指摘 | approve までで拾う | 拾わない | approve までで拾う | 拾わない | High は approve までで拾う。それ以外は修正で触れたファイルのローカルの確認で一部を拾う |
| 判定の根拠 | パス（repo の中で検証できる） | 外部サービスの見積もり | なし | パス | パスと、PR 本文の記録（どちらも repo と PR の中で検証できる） |

## Related TPLs

- [TPL-1725](../test-perspectives/TPL-1725-gated-test-suite-detection-gap.md)：遅延実行や条件付きの検査は、
  その検査対象を変える PR で必ず起動させる。段階を検証する required check にパスフィルタを付けないのは
  この観点による（docs だけの PR こそ Low になるので、`ci.yml` の `paths-ignore` で飛ばされると検証が消える）
- [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)（本 PR で起こす proactive TPL）：
  人間を通らないマージを許す判定は最終の差分で行い、どの規則にも当たらない入力を厳しい側に倒す。
  ADR-2331 の auto-merge は判定が PR 作成前の 1 回で、機械の検査を持たない（ADR-2331 の未決）。
  本設計で Low の auto-merge に広げると、この形の誤りが届く範囲も広がるので、実装前に観点として置く。
  改訂（案5）で、ローカルレビューの記録の観点を同じ TPL に足す。記録がレビューしたコミットと HEAD が違う、
  記録を誰でも書ける、ラベルを下げると CodeRabbit を避けられる、PR が書き換えた分類器で自分を判定する、の 4 つは
  「判定した差分とマージされる差分が違う」と
  「規則に当たらない入力が軽い側に倒れる」の同じ形なので、新しい TPL にはしない

## 現時点の方針

**案5 を採用する（2026-10-25 改訂。初版は案1）。** PR の CodeRabbit は、approve を承認の条件に使う
High と、人間が読む前の照合に使う Design に絞る。それ以外の段階では、ローカルレビューの指摘と対応を
PR 本文に記録し、required check がそれを検査する。段階は変更そのもの（パス）から決め、人間を通らない
経路は docs とテストに限る。この 2 点は案1 から変えない。

- 案1 は、rate limit の主な原因（全 PR の確認の再レビュー）を残す。それで得ていたのは、背景の実測では
  Minor の指摘だけだった
- 案2 は、人間を通らずにマージされる範囲が workflow と依存に広がる
- 案3 は、人間の時間に届かない
- 案4 は、ローカルの確認を記録せず、Low の auto-merge を CodeRabbit の初回の 1 回と CI だけで決める。
  案5 はその 2 点を、記録と required check で埋めたものである

効いたかどうかは導入後の計測で確かめる（「影響範囲・マイグレーション」）。

### 段階ごとの流れ

**全段階に共通（PR を作る前）**

1. base との差分に、新しい subagent で `/engineering:code-review` を当て、CodeRabbit CLI を 1 回当てる
   （ADR-3052 / ADR-3326 の手順のまま）。指摘をすべて、直すか理由を決めるか Issue に回す。直す前に
   同じパターンの箇所を検索して、全部直す
2. 修正コミットが触れたファイル全体に、`/engineering:code-review` で確認を当てる。確認で直したら、もう一度確認する（3 回まで）
3. 段階判定のスクリプトでブランチの差分を判定する。段階のラベル（`risk: low` / `risk: design` /
   `risk: medium` / `risk: high`）と、ローカルレビューの記録を本文に入れて、draft で作る。
   High では記録は任意である（check は見ない）が、Claude が作る PR では同じ形で残す
4. `gh pr ready` で draft を外す。依頼の workflow が段階を見て CodeRabbit を依頼する（High と Design だけ）。
   Low では、base 側の分類器（`origin/main` の分類器）でも Low と出ることを確かめてから auto-merge を有効にする

**ready の後**

- **High**：converge が approve までラウンドを回す。指摘をすべて直すか理由を返し、まとめて 1 回 push して、
  `@coderabbitai review` で再レビューを頼む。**再レビューが 3 回に達しても approve されなければ止め、**
  残っている指摘と取りうる進め方を人間に渡す。approve の後、人間が差分を読む
- **Design**：CodeRabbit の 1 回のレビューを待たずに、人間がレビューする。レビューが届いたら、Claude が
  直すか理由を返し、記録の表に足す。直した場合は手順 2 の確認をやり直して、記録の `head` を進める
- **Medium**：人間が、記録・サマリー・証拠・preview を見て判断する
- **Low**：required check「Review tier」が段階と記録を検査し、通れば auto-merge する
  （`gh pr merge --auto --squash --delete-branch` は ready の直後に実行してよい。GitHub が check を待つ）

案1 にあった、CodeRabbit の effort 見積もりで Low を Medium に上げる判定はやめる。案5 の Low では
CodeRabbit が走らず、見積もりを書いたサマリーが無い。見積もりがリスクと一致しないことは背景のとおりで、
段階はパスだけで決める。

**PR の差分の外への指摘は直さず、Issue にする。** CodeRabbit の指摘にもローカルレビューの指摘にも同じ判定を使う。
判定は 1 つ、**指摘された行が PR の差分
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

**人間のレビューの後**：人間が修正を頼み、その修正を push する。High では CodeRabbit に再レビューを頼み、
再レビュー 3 回の上限はここから数え直す。人間の指摘への修正は CodeRabbit の approve より後に入るコードなので、
確かめずに残さない。一方で、人間がすでに PR を読んでいるので、それまでのラウンドの回数で止めることはしない。
Design と Medium では、修正で触れたファイルに確認を当てて記録を更新する。記録の `head` が HEAD に
追いつくまで check は通らないので、確かめずに残すことは機械で止まる。

**外部からの PR**：作成者が信頼リスト（現状 `kompiro` だけ）にいなければ、段階は High になる。
bot の PR（Dependabot など）も同じく High になる。release train の PR は、パス（`CHANGELOG.md` と `version`）でも
High に当たる。release train の PR で CodeRabbit を回さない扱いは [#3350](https://github.com/kompiro/karasu/issues/3350) が別に決める。

**ADR-only の auto-merge（ADR-2331）** は Low の 1 つとして扱い、ローカルレビューの記録を求める。
Low の auto-merge は記録を検査する check を通るので、ラベルを付けるだけで検査を飛ばせる経路は残さない
（TPL-3286）。ADR の昇格はローカルレビューの範囲が小さく、PR の枠も使わないので、手間は小さい。
`adr-auto-merge` ラベルは、auto-merge で入れた ADR の PR を一覧する記録として残す。

**`skip-coderabbit` と本文の ignore コマンド（ADR-3011 / ADR-3117）** は役目を終える。
外していた PR（リンク・綴り・静的アセット）は Low か Medium に当たり、どちらも PR の CodeRabbit を回さない。
High の PR を外す基準は、もともと ADR-3011 に無い。

### main の取り込みは再レビューしない

案5 では、この節の判定は 2 か所で使う。1 つは High での CodeRabbit の approve の有効性で、
初版から変わらない。もう 1 つは、ローカルレビューの記録の `head` を HEAD と同じとみなしてよいかの判定である。
以下の説明は CodeRabbit の approve を例にするが、記録の `head` にもそのまま当てはまる。

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

自動レビューを止めると（案5 では `auto_review.enabled: false`）、この push で CodeRabbit が自動で再レビューすることは
なくなる。converge は上の判定が「同じ」なら再レビューを頼まずに終わる。

**approve は取り込みの push で取り消される。** ruleset の `dismiss_stale_reviews_on_push: true` は、
main を取り込んだだけの push でも CodeRabbit の approve を dismiss する（maintainer が確認済み）。
直近 80 本では、approve を取り消した push のうち 8 回（#3278、#3277、#3267、#3247、#3244 の 5 本）が
merge commit で、そのたびに CodeRabbit がもう一度レビューして枠を使っていた。今の設定
（`auto_incremental_review` が有効）では、push そのものがレビューを起こすからである。
この場面は日常的に起きる。approve の取り消しはマージを止めない（ruleset は approve を 0 件で許す）が、
「CodeRabbit の approve を待ってから人間がレビューする」と「Low は approve の後に auto-merge する」の
2 つの判定が、HEAD に対する最新レビューの state を見ているので、取り込みのたびに外れる（初版の観測。
案5 では前者は High だけの話になり、後者は記録の `head` の判定に置き換わる）。

そこで、**approve の有効性も同じ判定で決める。** CodeRabbit が approve したコミットから HEAD までの push が
すべて main の取り込みで、approve したコミットと HEAD とで PR の差分の追加行と削除行の集合が同じなら、
その approve は HEAD に対しても有効とみなす。集合が違えば、approve は無効で、再レビューを頼む。

ruleset の `dismiss_stale_reviews_on_push` は外さない。外すと、修正を push した後も古い approve が
`APPROVED` のまま残り、見た目と中身が食い違う。取り消しは残したまま、こちらの判定を「approve された
中身が HEAD まで変わっていないか」に揃える。

### 実装の指針

1. 段階判定のスクリプトとそのテストを書く。
   <!-- absent-path-next-line: files this design creates (#3286) -->
   置き場は `scripts/review/tier.ts` と `scripts/review/tier.test.ts`。
   入力は変更ファイルの一覧と（あれば）`package.json` の差分、出力は段階とセキュリティレビューの要否。
   テストでは各段階の代表パス、最大値の取り方、どれにも当たらないパスが Medium になること、
   `package.json` の scripts だけの変更は依存の変更に数えないことを固める。
   案5 で足す 2 つの規則（段階を決める仕組みそのものを High に入れること、ADR の昇格の差分を Low に数えること）も
   テストで固める。昇格のテストでは、リンクの張り替え以外の変更が同じ行に混ざると Low にならないことも確かめる。
   main の取り込みの前後で追加行と削除行の集合を比べる判定も同じスクリプトに置く。比較から外すファイルは
   `.coderabbit.yaml` の `path_filters` から読み、一覧を二重に持たない。
   ローカルレビューの記録を読み、検査する処理は
   <!-- absent-path-next-line: files this design creates (#3286) -->
   `scripts/review/local-review-record.ts` に置く。
   記録の節を本文に書き出す処理も同じファイルに置き、書く側と読む側で形式を二重に持たない。
   テストでは、`head` の一致、main の取り込みだけの push を一致とみなすこと、対応の無い指摘、
   `fixed in <sha>` の sha が `head` の祖先でないこと、Low の `waived` / `declined` / CLI を飛ばした記録、
   読めない記録の失敗を固める
2. required check の workflow `review-tier.yml` を足す。パスフィルタは付けない（TPL-1725）ので、
   skip stub は要らない。draft では動かさない（ADR-2643）。`types:` を書くと既定のイベントが置き換わるので、
   すべてを明示する。
   - `opened` / `synchronize` / `reopened`: push のたびに判定する
   - `ready_for_review`: `if` で飛ばした job は required check に success を返すので、draft を外したときに判定し直す
   - `labeled` / `unlabeled`: ラベルの付け替えで判定し直す
   - `edited`: 記録の更新で判定し直す
   - `auto_merge_enabled`: Low 以外の auto-merge を落とす

   分類器は base のコミットから取り出して実行する（案5 の「段階は base 側の分類器で出す」）。
   最終の差分と作成者から段階を出し、案5 の「required check『Review tier』が足す判定」を行う。
   作成者が信頼リストにいない PR とラベルの無い PR は段階が High になり、記録を求めないので、人間のレビューを
   経てマージできる。read-only の `GITHUB_TOKEN` で動くので、fork からの PR でも同じに動く
3. ラベル `risk: low` / `risk: design` / `risk: medium` / `risk: high` を作る
4. `.coderabbit.yaml` を変える。`reviews.auto_review.enabled: false` にして、自動レビューを止める。
   レビューは `@coderabbitai full review` / `@coderabbitai review` を投げたときだけ走る。同じ種類の問題は
   すべての箇所を 1 つの指摘にまとめるよう指示を足す。`profile` は `chill` のまま
   （`assertive` は初回の指摘を増やすが nitpick も全 PR に増え、それを直すラウンドが増える）。
   **変える前に、次の 2 つを確かめる。**
   - 自動レビューを止めた状態でも、手動の依頼でレビューが走り、`path_instructions` が効くこと
   - `github-actions[bot]` が投げた依頼を CodeRabbit が受け付けること

   後者が駄目なら、`auto_review.labels` に `risk: high` と `risk: design` を置き、workflow がラベルを付ける形で
   代える。どちらも成り立たなければ案5 は成り立たないので、本 Design Doc に戻る
5. CodeRabbit を依頼する workflow を足す（案5 の「CodeRabbit の起動は明示的な依頼で行い、依頼は GitHub Actions から出す」）。
   PR のコードは checkout せず、base 側の分類器とラベルの高いほうで段階を出す。ready の直後のフック
   （`scripts/coderabbit/converge-after-ready.sh`、ADR-3333）は、High のときだけ converge を促す形に変える。
   テストは今の `converge-after-ready.test.ts` に段階ごとの分岐を足す。`scripts/coderabbit/ready-gate.sh`（ADR-3342）は、
   `skip-coderabbit` / `adr-auto-merge` / ignore コマンドの PR を拒否の対象から外している。これを外し、
   どの段階でも CLI の記録を求める形に直す。案5 の Medium と Low では、CLI が CodeRabbit の唯一の目になるからである
6. `/coderabbit-converge` を変える。対象を High の PR に限る。上限を「`changes` への対応 5 ラウンド」から
   「再レビュー 3 回」にする。修正を push する前に、同じパターンの箇所の検索と、修正で触れたファイル全体への
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
   converge が使う（案5 の Low は CodeRabbit を通らないので、approve の判定を使わない）。required check「Review tier」は approve を見ない
   （CodeRabbit を required check にしない、という ADR-2716 の決定を保つ）
7. `.github/PULL_REQUEST_TEMPLATE.md` に「Risk」（段階と、その段階になった理由）と
   「How to revert」を足す。ローカルレビューの記録の節は、1 のスクリプトが書き出す
8. `docs/process.md` の PR ワークフローに段階ごとの流れを書き、「PR のマージはユーザー確認を経る」
   の例外として Low の auto-merge を明記する。「CodeRabbit を外す小さな PR」の節は、役目を終えたことを
   書いて畳む。「人間のレビューは CodeRabbit が approve してから始める」は High の話に絞る。
   `.claude/rules/adr.md` の auto-merge 節は、Low の 1 つとして記録を求める形に直し、本文の ignore コマンドの
   手順を外す（自動レビューを止めたので要らない）
9. マージ後に ruleset の required checks へ「Review tier」を足す（先に足すと、この workflow を
   持たない PR が pending のまま止まる。Playwright を required にしたときと同じ順序）
10. AT は作らない。利用者に見える振る舞いは変わらず、段階の判定と記録の検査はスクリプトのテストで、
    required check とフックの挙動は導入 PR 自身で確かめる
11. ADR 昇格: 実装完了後、`docs/adr/3286-risk-based-review-tiers.md` として昇格し、
    本 Design Doc は同 PR で削除する。supersede するのは次のとおり。
    - ADR-2716 の 2 点：「マージ判断は人間が持つ」と「人間のレビューは CodeRabbit の approve の後に始める」
      （後者は High にだけ残る）
    - ADR-3117：外す仕組みが役目を終える（ADR-3011 はすでに ADR-3117 に supersede されている）
    - ADR-2331 の判定：分類器の規則に移る
    - ADR-3326 の「CLI は PR レビューの代わりではない」：Medium と Low については改める

    ADR-3333 と ADR-3342 には、フックと ready-gate を変えるので `related_to` で参照を張る

初版の方針で進んでいた実装のうち、段階の判定・再レビュー 3 回の上限・main の取り込みの判定は、
案5 でもそのまま使える。書き直しや追加が要るのは、1（High の追加と ADR の昇格の規則、記録の処理）、
2（check の判定とイベント）、4（自動レビューの止め方）、5（依頼の workflow、フック、ready-gate）、
6（converge の対象）、8（process.md）である。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（開発プロセスだけの変更）
- ドキュメント更新: `docs/process.md`、`.claude/rules/adr.md`、`.github/PULL_REQUEST_TEMPLATE.md`、
  `.claude/skills/coderabbit-converge/SKILL.md`、`.coderabbit.yaml`、`scripts/coderabbit/converge-after-ready.sh`、
  `scripts/coderabbit/ready-gate.sh`
- 計測: 導入後 1 か月で次を見る。基準は本 Design Doc の 37 本・80 回・再レビュー 43 回と、
  [#3129](https://github.com/kompiro/karasu/issues/3129) の rate limit で弾かれた割合（Team の期間で 39%）
  - CodeRabbit のレビュー回数（High と Design に分けて）と、High の 1 本あたりの再レビュー回数
  - rate limit で弾かれた割合と、High の PR の ready から approve までの時間
  - Medium と Low の revert 数と、マージ後 1 週間以内に同じ箇所を直した fix PR。増えたら、そのパスを
    High に移すか、下の再生の計測を行う
  - 記録の `waived` の数と理由

## 決めないこと

- `engineering:code-review` と組み込みの `/code-review high` の比較（制約・前提の out of scope）
- 過去の PR の初回の差分に `/engineering:code-review` を当て直し、CodeRabbit の指摘をどれだけ先に拾えるかを
  重篤度別に数える再生の計測。案5 の判断は、背景の実測（初回で拾えなかった指摘はすべて Minor）と CLI が
  前段に残ることに頼り、この計測を前提にしない。導入後の計測で Medium と Low の fix PR が増えたときに行う
- CodeRabbit のプランを下げるか。PR のレビュー回数が減れば選択肢になるが、#3129 の判断ルールで別に扱う
- Low の範囲を広げること（例: `packages/e2e/**` のヘルパーまで含めるか）。過去の 37 本では、テストの PR も
  e2e のヘルパーに触れて Medium になり、Low に当たる PR はなかった。導入後の計測で revert と fix PR が
  増えないことを確かめてから、別途検討する
