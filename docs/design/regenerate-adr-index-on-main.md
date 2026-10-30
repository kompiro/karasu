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

| 観点           | 現状                                                                                                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 生成物         | `effective.md`（484 行）、`graph.md`（1162 行）、`graph/<topic>.md`（topic ごと）。出力先は `adr.config.json` の `paths.outputs`                                                                                                                                                |
| 読み手         | `CLAUDE.md` が「有効な決定一覧」として `effective.md` を第一参照に挙げる（ADR-788）。GitHub のファイル表示で人も読む。docs-site は ADR を載せていない                                                                                                                           |
| PR 側の検査    | `adr-validate.yml`（required check `Validate`、paths は `docs/adr/**` など。それ以外の PR には `adr-validate-skip.yml` が no-op の `Validate` を返す）が `adr regenerate --check` を実行する。pre-push の `adr-regenerate-check`（glob `docs/adr/**`, `adr.config.json`）も同じ |
| main 側の検査  | 同じ `adr-validate.yml` が `main` への push でも `--check` を実行する                                                                                                                                                                                                           |
| 抜けている検査 | `@kompiro/adr-tools` の版を上げる PR（`package.json` / lockfile だけの差分）では `adr-validate.yml` が走らない。生成器の出力が変わっても、次の ADR PR まで気づかない（TPL-1480 の形）                                                                                           |
| main の保護    | ruleset `protect default branch`。PR 必須（squash のみ）、required check は `Check`・`Validate`・`Reference docs`・`Playwright`、bypass actor は 0 件                                                                                                                           |
| repo           | user 所有の public repo。merge queue は organization 所有の repo（と Enterprise Cloud）にしか無い                                                                                                                                                                               |
| 分類器         | `scripts/review/tier.ts` が生成物のパスを知っており、ADR PR の生成物の差分を Low に数える                                                                                                                                                                                       |

## 制約・前提

- `main` への直接 push は人もエージェントもしない（CLAUDE.md、ADR-3335）。自動化が `main` に書くなら、それは ruleset の例外として明示的に決める。
- `GITHUB_TOKEN` は ruleset の bypass actor にできない。bypass にできるのは repo の役割・team・deploy key・GitHub App で、bypass は ruleset 全体に効く（パスで絞れない）。
- `GITHUB_TOKEN` による push や PR の作成は、他の workflow を起動しない（ADR-1370 が同じ制約を扱った）。したがって「bot が再生成の PR を開いて auto-merge する」形は、required check が走らずに止まる。
- `effective.md` は AI が文脈に入れる第一参照なので、clone した直後から最新であってほしい（ADR-788）。
- out of scope: 生成物の中身や形式（adr-tools 側）、ADR 以外の生成物（`gen:reference` の表など、PR 単位で衝突しないもの）。TPL の索引は #3289 が入ったら同じ仕組みに載せる（「未解決の問い」）。

## 検討した選択肢

### 案1: `main` への push ごとに再生成して commit する

PR は生成物をコミットしない。`main` に push があるたびに workflow が `adr regenerate` を実行し、差分があれば生成物だけの commit を `main` に push する。

ruleset の bypass には **deploy key** を使う。GitHub App より準備が少なく（鍵 1 組と secret 1 つ）、deploy key の push は他の workflow を起動する（`GITHUB_TOKEN` だけが起動しない）。

bypass は ruleset 全体に効くので、鍵が漏れれば `main` に何でも書ける。そこで鍵とサードパーティのコードを同じ job に置かない。

1. **生成 job**（鍵なし、`contents: read`）: checkout → `pnpm install --frozen-lockfile` → `adr regenerate` → 生成物のパスだけを artifact に上げる。
2. **commit job**（鍵あり）: `actions/checkout` を deploy key で実行し、artifact を展開し、変わったパスが生成物のパスの内側だけであることを確かめてから commit して push する。`pnpm` も `npx` もサードパーティの action も実行しない。鍵は `main` だけが使える environment の secret に置き、PR や他のブランチの job からは読めないようにする。

生成 job が乗っ取られても、commit job が書くのは生成物のパスだけなので、最悪の結果は生成物の中身が壊れることに留まる。

**メリット**

- 無関係な ADR PR 同士は衝突しなくなる。Low の auto-merge が止まらない。
- 生成物は今までどおり repo にあり、GitHub でも clone 直後でも読める。`CLAUDE.md` も ADR-788 の読み方も変わらない。
- 生成器の版上げも `main` で反映される（今は抜けている TPL-1480 の穴が閉じる）。

**デメリット**

- ruleset に初めて bypass actor を足す。範囲は仕組み（job の分離・パスの検査・environment）で絞るが、ruleset 上は全体の bypass である。
- マージから再生成の commit までの 1〜2 分、`main` の生成物が古い。
- ADR をマージするたびに `main` の commit が 1 つ増える（月 40 程度）。
- bypass actor の push が required status checks に止められるかを、実際に確かめる必要がある（コミュニティの報告では止められた例がある）。

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

bypass は不要になるが、`GITHUB_TOKEN` が作った PR では required check が走らず、マージできない。GitHub App の token を使えば走るが、そのときは App という鍵を足すことになり、案1 より手数が多い。

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

**案1 を採用する。** 衝突と auto-merge の停止を両方無くせるのは案1 と案3 で、そのうち `effective.md` を「clone した直後から最新の第一参照」として保てるのは案1 だけである（ADR-788）。案1 の代償は bypass の鍵だが、鍵を持つ job でサードパーティのコードを動かさず、書けるパスを機械で検査することで、漏れたときの被害を生成物の中身に閉じ込められる。ADR-1370 が鍵を足さなかったのは、リリースが人の判断を挟むべき操作だからで、ここで自動化するのは生成器の出力という、判断の無い決定的な操作である。

### 実装の指針

1. **spike で bypass を確かめる。** deploy key を ruleset の bypass に足し、required status checks がある `main` に deploy key で push できることを、使い捨てのブランチ用 ruleset で確かめる（`spike/3416-deploy-key-bypass`）。push が止められるなら案1 は成立しないので、ここで Design Doc に戻る。
2. **workflow `adr-regenerate.yml` を足す。** 起動は `main` への push すべて（paths で絞らない。生成器の版上げや `adr.config.json` の変更も拾う。TPL-1480）。`concurrency: adr-regenerate`、`cancel-in-progress: true`（新しい run が新しい `main` から生成し直すので、古い run は捨ててよい）。
   - 生成 job と commit job を分ける（案1 の 1・2）。
   - commit job は push の前に `origin/main` が生成 job の見た commit から動いていないか確かめ、動いていれば何もせず終える（後続の run が引き継ぐ）。
   - 生成物の commit がまた push を起こすが、2 回目の run は差分が無いので何もしない。
   - 生成や push が失敗したら job を失敗させる（TPL-2786）。
3. **鍵の置き場所。** deploy key（write）を足し、その秘密鍵を environment `adr-regenerate`（deployment branch を `main` だけに制限）の secret にする。ruleset の bypass actor にその deploy key を足す。
4. **PR 側の検査を入れ替える。**
   - `adr-validate.yml` の `adr regenerate --check` を外し、代わりに「PR が生成物のパスを変えていない」検査を置く。手元で再生成した生成物をうっかりコミットすると衝突が戻るので、検査で止める。
   - `main` への push では `--check` を実行しない（再生成の commit が来るまで赤くなるため）。`main` の生成物が最新であることは、`adr-regenerate.yml` の成功で示す。
   - pre-push の `adr-regenerate-check` を同じ「生成物を変えていない」検査に替える。
5. **自動化の書き込み範囲をテストで固定する**（TPL-2658、TPL-3416）。`scripts/ci/` に新しいテストを足し（`agentic-workflow-safety.test.ts` と同じ形）、commit job が deploy key を使う唯一の job であること、その job が `pnpm` も `npx` も実行せず、`actions/checkout` と `actions/download-artifact` 以外の action を使わないこと、許可するパスの一覧が `adr.config.json` の `paths.outputs` と一致することを確かめる。
6. **ルールと記録を直す。** `.claude/rules/adr.md` の「編集後のチェック」（再生成してコミットする手順）と auto-merge の適用条件の生成物の項、`scripts/review/tier.ts` の生成物のパス（PR に現れなくなるので、許す差分から外して衝突の再発を Medium で知らせる）、`docs/process/review.md` の Low の行。
7. AT: `docs/acceptance/3416-regenerate-adr-index-on-main.md`。TC は:
   - 無関係な ADR を足す PR を 2 本同時に開き、片方をマージした後も、もう片方が `main` を取り込まずにマージできる。
   - マージ後、`main` の生成物が `pnpm adr:regenerate` の出力と一致する（`adr regenerate --check` が通る）。
   - PR が生成物を変えると `Validate` が落ちる。
   - `@kompiro/adr-tools` の版上げで出力が変わると、マージ後に `main` の生成物が更新される。
8. ADR 昇格: 実装完了後、`docs/adr/3416-regenerate-adr-index-on-main.md` として昇格し、本 Design Doc は同 PR で削除する。ADR-788 と ADR-2331 は `related_to` で結ぶ（覆すのは「生成物は PR が運ぶ」という前提で、両者の決定の中心ではない）。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（repo の運用だけ）。
- ADR を書く人の手順: `pnpm adr:regenerate` をコミットしなくなる。手元で確かめるために実行してよいが、生成物の差分はコミットせず捨てる。
- 開いている ADR PR: 切り替えの PR がマージされた後、生成物の差分を取り除くまで新しい検査で落ちる。切り替えは開いている ADR PR が少ないときに入れる。
- ドキュメント更新: `.claude/rules/adr.md`、`docs/process/review.md`、ruleset の変更を ADR に記録する。

## 未解決の問い / 決めないこと

- **TPL の索引（#3289）を同じ workflow に載せるか。** 載せる前提で、許可するパスの一覧を生成器ごとに持てる形にしておく。実際に載せるのは #3289 が入ってから決める。
- **deploy key か GitHub App か。** 本 Design Doc は deploy key を推す（準備が少ない）。spike で deploy key が required status checks に止められ、App なら通る場合は App に替える。
- **鍵の更新周期。** deploy key には期限が無い。定期的に作り直すかは決めない（漏れたと分かれば鍵を消し、ruleset から外せば止まる）。
