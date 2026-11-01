# TPL の索引を毎日の再生成 PR で生成する

- **日付**: 2026-11-02
- **ステータス**: 検討中
- **関連**:
  - Issue [#3289](https://github.com/kompiro/karasu/issues/3289)（README の手書き一覧表の衝突）
  - [ADR-3416](../adr/3416-regenerate-adr-index-daily-pr.md)（ADR の生成物は PR に含めず、毎日の再生成 PR でだけ更新する）
  - [ADR-788](../adr/788-adr-knowledge-graph.md)（生成物を repo に置いたまま読む）、[ADR-1192](../adr/1192-test-perspective-library.md)（TPL の運用）、[ADR-2810](../adr/2810-tpl-source-path-check-ownership.md)（`tpl:validate` を Required な `Check` から走らせる）
  - tpl-tools の ADR-27（`tpl regenerate` と `indexFile`）、ADR-31（チェックリストの印と状態）。`@kompiro/tpl-tools@0.0.12` で公開済み
  - #3038 の設計 `docs/design/tpl-enforcement-status.md`（D2）とスライス 3（[#3488](https://github.com/kompiro/karasu/issues/3488)）: 索引に TPL ごとの状態を出す

## 背景・課題

`docs/test-perspectives/README.md` の末尾の一覧表は手書きで、TPL を足す PR はそこに 1 行ずつ追記する。
TPL の id は Issue 番号で単調に増えるので、新しい行はいつも表の末尾に入り、同時に開いた 2 本の PR は
同じ位置への挿入として衝突する（#3289 の測定では、2026-09-19〜10-19 に README を触った 28 commit のうち
23 が 1 行の追記だった）。

#3289 は、tpl-tools の `tpl regenerate` で topic ごとに分けた索引 `index.md` を生成し、各 PR がそれを
コミットして CI の `tpl regenerate --check` で鮮度を検査する、と提案していた。topic で分けると衝突は
「同じ topic に足す PR 同士」に減るが、Issue 自身の見積もりで並行する組の約 30% は衝突し続ける。

この形は、ADR の生成物が 2026-11-01 まで採っていたものと同じである。ADR-3416 は、生成物を PR が運ぶ
こと自体が無関係な PR 同士の衝突を生み、衝突した Low の PR が auto-merge で止まる、という理由でこの形を
やめ、生成物は毎日の routine が出す再生成 PR でだけ更新することにした。TPL の PR も段階は Low
（`docs/test-perspectives/**`）で、同じ止まり方をする。

## 制約・前提

- **ADR-3416 の仕組みがそのまま前提になる。** `pnpm adr:regenerate-pr` が `main` から生成し直した
  生成物だけを変える PR を `chore/adr-regenerate` に作り、required check の `Validate`
  （`scripts/adr/check-generated.ts`）が差分を「生成物に触れない PR」か「ちょうど再生成である PR」に
  分け、それ以外を落とす。マージの可否は routine ではなくこの check が保証する（TPL-3286、TPL-2658）
- **`tpl validate` は、`indexFile` を設定すると索引の検査をまとめて行う**（tpl-tools の
  `validateAll`）。ファイルが無ければ `index-missing`、TPL が載っていなければ `readme-missing-row`、
  リンク先が無ければ `readme-row-points-to-missing-file`。CLI にも config にもこれを止める手段は無い。
  索引が 1 日遅れる運用では、TPL を足す・改名する PR と、最初の索引ができるまでの全 PR がこの検査に落ちる
- **生成物のパスの集合 G の模型は根が 1 つで、依存を持てない。** `scripts/adr/generated.ts` の
  `AdrPaths` は `{ adrDir, outputs }` で、出力はすべて `adrDir` に繋げる。`regenerate-at.ts` も
  `adrDir` だけを `git archive` し、`ls-tree` し、入力の同一性（`inputKey`）を取る。`generated.ts` は
  `scripts/review/tier.ts` から import され、`review-tier.yml` は base の `tier.ts` を install なしの
  `node` で動かすので、tpl-tools の関数は使えず、config は素の JSON として読むしかない
- **`tpl regenerate` は `adr regenerate` と動き方が違う。** `--out-dir` が無く、作業ディレクトリの
  `<TPL ディレクトリ>/<indexFile>` に書く。`indexFile` が無ければ exit 2 になる。TPL ディレクトリは
  `tpl.config.json` に無く、CLI の既定値（`docs/test-perspectives`）でしか決まらない
- `Validate` の workflow（`adr-validate.yml`）は path filter で起動し、対になる
  `adr-validate-skip.yml` の `paths-ignore` と一致させる必要がある（TPL-1480）

## 検討した選択肢

### D1: 索引を誰が書くか

#### 案 1-A: 各 PR が `index.md` をコミットし、CI の `--check` で鮮度を見る（#3289 の提案）

- 実装は小さい（版上げ・config・README の表の削除・CI に 1 行）
- 同じ topic に足す並行 PR は衝突し続け、衝突した Low の PR は誰かが生成し直して push するまで止まる
- ADR-3416 が却下した形を TPL にだけ残すことになる

#### 案 1-B: PR は `index.md` に触れず、毎日の再生成 PR が書く（採用）

- 索引で衝突する PR が無くなる。再生成 PR も索引しか触らない
- `index.md` は repo に置いたままなので、GitHub でも clone 直後でも読める（ADR-788 と同じ読み方）
- 代償は ADR と同じで、`main` の索引は最大 1 日（待ちきれない日を挟むと 2 日）遅れる。その日に足した
  TPL はファイルを直接読めば分かる

**#3038 の D2 が持っていた性質を 1 つ手放す。** `tpl-enforcement-status.md` の D2 は、索引を PR が
運び CI の `--check` が鮮度を見ることで「状態の変化が PR の diff に見え、しかも drift しない」とした。
1-B では状態の変化は PR の diff に索引として現れない。それでよいと判断する理由は 2 つある。状態を
決めるのは項目の印で、印の変更は TPL のファイルの diff としてその PR に見える。そして drift しない保証は、
再生成 PR が「ちょうど生成器の出力であること」を `Validate` で比べることに移るだけで、失われない。
`tpl-enforcement-status.md` の該当箇所はこの PR で書き直し、#3488 の本文も合わせて直す。

### D2: 再生成 PR を ADR と分けるか

#### 案 2-A: ADR の再生成 PR に TPL の索引も載せる（採用）

G を「生成器ごとの根と出力の組」の集まりに広げる。ADR は `adr.config.json` の `paths.adrDir` と
`paths.outputs`、TPL は karasu 側の定数 `docs/test-perspectives` と `tpl.config.json` の `indexFile`
から作る。どちらも素の JSON として読み、`indexFile` が無ければ TPL の組は空にする。差分の分類（ふつうの
PR / 再生成の PR / 混在）の規則は変えず、判定の対象を G の和集合にする。

- routine は 1 日 1 回、PR も 1 本のまま。待つ check も同じ
- G を読む側は、分類だけするもの（`generated.ts`、`tier.ts` の `regenerationWaivesRecord`）と、
  生成器を動かすもの（`regenerate-at.ts`、`regenerate-pr.ts`、`check-freshness.ts`）に分かれる。前者は
  `tpl.config.json` も merge base と head で読むようにするだけで、生成器は動かさない
- ブランチ名 `chore/adr-regenerate` と本文の印 `<!-- adr-regenerate -->` は変えない。再生成 PR を
  見分ける 4 つの印（ADR-3416）・`review-request.yml`・routine の設定がこの名前を持っており、
  名前を変える利益より、それらを同時に書き換える危険のほうが大きい。PR のタイトルと本文の出力の一覧は
  ADR と TPL の両方を挙げる形に変える

#### 案 2-B: TPL 専用の再生成 PR を別に作る

- ブランチ・印・routine の起動・鮮度の見張りが二重になる。約 1250 行の ADR 用スクリプトを
  パラメータ化するか複製するかが必要で、どちらにしても 2 本の PR が同じ required check を待つ
- 利点は ADR の生成と TPL の生成が互いの失敗に巻き込まれないことだが、どちらかの生成器が壊れるのは
  その生成器の版を上げる PR で、それは `Validate` がその PR で落とす

### D3: `tpl validate` に索引を見させない

1-B では索引が遅れる、あるいは最初はまだ無いのが正常なので、`validate` は索引を一切見てはいけない。

**索引が正しいことは別の経路で保証される。** 再生成 PR の `Validate` は、head の入力から生成し直した
索引と、PR が持つ索引がちょうど一致することを比べる。生成器（tpl-tools の `renderIndex`）はその commit に
実在する TPL のファイルだけを並べてリンクを書くので、一致した索引のリンクはその commit で必ず解決する。
TPL を消す・改名する PR が入った直後の `main` では、翌日の再生成 PR までリンクが切れた行が残りうる。
これは ADR の索引と同じ遅れで、鮮度の見張り（D4）が 50 時間を超えた遅れを落とす。

#### 案 3-A: tpl-tools に、索引の検査をまとめて止める config のキーを足す（採用）

`indexFile` を設定したまま、`validate` の索引の検査（`index-missing`・`index-unreadable`・行の欠け・
リンク切れの全部）を止める opt-in のキーを足す。`regenerate` と、索引への状態の表示はそのまま使える。

- 移行の PR は `indexFile` を設定するが `index.md` を書かない（下の「影響範囲・マイグレーション」）。
  キーが `index-missing` を止めなければ、その PR から最初の再生成 PR がマージされるまで、すべての PR の
  `tpl:validate` が落ちる。tpl-tools 側の受け入れ条件に「`indexFile` が指すファイルが無くても通る」を入れる
- 索引の検査を持つのは tpl-tools なので、止め方も tpl-tools に置き、karasu は設定するだけにする。
  ADR-2810 で TPL ディレクトリの検査を tpl-tools に移した線と同じ
- キー名は tpl-tools 側の設計で決める（候補: `"indexCheck": false`）

#### 案 3-B: `validate` 用と `regenerate` 用に config を分ける

`validate` には `indexFile` の無い config を渡す。だが `indexFile` が無いと `validate` は
`README.md` の一覧表を検査するので、表を消した README で全 TPL が「行が無い」と落ちる。

#### 案 3-C: karasu 側に、tpl-tools のライブラリを呼ぶ検査を書く

tpl-tools は `validateAll` を公開しており、`readmePath` と `indexPath` を渡さなければ索引の検査を
飛ばせる。tpl-tools の release を待たずに済むが、`pnpm tpl:validate` を tpl-tools の CLI から karasu の
スクリプトに置き換えることになる。`--source-prefix` などの CLI の引数の解釈を karasu が持ち直すことになり、
`scripts/lint/tpl-validate-owns-tpl-dir.test.ts` が固定している「TPL ディレクトリの検査は tpl-tools の
CLI が持つ」（ADR-2810）を崩す。3-A の release は小さいので、待つほうを選ぶ。

### D4: 生成器を 2 つ動かす

`regenerate-at.ts`（`Validate` と鮮度の見張りが使う）、`regenerate-pr.ts`（routine の worktree）、
`check-freshness.ts` に、TPL の生成器を足すときの規則を決めておく。

- **`indexFile` の無い commit では TPL の生成器を動かさない。** 鮮度の見張りは 50 時間の窓の
  first-parent commit をそれぞれの config で生成し直すので、移行の前の commit が窓に残る。そこでも
  `tpl regenerate` を呼べば exit 2 で全候補が落ちる
- **出力先は抽出した木の中にする。** `tpl regenerate` は作業ディレクトリに書くので、`git archive` で
  展開した一時ディレクトリを作業ディレクトリにして実行し、書かれた `index.md` を読み戻す
- **入力の同一性（`inputKey`）に TPL の入力を含める。** `docs/test-perspectives/TPL-*.md` と
  `tpl.config.json` が違う commit を同じ入力とみなすと、TPL だけが変わった commit が生成し直されない
- **生成器の版が窓の中で変わったときの見送りを、tpl-tools にも広げる。** 今は lockfile の
  `@kompiro/adr-tools` だけを見ている。移行の PR 自体が tpl-tools を上げるので、広げなければ移行の直後に
  書式の違いだけで見張りが落ちる
- **生成器が G の外に書いたら失敗にする**（`regenerate-pr.ts` の既存の検査）。G に TPL の索引を含めれば、
  `index.md` はこの検査を通る

### D5: 生成物の検査をどこで回すか

再生成 PR は ADR の生成物と TPL の索引の両方を触るので、分類の規則は 1 か所で持つ。今の `Validate`
（`adr-validate.yml` の `check-generated.ts`）に TPL の索引を含める。

- `adr-validate.yml` の `paths` に `docs/test-perspectives/**` を足し（`tpl.config.json`・
  `package.json`・`pnpm-lock.yaml` は既にある）、`adr-validate-skip.yml` の `paths-ignore` にも同じ行を
  足す（TPL-1480）
- pre-push の `adr-generated-check`（`lefthook.yml`）の glob に `docs/test-perspectives/**` と
  `tpl.config.json` を足す
- TPL を足すだけの PR でも `Validate` が走るようになる。job は install とスクリプトのテストを含めて
  1 回 45 秒ほどかかる

## 比較

| 論点 | 採用 | 主な却下案 | 決め手 |
| --- | --- | --- | --- |
| 索引を誰が書くか | 毎日の再生成 PR（1-B） | 各 PR がコミットして `--check`（1-A） | 並行 PR の衝突が無くなる。ADR-3416 と同じ形にそろう |
| 再生成 PR | ADR と同じ 1 本（2-A） | TPL 専用の PR（2-B） | routine・check・見張りを二重にしない |
| `validate` の索引検査 | tpl-tools の config キーでまとめて止める（3-A） | config を分ける（3-B）、karasu 側の検査（3-C） | 3-B は README の表の検査に落ちる。3-C は ADR-2810 の持ち主の線を崩す |
| 検査の場所 | `Validate` に TPL の索引を含める（D5） | 別の workflow | 再生成 PR は両方を触るので、分類の規則を 1 か所に置く |

## 影響範囲・マイグレーション

1. **tpl-tools**: 索引の検査をまとめて止める config キーを足して release する（tpl-tools の repo に
   Issue と英語の ADR）。karasu 側はこの版を待つ
2. **karasu の移行 PR**（1 本）:
   - `@kompiro/tpl-tools` を上げ、`tpl.config.json` に `indexFile: "index.md"` と 1 のキーを設定する
   - G を広げ（D2）、生成器を動かす側に D4 の規則を入れる。対象は `scripts/adr/generated.ts`、
     `check-generated.ts`、`regenerate-at.ts`、`regenerate-pr.ts`（生成・G の外への書き込みの検査・PR
     本文の出力の一覧）、`regenerate-pr-flow.ts`、`check-freshness.ts`、`scripts/review/tier.ts` の
     `regenerationWaivesRecord`。テストは `generated.ts`・`check-generated.ts` の既存のユニットテストに
     TPL の索引の場合を足し、G を固定している `tier.test.ts` と `adr-validate-paths-sync.test.ts` を直す
   - D5 の path filter と hook の glob を直す
   - README の一覧表を消し、`index.md` へのリンクを置く。Validator の節（表の整合を検査すると書いた
     2 か所）を「索引は翌日の再生成 PR が更新し、`tpl:validate` は索引を見ない」に直す。
     `at-check-coverage.yml` の「README index rules」のコメントも直す
   - `pnpm tpl:regenerate` を足す（手元で索引を見るため）。生成物をコミットしないことと、生成した
     `index.md` を捨てるコマンドは README の Validator の節に書く（`.claude/rules/adr.md` は
     `docs/test-perspectives/**` の編集では読み込まれないので、そこには書かない）
   - **この PR は `index.md` を書かない。** 出力の設定を変える PR が生成物を書くと `Validate` は
     混在として落とす（ADR-3416）。最初の `index.md` は再生成 PR が作る
   - **マージの直後に、手元で `pnpm adr:regenerate-pr` を実行する。** 表を消した README のリンク先が
     翌日の routine まで 404 にならないようにするため。これは移行の手順に含め、省略しない
3. #3289 の Proposal と Acceptance を、この設計（1-B / 2-A / 3-A）に合わせて英語で書き直す。今の
   Acceptance（`--check` が CI で落とす、`pnpm tpl:regenerate` が `index.md` だけを変える）は 1-B では
   成り立たない
4. hane の `test-perspective` skill は「ホスト repo が一覧表を持つ場合は行を足す」と条件付きで書いて
   いるので、表が無くなれば何もしない。変更は要らない

### 実装の指針

- 受け入れテスト（`docs/acceptance/`）は作らない。利用者から見える挙動は無く、上のユニットテストで
  確かめる。ADR-3416 の受け入れテストのうち、再生成 PR の流れを確かめる項目は TPL の索引を含めて読み替える
- ADR への昇格は移行 PR のマージ後。ADR-3416 を覆すのではなく範囲を広げる決定なので、新しい ADR で
  `related_to: ADR-3416` とし、ADR-3416 の本文は変えない

## Related TPLs

- [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md): 再生成 PR を人を通さずマージしてよいかは、最終の差分で `Validate` が判定する。TPL の索引を G に入れても判定の仕方は変えない
- [TPL-2658](../test-perspectives/TPL-2658-agent-write-scope-is-declared-not-prompted.md): routine が書いてよい範囲は prompt ではなく G の宣言で検証する。G を広げるのは config と `generated.ts` の変更として PR に残る
- [TPL-1480](../test-perspectives/TPL-1480-consistency-check-triggers-on-both-sides.md): `adr-validate.yml` の `paths` と `adr-validate-skip.yml` の `paths-ignore`、`lefthook.yml` の glob を同じ PR でそろえる
- [TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md): 鮮度の見張りが TPL の索引について結論を出せないときは、通過ではなく失敗にする。版の変化による見送りは理由を出力する
- [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md): 索引は TPL の frontmatter と本文から導出できる値で、手で持たない

proactive TPL は起こさない。本設計が破りうる原則として「遅れることが正常な生成物を、PR ごとの検査の
前提にしない」（D3）を検討した。ADR 側では `adr validate` が `effective.md` を走査の対象から外しており、
TPL 側は 3-A のキーを設定したうえで `tpl:validate` が通ることで機械的に確かめられる。違反は今回の
1 か所に限られ、横展開しうる先が見当たらない。

## 未解決の問い

- **索引への状態の表示（#3488）の遅れ**: 状態も 1 日遅れて索引に出る。Design Doc を書く人が使う
  `tpl related --status` と `tpl checklist` は手元で導出するので遅れない。索引の状態は一覧として眺める
  用途に限り、遅れを許容する
- **tpl-tools のキーの形**: 索引の検査を止めるだけのキーにするか、`indexFile` を
  `{ "path": "index.md", "check": false }` のような形に広げるか。tpl-tools 側の設計で決める
- **TPL ディレクトリの所在**: karasu 側の定数として G に持たせるか、tpl-tools の config に
  ディレクトリのキーを足して両者が同じ値を読むようにするか。今は CLI の既定値に頼っているので、
  karasu の定数で始め、食い違いが起きたら tpl-tools 側にキーを足す
