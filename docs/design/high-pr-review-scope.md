# High の PR で人間が読む範囲を絞る：High の部分を別の PR に分けることと、ファイルごとの段階を見せること

- **日付**: 2026-11-02
- **ステータス**: 検討中
- **PR**: #TBD
- **関連**:
  - 引き金 Issue: [#3542](https://github.com/kompiro/karasu/issues/3542)（High の部分を別の PR に分ける）、[#3543](https://github.com/kompiro/karasu/issues/3543)（ファイルごとの段階と読む範囲）。親は [#3546](https://github.com/kompiro/karasu/issues/3546)
  - 関連 ADR: [ADR-3286](../adr/3286-risk-based-review-tiers.md)（リスク段階。本設計はその運用と Review tier の出力を足す）、[ADR-2643](../adr/2643-stacked-pr-workflow.md)（stacked PR はレビュー対象を最下層の 1 本にする）、[ADR-3011](../adr/3011-skip-coderabbit-label.md)（判断を含む基準を Claude だけで適用しない）
  - 関連 Issue: [#3505](https://github.com/kompiro/karasu/issues/3505) / [#3508](https://github.com/kompiro/karasu/issues/3508)（言語の挙動とセキュリティの境界を High にする。本設計の効き方を変える）、[#3380](https://github.com/kompiro/karasu/issues/3380)（段階の 1 か月後の計測）
  - 関連 TPL: [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)（本 PR で適用場面を足す）、[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)、[TPL-2643](../test-perspectives/TPL-2643-skip-reports-success-without-running.md)
  - コード: `scripts/review/tier.ts`、`.github/workflows/review-tier.yml`

## 背景・課題

PR の段階は、変更したファイルの段階の最大値で決まる（ADR-3286）。`packages/core` の変更が spec の日英 2 ファイルを
一緒に変えると、PR 全体が High になる。そのとき kompiro は差分の全部を読み、CodeRabbit も差分の全部にラウンドを回す。

直近にマージした High の PR 24 本のうち、High のパスのファイルが一部だけだった PR が 9 本ほどあった。

| PR    | High のパスのファイル / 全ファイル | CodeRabbit のレビュー           | High になった原因                      |
| ----- | ---------------------------------- | ------------------------------- | -------------------------------------- |
| #3409 | 4 / 51                             | 7 回                            | `docs/spec/style*`・`diagnostics*`     |
| #3527 | 4 / 30                             | 4 回                            | `docs/spec/syntax*`・`diagnostics*`    |
| #3437 | 2 / 24                             | 2 回（再レビューの依頼は 6 回） | `docs/concepts*`                       |
| #3498 | 6 / 26                             | 4 回                            | `.claude/rules/**`・`lefthook.yml`     |
| #3320 | 2 / 10                             | 2 回                            | `docs/spec/style*`                     |
| #3407 | 1 / 8                              | 2 回                            | `.github/workflows/vscode-release.yml` |

kompiro の目的は、High の PR で読む範囲を狭めてレビューの精度を上げることと、CodeRabbit のラウンドを減らして
開発を速くすることである（#3546）。

### #3508 の規則で数え直すと

#3508 は、言語の挙動（`packages/core/src/{lexer,parser,resolver,spec,style,formatter,annotations}/**` など）と
セキュリティの境界のパスを High に加える。同じ PR のファイルをその分類器（`pathTier`）で数え直した。

| PR    | High のファイル | 内訳                              | spec などを分けると実装側は |
| ----- | --------------- | --------------------------------- | --------------------------- |
| #3320 | 2 / 10          | spec 2                            | Medium                      |
| #3437 | 2 / 24          | concepts 2                        | Medium                      |
| #3498 | 6 / 26          | rules・skill・lefthook・lint      | Medium                      |
| #3407 | 1 / 8           | workflow 1                        | Medium                      |
| #3527 | 15 / 30         | spec 4、parser 11                 | High のまま                 |
| #3409 | 11 / 51         | spec 4、parser・resolver・style 7 | High のまま                 |
| #3422 | 7 / 17          | spec 2、parser・resolver・fs 5    | High のまま                 |
| #3447 | 7 / 16          | parser・formatter 5、lint 2       | High のまま                 |

**分けて実装側が Medium に落ちるのは、renderer・app・examples などの変更に spec・concepts・rules が付いてくる形
だけ**である。言語の挙動を変える PR は実装側も High なので、分けても読む量は減らない。一方、どの PR でも、
High のファイルとそれ以外を区別して見せることはできる。#3527 なら 30 ファイルのうち読むのは 15 になる。

## 現状（インベントリ）

| 観点                             | 現状                                                                                                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 段階の出力                       | `tier.ts classify` は PR の段階と理由を JSON で出す。ファイルごとの段階は内部で計算しているが、一覧としては出さない                                                           |
| Review tier                      | base 側の分類器を install なしで動かす。#3508 からは、test の理由の行で通った PR を job summary（`GITHUB_STEP_SUMMARY`）に書く。権限は read だけ                              |
| High で人間が読むもの            | 差分の全部（review.md「リスク段階」の「人間が差分を読む」）                                                                                                                   |
| 人間の判断が要る論点             | `/coderabbit-converge` が PR 上で質問してから kompiro に渡す（coderabbit-rounds.md）。置き場所の決まりは無い                                                                  |
| High の PR の機械の検査          | CI の全部と CodeRabbit のラウンド。#3508 の test の検査（fix にテストがあるか、既存のテストを弱めていないか）は High にも当たる。ローカルレビューの記録は High では検査しない |
| stacked PR                       | レビュー対象は最下層の 1 本。上の層は draft で、分単位の CI も CodeRabbit も走らない（ADR-2643）                                                                              |
| 実装と spec を同じ PR に縛る検査 | `diagnostics-catalog.test.ts`（出す診断コードと `docs/spec/diagnostics*.md` の一致）、`language-version.test.ts`（言語の版と spec の記述の一致）                              |

## 制約・前提

- **段階は変えない。** どのファイルの段階も、分類器の規則のまま決める。分けた PR も、それぞれの最終の差分で
  段階が決まる（TPL-3286）。分けることで段階が下がるのは、High のファイルを含まない PR が実際にできたときだけで、
  Claude の判断で段階を下げることにはならない（ADR-3011）
- **人間が読まない範囲には、少なくとも Medium の PR と同じ機械の検査が当たっていること。** High の PR の
  Medium のファイルは、CodeRabbit のラウンドと #3508 の test の検査を通るので、この条件は満たしている
- **CodeRabbit がレビューする範囲は PR ごとに変えられない。** 範囲を決める `path_filters` は `.coderabbit.yaml` に
  あり、変えればそれ自体が High の変更になる。CodeRabbit が読む量を減らせるのは、PR を分けることだけである
- **分けた PR は、それぞれ単独で CI を通る。** 診断コードを足す変更は `diagnostics-catalog.test.ts` が spec と
  同じ PR を求めるので、分けられない。そうした変更はほとんど言語のパスに触れるので、分けても得るものが無い
- **導き出せる一覧を PR 本文に書かない。** 本文に置いた一覧は、コミットを足すと古くなる（TPL-1032）。HEAD から
  毎回作り直せる場所に出す
- **対象外**：High のパスの見直し、CodeRabbit のラウンドの上限（#3545）、仕組みの High と決定の High の区別（#3544）

## 検討した選択肢

### #3542：High の部分を別の PR に分ける

#### 案A1：実装を下、High の部分を上に積む

実装（Medium）を最下層にしてレビュー・マージし、spec などの PR（High）を後から通す。

**メリット**

- kompiro は High の PR で spec の差分だけを読む
- main の spec は、マージされた実装より先に進まない

**デメリット**

- kompiro は、記録される決定（spec）を読む前に実装の判断をすることになる
- 上の層が止まると、main に spec の無い挙動が残る。#3505 が穴として挙げた「spec を更新すべき変更が spec なしで
  通る」形を、一時的にとはいえ自分で作る

#### 案A2：High の部分を下、実装を上に積む（推奨）

spec などの PR（High）を最下層にし、CodeRabbit のラウンドと kompiro のレビューを通してマージする。そのあと
実装の PR（Medium）を下ろし、Medium として判断する。

**メリット**

- 決定を読んでから実装を判断する順になる。CodeRabbit のラウンドは spec の差分だけに回る
- 実装の PR は、マージ済みの spec を前提に Medium の検査（Render equivalence、test の検査、preview）で判断できる

**デメリット**

- 実装の PR がマージされるまで、main の spec がまだ無い挙動を書いている。docs-site と、次の release train の
  リリースノートに影響しうる。ただし実装もリリースまでは利用者に届かないので、spec と実装のずれは
  リリースをまたがない限り利用者には見えない
- 実装が取りやめになったら、spec を戻す PR が要る

#### 案A3：分けない（#3543 だけで対応する）

**メリット**：手順が増えない。**デメリット**：CodeRabbit が読む量は減らない。

### #3543：ファイルごとの段階と読む範囲を見せる

#### 案B1：Review tier の job summary に出す（推奨）

Review tier が、ファイルを段階ごとにまとめた表を job summary に書く。High のファイルを「kompiro が読む」、
残りを「機械の検査で判断する」に分ける。`tier.ts classify` も同じ一覧を出し、High のファイルが決定のパス
（`docs/spec/**`・`docs/concepts*.md`・`docs/process*`・`.claude/rules/**`）だけのときは「分けられる」と示す。

**メリット**

- push のたびに HEAD から作り直すので古くならない（TPL-1032）
- Review tier の権限（read）と性質（install なし、数秒）を変えない。#3508 の job summary と同じ書き方

**デメリット**

- kompiro は PR 本文ではなく check の画面を開く必要がある。本文から 1 行でリンクする

#### 案B2：PR 本文に生成した節を置き、Review tier が HEAD を覆っているかを検査する

**メリット**：PR を開けば見える。**デメリット**：コミットのたびに作り直しが要る。作り直しを忘れると check が
落ちるので、ラウンドの push ごとに本文の更新が増える。

#### 案B3：PR 本文に節を置き、検査しない

**メリット**：実装が軽い。**デメリット**：古い一覧が残っても誰も気づかない（TPL-1032 の失敗モードそのもの）。

### 判断してほしい論点の置き場所（#3543 の残り）

一覧とは別に、kompiro に判断してほしいことを PR 本文の決まった節（例：`## For kompiro`）に 3 件以内で置く。
これは導き出せる情報ではなく Claude が書く内容なので、本文に置いてよい。`/coderabbit-converge` が kompiro に
渡すときの質問も、この節に集める。

## 比較

| 観点                  | A1                                            | A2              | A3                 |
| --------------------- | --------------------------------------------- | --------------- | ------------------ |
| kompiro が読む量      | spec だけ                                     | spec だけ       | 全部（B で絞れる） |
| CodeRabbit のラウンド | spec だけ                                     | spec だけ       | 全部               |
| 決定と実装の順        | 実装が先                                      | 決定が先        | 同時               |
| main の一時的なずれ   | spec が遅れる                                 | spec が先に進む | なし               |
| 効く PR               | 実装側が言語・セキュリティのパスに触れない PR | 同左            | すべて             |

| 観点            | B1               | B2           | B3       |
| --------------- | ---------------- | ------------ | -------- |
| 古くならないか  | 毎回作り直す     | 検査で止める | 古くなる |
| 見る場所        | check の summary | PR 本文      | PR 本文  |
| push ごとの手間 | なし             | 本文の更新   | なし     |

## 現時点の方針

**#3542 は案A2、#3543 は案B1 と「判断してほしい論点」の節を採る。** A と B は効く PR が違う。言語の挙動を
変える PR では分けても読む量が減らないので、B で High のファイルに絞る。spec・concepts・rules が
実装に付いてくるだけの PR では、A で High の部分を分け、CodeRabbit のラウンドも小さい PR に閉じ込める。

分けるかどうかの判定は 1 つにする。**`tier.ts classify` が「High のファイルが決定のパスだけ」と出したら分ける。**
これは差分から機械で決まるので、Claude の判断で段階を下げることにはならない。決定のパスに当たらない High の
ファイル（workflow や lint）が混ざるときは分けない。#3498 や #3407 の型は、まずは分ける対象にしない。

### スライス（実装ステップ）

| スライス                                                                                 | 前提                            | 独立に出荷できる理由                                   |
| ---------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------ |
| **B** ファイルごとの段階を出す（[#3543](https://github.com/kompiro/karasu/issues/3543)） | #3508 のマージ                  | 出力を足すだけで、どの PR の段階も検査の結果も変えない |
| **A** 分ける手順と判定（[#3542](https://github.com/kompiro/karasu/issues/3542)）         | B（「分けられる」の表示を使う） | 手順の追加で、分けなかった PR はこれまでどおり通る     |

> 各スライスで何ができるようになるか / その時点でまだできないことは
> 親 Issue [#3546](https://github.com/kompiro/karasu/issues/3546) の `## Slice status` を参照。

### 実装の指針

1. B：`tier.ts` に、ファイルを段階ごとにまとめる関数を足す（`classifyChange` が使う段階をそのまま使う）。
   `classify` の JSON に `files` を足し、`check` は job summary に表を書く。High のファイルが決定のパスだけなら
   `splittable: true` を出す。テストは `tier.test.ts` に足す
2. B：`docs/process/review.md`「リスク段階」の High の行を「人間が High のファイルを読む」に改め、PR 本文から
   Review tier の summary へのリンクと `## For kompiro` の節を置く手順を足す。`/coderabbit-converge` の渡し方も
   同じ節に揃える
3. A：`docs/process/review.md` に、`splittable: true` のときの分け方（A2 の順、`gh stack` の手順への参照）を足す。
   `docs/process/stacked-pr.md` は変えない
4. AT：Review tier の summary に表が出ることと、`splittable` の判定を、過去の PR の差分（#3320・#3437 は true、
   #3527・#3498 は false）で確かめる。どちらも CI とテストで確かめられるので、手動の項目は置かない
5. ADR 昇格：両方の実装が終わったら ADR-3542 として昇格し、本 Design Doc を削除する。ADR-3286 を
   `refines` で指す

### 影響範囲・マイグレーション

- 既存の PR への影響：なし。段階も、Review tier が落とす条件も変えない
- ドキュメント更新：`docs/process/review.md`、`.claude/skills/coderabbit-converge`（渡し方の節）
- #3380 の計測：分けた PR は High の本数を増やし、1 本あたりの差分を小さくする。計測ではファイル数あたりの
  レビュー回数も見る

## Related TPLs

- [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)：分けた PR もそれぞれの最終の差分で段階が決まること。人間が読む範囲を差分から決める判定にも同じ観点が当たるので、本 PR で適用場面を足す
- [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)：導き出せる一覧を本文に置かない理由（案B2・B3 を採らない）
- [TPL-2643](../test-perspectives/TPL-2643-skip-reports-success-without-running.md)：A2 で上に積んだ実装の PR は、下りてくるまで CI を通らない

## 未解決の問い

- A2 の順（spec を先に main に入れる）でよいか。spec が実装より先に進む期間を許せないなら A1 になる
- 分ける判定から workflow・lint などの High（#3498・#3407 の型）を外したままでよいか。入れると、実装側の
  Medium の PR に、検査の仕組みを変えた効果が乗る（lint の規則を足した PR の実装側が、その規則で検査される）
- 判断してほしい論点の節の名前と上限（3 件）
