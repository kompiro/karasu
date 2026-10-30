# ADR の生成物を毎日の PR で再生成する

- **日付**: 2026-10-30
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3416](https://github.com/kompiro/karasu/issues/3416)
  - 関連 ADR: [ADR-788](../adr/788-adr-knowledge-graph.md)（frontmatter が正本、`effective.md` などは生成物で CI が drift を検出する）、[ADR-2331](../adr/2331-adr-automerge-scope.md)（ADR PR の auto-merge は差分の性質で判定し、生成物を許す差分に含める）、[ADR-3286](../adr/3286-risk-based-review-tiers.md)（リスク段階。Low は auto-merge）、[ADR-1370](../adr/1370-release-flow-actions-driven.md)（GitHub App や PAT を足さず、Actions の PR 作成を OFF のまま運用する）、[ADR-3335](../adr/3335-refuse-commits-on-main.md)（手元で `main` にコミットしない）
  - 関連 Issue: [#3341](https://github.com/kompiro/karasu/issues/3341)（生成物の衝突を解く merge だけの push に CodeRabbit のレビューを使わない）、[#3289](https://github.com/kompiro/karasu/issues/3289)（TPL の索引を生成物にする）
  - 関連 TPL: [TPL-2658](../test-perspectives/TPL-2658-agent-write-scope-is-declared-not-prompted.md)（エージェントに任せる自動化の書き込み範囲は prompt ではなく宣言で検証する）、[TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)（人間を通らないマージを許す判定は最終の差分で行う）、[TPL-1480](../test-perspectives/TPL-1480-consistency-check-triggers-on-both-sides.md)（整合性のチェックは両側の変更で起動する）、[TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md)（結論を出せなかった安全網は失敗にする）
  - コード: `.github/workflows/adr-validate.yml`, `lefthook.yml`（`adr-regenerate-check`）, `scripts/review/tier.ts`（生成物のパス）

## 背景・課題

ADR の PR は、`pnpm adr:regenerate` が書く `docs/adr/effective.md`・`docs/adr/graph.md`・`docs/adr/graph/*.md` を ADR と一緒にコミットする。古い生成物を持つ PR は CI（`adr-validate.yml` の `adr regenerate --check`）と pre-push の `adr-regenerate-check` が落とす。

このため、ADR の PR が同時に 2 本開いていると、ADR 同士が無関係でも生成物でほぼ必ず衝突する。

- 2026-10-01 から 10-30 までにマージした `docs(adr):` の PR は 37 本。そのうち 11 本に `main` を取り込んだ merge commit がある。
- Low の ADR PR は auto-merge で入るが、衝突した PR は GitHub がマージできない。誰かが手元で `main` を取り込み、再生成して push し直すまで止まる。解き方は機械的（生成し直すだけ）でも、push・CI・人かエージェントの 1 ターンがかかる。
- #3341 で、衝突を解くだけの push に CodeRabbit のレビューを使わないようにした。衝突そのものは残っている。
- #3289 で TPL の索引（`docs/test-perspectives/index.md`）も同じ形の生成物になる。

解きたいのは「PR が生成物を運ぶので、無関係な PR 同士が衝突する」ことである。

## 現状（インベントリ）

| 観点               | 現状                                                                                                                                                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 生成物             | `effective.md`（484 行）、`graph.md`（1162 行）、`graph/<topic>.md`（topic ごと）。出力先は `adr.config.json` の `paths.outputs`                                                                                                                                                                            |
| 読み手             | `CLAUDE.md` が「有効な決定一覧」として `effective.md` を第一参照に挙げる（ADR-788）。GitHub のファイル表示で人も読む。docs-site は ADR を載せていない                                                                                                                                                       |
| PR 側の検査        | `adr-validate.yml`（required check `Validate`、paths は `docs/adr/**` など。それ以外の PR には `adr-validate-skip.yml` が no-op の `Validate` を返す）が `adr regenerate --check` を実行する。pre-push の `adr-regenerate-check`（glob `docs/adr/**`, `adr.config.json`）も同じ                             |
| main 側の検査      | 同じ `adr-validate.yml` が `main` への push でも `--check` を実行する                                                                                                                                                                                                                                       |
| 抜けている検査     | `@kompiro/adr-tools` の版を上げる PR（`package.json` / lockfile だけの差分）では `adr-validate.yml` が走らない。生成器の出力が変わっても、次の ADR PR まで気づかない（TPL-1480 の形）                                                                                                                       |
| main の保護        | ruleset `protect default branch`。削除・non-fast-forward・作成の禁止、PR 必須（squash のみ）、required check（`Check`・`Validate`・`Reference docs`・`Playwright`・`verify`）。bypass actor は 0 件。docs/process/review.md は Review tier も required と書くが、ruleset の required check には入っていない |
| Actions の PR 作成 | repo 設定「Actions に PR の作成・承認を許可」は OFF（#1370 で OFF のまま進めると決めた。ADR-1370）。`GITHUB_TOKEN` で作った PR では required check を出す workflow も起動しない                                                                                                                             |
| 分類器             | `scripts/review/tier.ts` は生成物のパス（`ADR_GENERATED_GLOBS`）を Low に数える。生成物だけの PR は Low になる                                                                                                                                                                                              |
| Claude の routine  | Claude Code の scheduled agent（routine）を、この repo の作業の予約にすでに使っている（例: #3399 の 2 本目の PR）。routine はユーザーの GitHub の名義で PR を作る                                                                                                                                           |

## 制約・前提

- `main` への直接 push は人もエージェントもしない（CLAUDE.md、ADR-3335）。ruleset に bypass actor を足すのは、この repo で初めての判断になる。
- `effective.md` は AI が文脈に入れる第一参照なので、clone した直後から（ほぼ）最新であってほしい（ADR-788）。
- auto-merge の可否は、PR を誰が作ったかや prompt の約束ではなく、差分という観測可能な事実で機械的に判定する（ADR-2331、TPL-2658、TPL-3286）。
- out of scope: 生成物の中身や形式（adr-tools 側）、ADR 以外の生成物（`gen:reference` の表など、PR 単位で衝突しないもの）。TPL の索引は #3289 が入ったら同じ仕組みに載せる（「未解決の問い」）。

## 検討した選択肢

### 案1: `main` への push ごとに、bypass の鍵で再生成を commit する

PR は生成物をコミットしない。`main` への push ごとに workflow が再生成し、ruleset の bypass actor にした deploy key で生成物だけの commit を `main` に push する。

**メリット**

- `main` の生成物が古いのはマージから 1〜2 分だけ。

**デメリット**

- ruleset に初めて bypass actor を足す。bypass はパスで絞れず、PR 必須と required check をまとめて越える。鍵が漏れれば、CI を通さずに `main` に何でも書ける。
- 被害を絞る柵が多い: 削除・force-push の禁止を bypass の無い ruleset に分ける、鍵を持つ job で依存を動かさない、artifact を checkout の外で検査する、鍵を読める job を 1 つにテストで固定する、許可するパスの上限を workflow に固定する。どれも漏れれば穴になる。
- 生成物だけの commit が `main` への push の workflow（`ci.yml`・`deploy.yml`・`pages.yml` など）を ADR のマージごとに余分に起動するので、各 workflow に `paths-ignore` を足す。commit メッセージの `[skip ci]` は、この repo の squash が PR の commit メッセージを本文に並べる（`COMMIT_MESSAGES`）ので使えない。
- bypass actor の push が required status checks に止められないことを、spike で確かめる必要がある。

### 案2: 手元の merge driver で衝突を自動で解く

生成物は今までどおり PR に入れる。`.gitattributes` で生成物に独自の merge driver を割り当て、merge の後のフックで `adr regenerate` し直す。

**メリット**

- サーバー側も ruleset も変えない。

**デメリット**

- 衝突そのものは無くならない。GitHub が衝突を報告した Low の PR は、誰かが手元で取り込むまで止まったまま。
- merge driver の設定は `.git/config` に入り commit できないので、clone ごとに登録する仕組みが要る。GitHub の「Update branch」ボタンでは効かない。

### 案3: 生成物を repo から外す

生成物を `.gitignore` に入れ、`pnpm install` と checkout・merge のフックで手元に生成する。

**メリット**

- 衝突も鍵も無い。

**デメリット**

- GitHub のファイル表示から消える。クラウドのエージェントや install していない clone では `CLAUDE.md` の第一参照が無い。ADR-788 が決めた読み方が崩れる。

### 案4: 毎日 1 回、Claude の routine が再生成の PR を出して auto-merge する

PR は生成物をコミットしない。毎日 1 回、Claude の routine が `main` から生成し直し、差分があれば生成物だけを変える PR を作って auto-merge を有効にする。PR はユーザーの名義で作られるので、required check はふつうに走る。

routine の仕事は repo のスクリプト 1 本を実行して結果を報告することだけにし、エージェントの判断に頼らない。auto-merge してよいかは CI（`Validate`）が差分で判定する。

**メリット**

- 無関係な ADR PR 同士は衝突しなくなる。再生成の PR も生成物しか触らず、ほかの PR は生成物を触れないので、衝突しない。
- ruleset・repo の Actions 設定・secret のどれも変えない。新しい鍵が無い。
- 生成物は今までどおり repo にあり、GitHub でも clone 直後でも読める。
- 生成器の版上げも翌日の再生成の PR で `main` に反映される（今は抜けている TPL-1480 の穴が閉じる）。
- routine が止まっても何も壊れない。生成物が古くなるだけで、同じスクリプトを手元で実行すれば同じ PR ができる。

**デメリット**

- `main` の生成物は最大 1 日古い。急ぐときは routine を手で起動するか、スクリプトを手元で実行する。
- 生成物の更新が Claude の routine という repo の外の仕組みに依存する。止まったことに気づく仕組みが別に要る（下の「鮮度の見張り」）。
- 再生成の PR が 1 日最大 1 本増える（ADR をマージしなかった日は 0 本）。
- 人ではない動き手が増える。routine はユーザーの GitHub の名義で、人が見ていないときに PR を作り auto-merge を有効にする。手元の Claude のセッションが今できることと同じで新しい権限ではないが、無人で毎日動く。auto-merge で入るものは `Validate` の検査で生成物だけに限る。

### 却下: merge queue

衝突を解く順番をサーバーに任せられるが、user 所有の repo では使えない（organization 所有の public repo と、Enterprise Cloud の organization の private repo だけ）。

### 却下: GitHub Actions が再生成の PR を作る

案4 と同じ形を Actions で行う案。Actions の PR 作成は OFF にしてあり（ADR-1370）、ON に戻しても `GITHUB_TOKEN` で作った PR では required check が走らない。走らせるには、required check を出す 4 つの workflow すべてに `workflow_dispatch` の入口を足してブランチに起動するか、GitHub App の鍵を足すことになる。案4 はどちらも要らない。

## 比較

| 観点                     | 案1 bypass で main に commit                              | 案2 merge driver                           | 案3 repo から外す                                     | 案4 毎日の routine PR                               |
| ------------------------ | --------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------- |
| 無関係な PR 同士の衝突   | 無くなる                                                  | 残る（手元では自動で解ける）               | 無くなる                                              | 無くなる                                            |
| Low の auto-merge の停止 | 無くなる                                                  | 残る                                       | 無くなる                                              | 無くなる                                            |
| 生成物の読みやすさ       | 今と同じ                                                  | 今と同じ                                   | GitHub から消える、手元は古くなりうる                 | 今と同じ                                            |
| 新しい鍵・例外           | deploy key と ruleset の bypass                           | なし                                       | なし                                                  | なし（routine がユーザーの名義で動く）              |
| `main` の生成物の古さ    | 1〜2 分                                                   | なし                                       | 該当しない                                            | 最大 1 日                                           |
| 生成器の版上げの反映     | `main` で自動                                             | 次の ADR PR まで抜ける                     | 手元で自動                                            | 翌日の PR で自動                                    |
| 変える場所               | workflow 1 本、ruleset、各 workflow の paths、PR 側の検査 | `.gitattributes`、フック、clone ごとの登録 | `.gitignore`、フック、docs-site、`CLAUDE.md`、ADR-788 | スクリプト 1 本、routine、PR 側の検査、鮮度の見張り |

## 現時点の方針

**案4 を採用する。** 衝突と auto-merge の停止を両方無くし、`effective.md` を repo に置いたまま保てるのは案1 と案4 で、案4 は鍵も ruleset の例外も足さない。代償は `main` の生成物が最大 1 日古いことだが、`effective.md` は有効な決定の一覧であって、その日にマージした ADR は ADR 本体を読めば分かる。案1 が要した柵（鍵の隔離・artifact の検査・ruleset の分割）は、どれも鍵があるから要ったもので、案4 には要らない。

auto-merge の安全は routine の prompt ではなく、required check の `Validate` が差分で保証する（TPL-2658、TPL-3286）。生成物のパスの集合 G を、PR の base と head それぞれの `adr.config.json` の `paths.outputs` の和集合とする。`Validate` は次の 2 種類の PR だけを通す。

- **ふつうの PR**: G のパスを 1 つも変えない。例外は、`paths.outputs` から外れた古い出力（base にだけある出力先）の削除だけ。
- **再生成の PR**: G の外を 1 つも変えず、base と head の `paths.outputs` が同じで、head の生成物の木（追加・削除・変更をすべて含むファイルの集合と中身）が head で生成し直した結果とちょうど一致する。

それ以外（両方を混ぜた PR、生成物を古い中身や手で書き換えた中身にした PR、生成物の出力先に余分なファイルを足した PR）は落ちる。これで、誰が作った PR でも、生成物以外の変更が「生成物の更新」として auto-merge に紛れ込むことはない。

差分は `git diff --no-renames --name-status base...head` で取る。rename 検出を切らないと、ADR を `graph/` の下へ移す変更が移動先（生成物のパス）だけに見える。検査は PR の merge ref ではなく `head.sha` を checkout して行う。merge ref で生成し直すと、PR の後に `main` に入った ADR の分だけ一致しなくなる。

再生成の PR が古い `main` から作られ、その後に別の ADR がマージされた場合、マージした再生成の PR は時刻 T の生成結果を `main` に置く。生成物を触るのは再生成の PR だけなので何も巻き戻らず、`main` は翌日の再生成まで古いままになる。

### 実装の指針

1. **再生成の PR を作るスクリプトを足す**（`pnpm adr:regenerate-pr`）。routine も人も同じものを実行する。
   - `origin/main` を fetch し、そこから固定のブランチ `chore/adr-regenerate` を作り直して `adr regenerate` を実行する。出力先のディレクトリ（`graph/`）は生成結果で置き換え、生成されなくなったファイルを消す。
   - 差分が無ければ、開いている再生成の PR を閉じてブランチを消し、終える。
   - 差分があれば生成物だけを commit する。開いている再生成の PR があれば、`gh pr merge --disable-auto` で auto-merge を外してからブランチを上書きで push し、auto-merge を戻す（`.claude/rules/adr.md` の「push の前に auto-merge を解く」と同じ順）。無ければ push して `chore(adr): regenerate the ADR index` の PR を `risk: low` で作り、ready にして `gh pr merge --auto --squash --delete-branch` を有効にする。
   - どの段階の失敗でも非 0 で終わる（TPL-2786）。
2. **Review tier に、生成物だけの PR の扱いを足す**（`scripts/review/**` を変えるので、この PR は High）。今の Review tier は Low の PR にローカルレビューの記録と CodeRabbit CLI の実行を求め、`Waived:` の記録を Low では落とす。生成物だけの PR は、上の「再生成の PR」の条件を `Validate` が確かめるので、記録を求めない。判定は `Validate` と同じ G と同じ差分の取り方で行い、2 つの検査がずれないようにする。
3. **routine を登録する。** 1 日 1 回、`pnpm adr:regenerate-pr` を実行し、作った・更新した・閉じた・何もしなかった、のどれかと PR の URL を報告する。prompt はスクリプトの実行と報告だけを書き、ほかの変更をしないよう求める（ただし安全はこの文言ではなく `Validate` で守る）。
4. **`Validate` の検査を入れ替える**（`adr-validate.yml`）。
   - `adr regenerate --check` を外し、上の 2 種類だけを通す検査（`scripts/` の新しいスクリプト）に替える。
   - 生成器が失敗しないことを、`adr regenerate` を出力を捨てて実行して確かめる。生成器の版上げ（`package.json` / `pnpm-lock.yaml` だけの PR）でもこれが走るよう、`adr-validate.yml` の `paths` と `adr-validate-skip.yml` の `paths-ignore` に `package.json`・`pnpm-lock.yaml`・新しい検査のスクリプトを足す。
   - `main` への push では `--check` を実行しない（ADR のマージから再生成の PR が入るまで、`main` の生成物は古くて正しいため）。
   - pre-push の `adr-regenerate-check` も同じ検査に替える。base は手元の `origin/main` との merge-base で取る（PR の流れの手順 7 で fetch 済み）。`origin/main` が無ければ検査を飛ばすと表示し、CI に任せる。
5. **鮮度の見張り**（TPL-2786）。読み取りだけの scheduled workflow を 1 日 1 回、routine の予定時刻から数時間後に動かす。`main` の生成物に反映されていない変更のうち最も古いものが 26 時間より前に `main` に入っていたら失敗させる（routine が止まった、または再生成の PR の CI が落ち続けている）。ADR のマージから次の routine までの通常の遅れでは失敗しない。
6. **分類器を設定に揃える。** `scripts/review/tier.ts` の `ADR_GENERATED_GLOBS` が `adr.config.json` の `paths.outputs` と一致することをテストで固定する。生成物だけの PR が Low になること、ADR PR が生成物を含まなくなっても Low の判定が変わらないこと（ADR の追加・Design Doc の削除・リンクの張り替えと追加）を確かめる。
7. **ルールと記録を直す。** `.claude/rules/adr.md` の「編集後のチェック」（再生成してコミットする手順）と auto-merge の適用条件の生成物の項、`docs/process/review.md` の Low の行とローカルレビューの記録の節。
8. AT: `docs/acceptance/3416-regenerate-adr-index-daily-pr.md`。TC は:
   - 無関係な ADR を足す PR を 2 本同時に開き、片方をマージした後も、もう片方が `main` を取り込まずにマージできる。
   - `pnpm adr:regenerate-pr` を実行すると、生成物だけを変える PR が `risk: low` と auto-merge で作られ、Review tier と `Validate` が通ってマージされ、マージ後の `main` で `adr regenerate --check` が通る。
   - 差分が無い日に実行すると、PR を作らない（開いている再生成の PR があれば閉じる）。差分があり、auto-merge が有効な再生成の PR が開いていれば、auto-merge を外してから更新し、戻す。
   - `main` が進んだ後の再生成の PR でも、`Validate` は head で判定して通る。
   - `Validate` が落ちる PR: 生成物と ADR を両方変える、生成物を古い中身や手で書き換えた中身にする、`graph/` に余分なファイルを足す、生成物を消す、ADR を `graph/` の下へ rename する、生成器を壊す（`package.json` だけの版上げを含む）。
   - `paths.outputs` を変える PR は、古い出力の削除だけを含めて通り、その後の再生成の PR が新しい出力先を作って通る。
   - `@kompiro/adr-tools` の版上げで出力が変わると、次の再生成の PR で `main` の生成物が更新される。
   - 鮮度の見張りは、反映されていない変更が 26 時間を超えたときだけ失敗し、ADR のマージから routine までのあいだは失敗しない。
9. ADR 昇格: 実装完了後、`docs/adr/3416-regenerate-adr-index-daily-pr.md` として昇格し、本 Design Doc は同 PR で削除する。ADR-788 と ADR-2331 は `related_to` で結ぶ（変わるのは「生成物は ADR の PR が運ぶ」という前提で、両者の決定の中心ではない）。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（repo の運用だけ）。
- ADR を書く人の手順: `pnpm adr:regenerate` をコミットしなくなる。手元で確かめるために実行してよいが、生成物の差分はコミットせず捨てる（混ぜると `Validate` と pre-push が止める）。
- 出力先の変更: `paths.outputs` を変える PR は、古い出力の削除だけを含め、新しい出力先には書かない。新しい出力先は次の再生成の PR が作る。
- 開いている ADR PR: 切り替えの PR がマージされた後、生成物の差分を取り除くまで新しい検査で落ちる。切り替えは開いている ADR PR が少ないときに入れる。
- ドキュメント更新: `.claude/rules/adr.md`、`docs/process/review.md`。

## 未解決の問い / 決めないこと

- **TPL の索引（#3289）を同じスクリプトに載せるか。** 載せる前提で、生成器と出力先の組をスクリプトが一覧で持てる形にしておく。実際に載せるのは #3289 が入ってから決める。
- **routine の時刻。** ADR のマージが多い時間帯の後に置く。具体的な時刻は実装で決める。
- **routine 以外の起動。** ADR のマージ直後に再生成したい場面が増えたら、マージをきっかけに routine を起動する形を検討する。いまは 1 日 1 回と手動で足りると見る。
