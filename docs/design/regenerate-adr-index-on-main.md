# ADR の生成物を main でマージ後に再生成する

- **日付**: 2026-10-30
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3416](https://github.com/kompiro/karasu/issues/3416)
  - 関連 ADR: [ADR-788](../adr/788-adr-knowledge-graph.md)（frontmatter が正本、`effective.md` などは生成物で CI が drift を検出する）、[ADR-2331](../adr/2331-adr-automerge-scope.md)（ADR PR の auto-merge は差分の性質で判定し、生成物を許す差分に含める）、[ADR-1370](../adr/1370-release-flow-actions-driven.md)（リリースは GitHub App や PAT を足さず、`GITHUB_TOKEN` でブランチを push して人が PR を開く）、[ADR-3335](../adr/3335-refuse-commits-on-main.md)（手元で `main` にコミットしない）
  - 関連 Issue: [#3341](https://github.com/kompiro/karasu/issues/3341)（生成物の衝突を解く merge だけの push に CodeRabbit のレビューを使わない）、[#3289](https://github.com/kompiro/karasu/issues/3289)（TPL の索引を生成物にする）
  - 関連 TPL: [TPL-2658](../test-perspectives/TPL-2658-agent-write-scope-is-declared-not-prompted.md)（自動化の書き込み範囲は宣言で検証する）、[TPL-1480](../test-perspectives/TPL-1480-consistency-check-triggers-on-both-sides.md)（整合性のチェックは両側の変更で起動する）、[TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md)（結論を出せなかった安全網は失敗にする）、[TPL-3416](../test-perspectives/TPL-3416-bypass-credential-never-meets-third-party-code.md)（本 PR で起こす proactive TPL）
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

| 観点               | 現状                                                                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 生成物             | `effective.md`（484 行）、`graph.md`（1162 行）、`graph/<topic>.md`（topic ごと）。出力先は `adr.config.json` の `paths.outputs`                                                                                                                                                |
| 読み手             | `CLAUDE.md` が「有効な決定一覧」として `effective.md` を第一参照に挙げる（ADR-788）。GitHub のファイル表示で人も読む。docs-site は ADR を載せていない                                                                                                                           |
| PR 側の検査        | `adr-validate.yml`（required check `Validate`、paths は `docs/adr/**` など。それ以外の PR には `adr-validate-skip.yml` が no-op の `Validate` を返す）が `adr regenerate --check` を実行する。pre-push の `adr-regenerate-check`（glob `docs/adr/**`, `adr.config.json`）も同じ |
| main 側の検査      | 同じ `adr-validate.yml` が `main` への push でも `--check` を実行する                                                                                                                                                                                                           |
| 抜けている検査     | `@kompiro/adr-tools` の版を上げる PR（`package.json` / lockfile だけの差分）では `adr-validate.yml` が走らない。生成器の出力が変わっても、次の ADR PR まで気づかない（TPL-1480 の形）                                                                                           |
| main の保護        | ruleset `protect default branch` 1 本が、削除の禁止・non-fast-forward の禁止・作成の禁止・PR 必須（squash のみ）・required check（`Check`・`Validate`・`Reference docs`・`Playwright`）をまとめて持つ。bypass actor は 0 件                                                     |
| repo               | user 所有の public repo。merge queue は organization 所有の public repo と、Enterprise Cloud の organization の private repo にしか無い                                                                                                                                         |
| Actions の PR 作成 | repo 設定「Actions に PR の作成・承認を許可」は意図して OFF にしてある（#1370、ADR-1370）                                                                                                                                                                                       |
| 分類器             | `scripts/review/tier.ts` が生成物のパスを知っており、ADR PR の生成物の差分を Low に数える                                                                                                                                                                                       |

## 制約・前提

- `main` への直接 push は人もエージェントもしない（CLAUDE.md、ADR-3335）。自動化が `main` に書くなら、それは ruleset の例外として明示的に決める。
- `GITHUB_TOKEN` は ruleset の bypass actor にできない。user 所有の repo で bypass にできるのは repo の役割・deploy key・GitHub App で（team は organization だけ）、bypass はその ruleset の規則すべてに効く（パスで絞れない）。
- `GITHUB_TOKEN` による push や PR の作成は、他の workflow を起動しない（ADR-1370 が同じ制約を扱った）。したがって「bot が再生成の PR を開いて auto-merge する」形は、required check が走らずに止まる。
- `effective.md` は AI が文脈に入れる第一参照なので、clone した直後から最新であってほしい（ADR-788）。
- out of scope: 生成物の中身や形式（adr-tools 側）、ADR 以外の生成物（`gen:reference` の表など、PR 単位で衝突しないもの）。TPL の索引は #3289 が入ったら同じ仕組みに載せる（「未解決の問い」）。

## 検討した選択肢

### 案1: `main` への push ごとに再生成して commit する

PR は生成物をコミットしない。`main` に push があるたびに workflow が `adr regenerate` を実行し、差分があれば生成物だけの commit を `main` に push する。

ruleset の bypass には **deploy key** を使う。GitHub App より準備が少ない（鍵 1 組と secret 1 つ）。

bypass はその ruleset の規則すべてに効くので、鍵が漏れれば `main` に何でも書ける。そこで 3 つの柵で範囲を絞る。

- **ruleset を分ける。** 削除の禁止・non-fast-forward の禁止・作成の禁止を、bypass actor を持たない別の ruleset に移す。deploy key を bypass に足すのは PR 必須と required check の ruleset だけにする。鍵が漏れても、`main` の force-push や削除はできない。
- **鍵とサードパーティのコードを同じ job に置かない。**
  1. **生成 job**（鍵なし、`contents: read`）: checkout → `pnpm install --frozen-lockfile` → `adr regenerate` → 生成物のパスだけを artifact に上げる。
  2. **commit job**（鍵あり）: 許可するパスを、checkout した commit の `adr.config.json` から `paths.outputs` として読み、そのどれもが `adrDir` の内側にあることを確かめる（設定の変更で `.github/workflows/` などを指せないようにする。artifact からは読まない）。artifact を checkout の外（`$RUNNER_TEMP`）に、SHA で pin した `actions/download-artifact`（展開先から抜け出す穴 CVE-2024-42471 を直した 4.1.7 以降）で展開し、空でないこと、どのエントリも許可するパスの内側の通常ファイルであること（symlink・`..`・`.git/` を含まない）を確かめてから、作業ツリーに写す。出力先がディレクトリ（`graph/`）なら、artifact に無いファイルは消して鏡写しにする（topic を消したときの古い `graph/<topic>.md` を残さない）。commit と push は `git -c core.hooksPath=/dev/null` で行い、`git add` は許可するパスだけを名指しする。`pnpm` も `npx` もサードパーティの action も実行しない。
- **鍵を読める job を 1 つにする。** 鍵は environment `adr-regenerate` の secret に置き、deployment branch を `main` に制限する。`main` で動く job（`pull_request_target` や `workflow_dispatch` を含む）は environment を名指しすれば読めるので、名指ししてよいのは `main` への push と `schedule` だけで起動する commit job 1 つ、とテストで固定する。

artifact の検査を作業ツリーの外で行うのは、乗っ取られた生成 job が artifact API を直接呼んで `.git/hooks/*` や `.git/config` に落ちるエントリを作れるからである。`git status` で「変わったパス」を見る検査は `.git/` の中を見ないので、それでは防げない。この形なら、生成 job が乗っ取られても commit job が書けるのは生成物の中身だけに留まる。

**メリット**

- 無関係な ADR PR 同士は衝突しなくなる。Low の auto-merge が止まらない。
- 生成物は今までどおり repo にあり、GitHub でも clone 直後でも読める。`CLAUDE.md` も ADR-788 の読み方も変わらない。
- 生成器の版上げも `main` で反映される（今は抜けている TPL-1480 の穴が閉じる）。

**デメリット**

- ruleset に初めて bypass actor を足す。範囲は上の柵で絞るが、PR 必須と required check については全体の bypass である。
- マージから再生成の commit までの 1〜2 分、`main` の生成物が古い。
- ADR をマージするたびに `main` の commit が 1 つ増える（月 40 程度）。deploy key の push は他の workflow を起動するので、何もしなければ、生成物だけの commit でも `main` への push で動く workflow（paths の無い `ci.yml`・`deploy.yml`・`secret-scan.yml`、paths に掛かる `pages.yml`・`adr-validate.yml`）が月 40 回ずつ余分に走る。`ci.yml`・`deploy.yml` には `paths-ignore`、`pages.yml`・`adr-validate.yml` には paths の否定（`!docs/adr/effective.md` など）で生成物を外して止める。`secret-scan.yml` は安いので、鍵で入る commit も検査するよう残す。commit メッセージの `[skip ci]` は使わない。この repo の squash の本文は PR の commit メッセージを並べる設定（`COMMIT_MESSAGES`）なので、その印を書いた commit を含む PR がマージされると、`main` への push の workflow がすべて止まってしまう。
- bypass actor の push が required status checks に止められないことを、実際に確かめる必要がある。旧来の branch protection では、PR 必須を bypass できる actor の直接 push も required status checks で止められた（[community discussion #43460](https://github.com/orgs/community/discussions/43460)）。ruleset では bypass actor がその ruleset の規則すべてを越えるはずだが、まだ確かめていない。

### 案2: 手元の merge driver で衝突を自動で解く

生成物は今までどおり PR に入れる。`.gitattributes` で生成物に独自の merge driver を割り当て（衝突したら自分の側を採る）、merge の後のフックで `adr regenerate` し直す。

**メリット**

- サーバー側も ruleset も変えない。
- karasu の流れは手元の `git merge origin/main` で main を取り込むので、そこでは衝突が自動で消える。

**デメリット**

- 衝突そのものは無くならない。GitHub が衝突を報告した Low の PR は、誰かが手元で取り込むまで止まったまま。
- merge driver の設定は `.git/config` に入り commit できないので、clone ごとに登録する仕組みが要る。GitHub の「Update branch」ボタンでは効かない。
- 衝突が他のファイルにもあると merge が止まり、post-merge フックが走らない。

### 案3: 生成物を repo から外す

生成物を `.gitignore` に入れ、`pnpm install` と checkout・merge のフックで手元に生成する。人向けには docs-site に載せる。

**メリット**

- 衝突も鍵も無い。`main` の commit も増えない。

**デメリット**

- GitHub のファイル表示から消える。docs-site に ADR を載せる仕事が新しく要る。
- 手元の生成物はフックを通らなかった clone で古くなる。クラウドのエージェントや install していない clone では `CLAUDE.md` の第一参照が無い。ADR-788 が決めた読み方が崩れる。

### 却下: merge queue

衝突を解く順番をサーバーに任せられるが、user 所有の repo では使えない。

### 却下: bot が再生成の PR を開いて auto-merge する

bypass は不要になるが、2 つの理由で採らない。

- repo 設定「Actions に PR の作成・承認を許可」を OFF にしてある（#1370、ADR-1370）。この案はそれを ON に戻すことになる。
- ON に戻しても、`GITHUB_TOKEN` が作った PR では required check が走らない。`GITHUB_TOKEN` で `workflow_dispatch` を起動して check を走らせる手はあるが、required check を出す 4 つの workflow すべてに dispatch の入口と、PR の head に結果を付ける仕組みを足すことになる。GitHub App の token を使えば普通に走るが、そのときは App という鍵を足すことになり、案1 より手数が多い。

## 比較

| 観点                     | 案1 main で再生成                                 | 案2 merge driver                           | 案3 repo から外す                                     |
| ------------------------ | ------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------- |
| 無関係な PR 同士の衝突   | 無くなる                                          | 残る（手元では自動で解ける）               | 無くなる                                              |
| Low の auto-merge の停止 | 無くなる                                          | 残る                                       | 無くなる                                              |
| 生成物の読みやすさ       | 今と同じ                                          | 今と同じ                                   | GitHub から消える、手元は古くなりうる                 |
| 新しい鍵・例外           | deploy key と ruleset の bypass                   | なし                                       | なし                                                  |
| `main` の一時的な古さ    | 1〜2 分                                           | なし                                       | 該当しない                                            |
| 生成器の版上げの反映     | `main` で自動                                     | 次の ADR PR まで抜ける                     | 手元で自動                                            |
| 変える場所               | workflow 1 本、ruleset、PR 側の検査、ルールの文言 | `.gitattributes`、フック、clone ごとの登録 | `.gitignore`、フック、docs-site、`CLAUDE.md`、ADR-788 |

## 現時点の方針

**案1 を採用する。** 衝突と auto-merge の停止を両方無くせるのは案1 と案3 で、そのうち `effective.md` を「clone した直後から最新の第一参照」として保てるのは案1 だけである（ADR-788）。案1 の代償は bypass の鍵だが、force-push と削除は bypass の無い ruleset に残し、鍵を持つ job でサードパーティのコードを動かさず、書けるパスを作業ツリーの外で機械的に検査することで、生成 job が乗っ取られたときの被害を生成物の中身に閉じ込められる。ADR-1370 が鍵を足さなかったのは、リリースが人の判断を挟むべき操作だからで、ここで自動化するのは生成器の出力という、判断の無い決定的な操作である。

### 実装の指針

1. **spike で bypass を確かめる。** 使い捨てのブランチと、それだけを対象にした ruleset（PR 必須と required check、bypass に deploy key、`bypass_mode: always`）を作り、deploy key でそのブランチに直接 push できることを確かめる（`spike/3416-deploy-key-bypass`）。push が止められるなら案1 は成立しないので、ここで Design Doc に戻る。確かめたら、spike の ruleset・deploy key・ブランチを消す。
2. **workflow `adr-regenerate.yml` を足す。** 起動は `main` への push（生成物だけの push は `paths-ignore` で外す。それ以外は paths で絞らず、生成器の版上げや `adr.config.json` の変更も拾う。TPL-1480）と、1 日 1 回の `schedule`。`concurrency: adr-regenerate`、`cancel-in-progress: true`（新しい run が新しい `main` から生成し直すので、古い run は捨ててよい）。
   - 生成 job と commit job を分ける（案1 の柵）。
   - 再生成の commit は生成物だけなので `paths-ignore` に掛かり、この workflow を起動しない（再生成は繰り返さない）。
   - push は force しない。non-fast-forward で拒否されたら、`origin/main` が生成 job の見た commit の子孫であることを確かめて成功で終える（新しい `main` を作った push が自分の run を起こす）。それ以外の失敗と、生成の失敗は job を失敗させる（TPL-2786）。
   - push の run が何かの理由で起きなかったとき（PR の commit メッセージにあった `[skip ci]` が squash の本文に入った場合など）は、`schedule` の run が取り戻す。`schedule` は default ブランチの workflow だけを動かすので、鍵を読める起動に足してよい。
   - 既存の policy テスト（`workflow-timeout-policy.test.ts`・`workflow-runner-policy.test.ts`・`workflow-draft-gate.test.ts`）を通す。
3. **ruleset と鍵。**
   - 削除の禁止・non-fast-forward の禁止・作成の禁止を、bypass actor を持たない新しい ruleset に移す。
   - deploy key（write）を足し、PR 必須と required check の ruleset の bypass actor に `bypass_mode: always` で足す。
   - 秘密鍵は environment `adr-regenerate`（deployment branch を `main` だけに制限）の secret にする。
4. **PR 側の検査を入れ替える。**
   - `adr-validate.yml` の `adr regenerate --check` を外し、代わりに「PR が生成物のパスを変えていない」検査を置く。比べるのは merge-base との差分（`base...head`）で、PR が持つ `adr.config.json` の `paths.outputs` を見る。現在の `main` との差分で比べると、古いブランチが再生成の commit を戻すように見えて落ちる。手元で再生成した生成物をうっかりコミットすると衝突が戻るので、検査で止める。
   - PR では `adr regenerate` を出力を捨てて実行し、生成が失敗しないことだけを確かめる。外すと、生成器を壊す PR がマージの後にしか分からない。
   - `main` への push では `--check` を実行しない（再生成の commit が来るまで赤くなるため）。`main` の生成物が最新であることは、`adr-regenerate.yml` の成功で示す。
   - pre-push の `adr-regenerate-check` を同じ「生成物を変えていない」検査に替える。
5. **自動化の書き込み範囲をテストで固定する**（TPL-2658、TPL-3416）。`scripts/ci/` に新しいテストを足し（`agentic-workflow-safety.test.ts` と同じ形）、次を確かめる。
   - environment `adr-regenerate` を名指しする job が全 workflow で 1 つだけで、その workflow の起動が `push: branches: [main]` と `schedule` だけであること。
   - その job が `pnpm` も `npx` も実行せず、SHA で pin した `actions/checkout`・`actions/download-artifact`（4.1.7 以降）・`actions/setup-node`（検査のスクリプトを動かす Node のため）以外の action を使わないこと。
   - その job が artifact を checkout の外に展開し、git を `core.hooksPath=/dev/null` で実行すること。
   - 許可するパスの一覧が checkout した commit の `paths.outputs` から導かれ、`adrDir` の外を指す設定なら job が失敗すること。
   - 生成物を外す `paths-ignore` と paths の否定が、`paths.outputs` と一致していること。
6. **ルールと記録を直す。** `.claude/rules/adr.md` の「編集後のチェック」（再生成してコミットする手順）と auto-merge の適用条件の生成物の項、`scripts/review/tier.ts` の生成物のパス（PR に現れなくなるので、許す差分から外して衝突の再発を Medium で知らせる）、`docs/process/review.md` の Low の行。
7. AT: `docs/acceptance/3416-regenerate-adr-index-on-main.md`。TC は:
   - 無関係な ADR を足す PR を 2 本同時に開き、片方をマージした後も、もう片方が `main` を取り込まずにマージできる。
   - マージ後、`main` の生成物が `pnpm adr:regenerate` の出力と一致する（`adr regenerate --check` が通る）。
   - 続けて 2 本マージしても、`main` の生成物は最後の状態に収束する。最後の run が成功し、それより前の run は cancelled か成功で終わる。
   - 再生成の commit では `adr-regenerate.yml`・`ci.yml`・`deploy.yml`・`pages.yml`・`adr-validate.yml` が起動しない。
   - 再生成の commit で起動するのは `secret-scan.yml` だけである。
   - PR が生成物を変えると `Validate` が落ちる。生成器を壊す PR も `Validate` が落ちる。
   - `@kompiro/adr-tools` の版上げで出力が変わると、マージ後に `main` の生成物が更新される。
   - commit job の検査は、`paths.outputs` の外のパス・symlink・`.git/` を含む artifact と空の artifact を拒否して失敗し、`adrDir` の外を指す `paths.outputs` も拒否する（検査のスクリプトを細工した入力で単体テストする）。
   - topic を消すと、`main` の `graph/<topic>.md` も消える。
8. ADR 昇格: 実装完了後、`docs/adr/3416-regenerate-adr-index-on-main.md` として昇格し、本 Design Doc は同 PR で削除する。ADR-788 と ADR-2331 は `related_to` で結ぶ（覆すのは「生成物は PR が運ぶ」という前提で、両者の決定の中心ではない）。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（repo の運用だけ）。
- ADR を書く人の手順: `pnpm adr:regenerate` をコミットしなくなる。手元で確かめるために実行してよいが、生成物の差分はコミットせず捨てる。
- 出力先の変更: `paths.outputs` を変える PR は、古い出力の削除を自分で含める。commit job は新しい出力先にしか書けず、PR 側の検査は PR が持つ `paths.outputs` だけを見るので、古いパスの削除は通る。
- `adr-validate.yml` のコメント「`main` は squash だけなので 1 push は 1 PR」は、鍵の push が加わるので正しくなくなる。再生成の commit は topics を変えず、この workflow も起動しないので、`HEAD^1` との差分を見る処理はそのまま成り立つ。コメントだけ直す。
- 開いている ADR PR: 切り替えの PR がマージされた後、生成物の差分を取り除くまで新しい検査で落ちる。切り替えは開いている ADR PR が少ないときに入れる。
- ドキュメント更新: `.claude/rules/adr.md`、`docs/process/review.md`、ruleset の変更を ADR に記録する。

## 未解決の問い / 決めないこと

- **TPL の索引（#3289）を同じ workflow に載せるか。** 載せる前提で、許可するパスの一覧を生成器ごとに持てる形にしておく。実際に載せるのは #3289 が入ってから決める。
- **deploy key か GitHub App か。** 本 Design Doc は deploy key を推す（準備が少ない）。spike で deploy key が required status checks に止められ、App なら通る場合は App に替える。
- **鍵の更新周期。** deploy key には期限が無い。定期的に作り直すかは決めない（漏れたと分かれば鍵を消し、ruleset から外せば止まる）。
- **鍵が漏れたときに残る被害。** force-push と削除は防げるが、PR を通らない commit を `main` に足すことはできる。それは commit の履歴に残り、revert で戻せる。これ以上絞る手段（鍵ごとにパスを制限する仕組み）は本 Design Doc では探さない。
