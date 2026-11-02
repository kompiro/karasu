# High の PR で人間が読む範囲を絞る：Design Doc で合意した内容は読み直さず、ずれと判断してほしいことだけを読む

- **日付**: 2026-11-02
- **ステータス**: 検討中
- **PR**: #TBD
- **関連**:
  - 引き金 Issue: [#3542](https://github.com/kompiro/karasu/issues/3542)（Design Doc で合意した内容を読み直さない）、[#3543](https://github.com/kompiro/karasu/issues/3543)（ファイルごとの段階と、判断してほしいことの節）。親は [#3546](https://github.com/kompiro/karasu/issues/3546)
  - 関連 ADR: [ADR-3286](../adr/3286-risk-based-review-tiers.md)（リスク段階。本設計はその規則と Review tier の出力を足す）、[ADR-3011](../adr/3011-skip-coderabbit-label.md)（判断を含む基準を Claude だけで適用しない）、[ADR-3271](../adr/3271-close-issue-with-pr.md)（Design Doc の PR は `Refs #N`、実装の PR は `Closes #N`）
  - 関連 Issue: [#3505](https://github.com/kompiro/karasu/issues/3505) / [#3508](https://github.com/kompiro/karasu/issues/3508)（言語の挙動とセキュリティの境界を High にする）、[#3380](https://github.com/kompiro/karasu/issues/3380)（段階の 1 か月後の計測）
  - 関連 TPL: [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)（本 PR で適用場面と失敗モードを足す）、[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)
  - コード: `scripts/review/tier.ts`、`.github/workflows/review-tier.yml`、`.claude/skills/coderabbit-converge`

## 背景・課題

PR の段階は、変更したファイルの段階の最大値で決まる（ADR-3286）。`packages/core` の変更が spec の日英 2 ファイルを
一緒に変えると、PR 全体が High になる。そのとき kompiro は差分の全部を読み、CodeRabbit も差分の全部にラウンドを回す。

直近にマージした High の PR 24 本のうち、High のパスのファイルが一部だけだった PR が 9 本ほどあった。

| PR    | High のパスのファイル / 全ファイル | CodeRabbit のレビュー           | High になった原因                   |
| ----- | ---------------------------------- | ------------------------------- | ----------------------------------- |
| #3409 | 4 / 51                             | 7 回                            | `docs/spec/style*`・`diagnostics*`  |
| #3527 | 4 / 30                             | 4 回                            | `docs/spec/syntax*`・`diagnostics*` |
| #3437 | 2 / 24                             | 2 回（再レビューの依頼は 6 回） | `docs/concepts*`                    |
| #3498 | 6 / 26                             | 4 回                            | `.claude/rules/**`・`lefthook.yml`  |
| #3320 | 2 / 10                             | 2 回                            | `docs/spec/style*`                  |

ところが、こうした PR の仕様の変更は、ほとんどが Design Doc の段階で kompiro と検討して合意したものである。
実装の PR で spec の差分をもう一度読むのは、同じレビューを 2 回していることになる。kompiro が実装の PR で
確かめたいのは、合意した設計から実装がずれていないかと、自分が判断すべき論点だけである（#3546 の議論、2026-11-02）。
Design Doc で合意した PR は、できるだけ人間の手を介さずに進めたい。

### #3508 の規則で数え直すと

#3508 は、言語の挙動（`packages/core/src/{lexer,parser,resolver,spec,style,formatter,annotations}/**` など）と
セキュリティの境界のパスを High に加える。同じ PR のファイルをその分類器（`pathTier`）で数え直した。

| PR    | High のファイル | 内訳                              | spec などが合意済みなら                   |
| ----- | --------------- | --------------------------------- | ----------------------------------------- |
| #3320 | 2 / 10          | spec 2                            | Medium（CodeRabbit のラウンドが無くなる） |
| #3437 | 2 / 24          | concepts 2                        | Medium                                    |
| #3527 | 15 / 30         | spec 4、parser 11                 | High のまま（parser）                     |
| #3409 | 11 / 51         | spec 4、parser・resolver・style 7 | High のまま                               |
| #3422 | 7 / 17          | spec 2、parser・resolver・fs 5    | High のまま                               |

spec の合意だけで段階が下がるのは、renderer・app・examples などの変更に spec や concepts が付いてくる PR である。
言語の挙動を変える PR は High のまま CodeRabbit のラウンドを回すが、kompiro が読むものは「Design Doc からの
ずれ」と「判断してほしいこと」に絞れる。

## 現状（インベントリ）

| 観点                              | 現状                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 段階の出力                        | `tier.ts classify` は PR の段階と理由を JSON で出す。ファイルごとの段階は内部で計算しているが、一覧としては出さない                                           |
| Review tier                       | base 側の分類器を install なしで動かす。#3508 からは、test の理由の行で通った PR を job summary（`GITHUB_STEP_SUMMARY`）に書く。権限は read だけ              |
| High で人間が読むもの             | 差分の全部（review.md「リスク段階」の「人間が差分を読む」）                                                                                                   |
| Design Doc と実装の PR のつながり | Design Doc の「関連」に引き金 Issue があり、Design Doc の PR は `Refs #N`、実装の PR は `Closes #N`（ADR-3271）。Design Doc は ADR に昇格するまで main に残る |
| Design Doc の仕様の書き方         | 決まりは無い。仕様の文面を載せることもあれば、方針だけのこともある                                                                                            |
| 実装と Design Doc の照合          | 仕組みは無い。CodeRabbit は Design Doc を読まない。`/engineering:code-review` は差分だけを見る                                                                |
| 人間の判断が要る論点              | `/coderabbit-converge` が PR 上で質問してから kompiro に渡す（coderabbit-rounds.md）。置き場所と件数の決まりは無い                                            |
| High の PR の機械の検査           | CI の全部と CodeRabbit のラウンド。#3508 の test の検査は High にも当たる                                                                                     |
| 実装と spec を同じ PR に縛る検査  | `diagnostics-catalog.test.ts`（出す診断コードと `docs/spec/diagnostics*.md`）、`language-version.test.ts`（言語の版と spec の記述）                           |

## 制約・前提

- **段階を Claude の判断で下げない。** 合意済みとみなすのは、機械が確かめた一致だけにする。宣言で検査が軽くなる
  規則は、宣言を裏付ける検査があるときだけ効かせる（ADR-3011、#3505 の制約）
- **合意の根拠は base 側の Design Doc から読む。** PR が自分で Design Doc を書き換えて、自分の差分と一致させる
  ことができないようにする。同じ PR がその Design Doc を変えていたら、合意済みとみなさない（TPL-3286）
- **Design Doc が main にあることを、kompiro の合意とみなす。** Design の PR は人間のレビューを経てマージする
  （review.md「リスク段階」）。マージしたのは kompiro なので、main の Design Doc はそのまま合意の記録になる
- **決定のパスだけを対象にする。** `docs/spec/**`・`docs/concepts*.md`・`docs/process.md`・`docs/process/**`・
  `.claude/rules/**`。workflow・lint・CI の仕組みは、文面が合意どおりでも挙動を確かめる必要があるので High のまま
  にする（kompiro の決定、2026-11-02）
- **マージは人間が行う。** High の auto-merge の例外は作らない。ADR-3286 のマージの決まりは変えない
- **導き出せる一覧を PR 本文に書かない。** 本文に置いた一覧は、コミットを足すと古くなる（TPL-1032）。HEAD から
  毎回作り直せる場所に出す
- **AI による照合は自己申告である。** subagent が列挙したずれは、ローカルレビューの記録と同じく check では
  裏付けられない。そのため段階には使わず、kompiro が読む範囲を示すだけにする
- **対象外**：High のパスの見直し、CodeRabbit のラウンドの上限（#3545）、仕組みの High と決定の High の区別（#3544）

## 検討した選択肢

### 仕様の変更の扱い（#3542）

#### 案1：High の部分を別の PR に分ける（却下）

spec などを小さな High の PR にし、実装を Medium の PR にして stacked PR で積む。

- 仕様は Design Doc で読んでいるので、分けた High の PR でも同じ文面を読み直すことになる
- 言語の挙動を変える PR は実装側も High なので、#3508 の後は分けても読む量が減らない
- 積む順（spec が先か実装が先か）によって、main の spec と実装が一時的にずれる

#### 案2：Design Doc に載せた文面と一致したら合意済みとする（推奨）

Design Doc に、決定のパスへ入れる文面をファイルごとのブロックで載せる。

````md
### 仕様の変更

```diff file=docs/spec/style.md
+ A label nudged outside a frame border is moved back inside it.
```

```diff file=docs/spec/style.ja.md
+ 枠の境界の外へ押し出されたラベルは、枠の内側へ戻す。
```
````

Review tier は、実装の PR の決定のパスの各ファイルについて、追加行と削除行が base 側のどれかの Design Doc の
ブロックに含まれるかを確かめる。含まれるファイルは「合意済み」として Medium に数える。ほかに High のファイルが
無ければ PR は Medium になり、CodeRabbit のラウンドは回らない。

**メリット**

- 合意の判定が差分と base の Design Doc から機械で決まる。宣言を書く必要が無い
- spec の一致だけで済む PR（#3320 や #3437 の型）では、CodeRabbit のラウンドが丸ごと無くなる
- 文面が合意からずれたら High に戻るので、ずれた部分は kompiro に届く

**デメリット**

- Design Doc に日英の両方の文面を書く手間が増える。英語は日本語の訳なので、kompiro は日本語を読めばよい
- 実装の途中で文面を直すと一致しなくなる。直すなら Design Doc を先に直す（小さな Design の PR）か、High の
  まま通す

#### 案3：AI の照合だけで合意済みとする

subagent が spec の差分を Design Doc と照らし、ずれが無ければ合意済みとする。

- Design Doc に文面を載せる手間は無いが、結果は自己申告で、段階を下げる根拠にできない（ADR-3011）

### 実装のずれの見つけ方（#3542）

#### 案A：subagent が Design Doc と照合して、ずれを列挙する（推奨）

ready の前のローカルレビュー（`docs/process.md` 手順 8）に、Design Doc との照合を足す。実装の文脈を持たない
subagent に Design Doc と差分を渡し、Design Doc の「現時点の方針」「実装の指針」「制約・前提」から外れた点を
列挙させる。ずれは 2 つに分ける。

| ずれ                                                        | どうするか                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 実装が Design Doc を外れている                              | 実装を直す                                                                                                          |
| Design Doc の方が実態に合わない（実装して分かった制約など） | 直さずに kompiro へ確認する。記録済みの決定を変えるので、coderabbit-rounds.md「人間に確認する指摘の判定」と同じ扱い |

照合の結果はローカルレビューの記録に、レビュアー `design` として残す。

#### 案B：CodeRabbit に Design Doc を読ませる

`path_instructions` で Design Doc を参照させる。CodeRabbit が Design Doc を読む保証は無く、Medium には CodeRabbit が
回らないので届かない。

### 見せ方（#3543）

#### 案1：Review tier の job summary に出す（推奨）

Review tier が、ファイルを段階ごとにまとめた表を job summary に書く。合意済みのファイルはその旨と、一致した
Design Doc を添える。push のたびに HEAD から作り直すので古くならない（TPL-1032）。Review tier の権限（read）と
性質（install なし、数秒）は変えない。PR 本文からは 1 行でリンクする。

#### 案2：PR 本文に生成した節を置く

PR を開けば見えるが、コミットのたびに作り直しが要る。作り直しを忘れると古い一覧が残る。

### 判断してほしいことの節（#3543）

一覧とは別に、kompiro に判断してほしいことを PR 本文の `## For kompiro` 節に置く。ずれのうち kompiro へ確認する
もの、CodeRabbit の指摘のうち記録済みの決定を変えるもの、ほかの論点をここに集める。導き出せる情報ではなく
Claude が書く内容なので、本文に置いてよい。

**一度に出すのは 3 件までにする。** 4 件以上あるときは、kompiro が最初の 3 件に答えた後で、残りを次の 3 件
として出す（kompiro の決定、2026-11-02）。答えによって残りの論点が消えたり変わったりするので、先に全部を
並べない。

## 現時点の方針

**仕様は案2（Design Doc の文面との一致）、実装のずれは案A（subagent の照合）、見せ方は案1（job summary）と
`## For kompiro` 節を採る。** kompiro が High の PR で読むものは、次のどちらかになる。

| PR                                                            | kompiro が読むもの                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `Closes #N` の Issue を引き金とする Design Doc が main にある | `## For kompiro` 節（ずれと論点）だけ。差分は、節が指す箇所を確かめるときに開く |
| Design Doc が無い                                             | High のファイル（合意済みのファイルを除く）と `## For kompiro` 節               |

Design Doc の有無は、PR の `Closes #N` と base 側の Design Doc の「引き金 Issue」の行で機械が決める。どちらの場合も
CodeRabbit のラウンドが収束してから kompiro に渡し（coderabbit-rounds.md）、マージは kompiro が行う。

### スライス（実装ステップ）

| スライス                                                                                                 | 前提                                | 独立に出荷できる理由                                                                  |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| **B** ファイルごとの段階と `## For kompiro` 節（[#3543](https://github.com/kompiro/karasu/issues/3543)） | #3508 のマージ                      | 出力と手順を足すだけで、どの PR の段階も検査の結果も変えない                          |
| **A1** 仕様の文面の一致で合意済みとする（[#3542](https://github.com/kompiro/karasu/issues/3542)）        | B（summary に合意済みを出す）       | 一致しなければこれまでどおり High。文面を載せていない Design Doc の PR にも影響しない |
| **A2** Design Doc との照合（[#3542](https://github.com/kompiro/karasu/issues/3542)）                     | B（ずれを `## For kompiro` に出す） | ローカルレビューの手順を足すだけで、check は変えない                                  |

> 各スライスで何ができるようになるか / その時点でまだできないことは
> 親 Issue [#3546](https://github.com/kompiro/karasu/issues/3546) の `## Slice status` を参照。

### 実装の指針

1. B：`tier.ts` に、ファイルを段階ごとにまとめる関数を足す（`classifyChange` が使う段階をそのまま使う）。
   `classify` の JSON に `files` を足し、`check` は job summary に表を書く。`Closes #N` の Issue を引き金とする
   Design Doc が base にあれば、それも表の上に出す。テストは `tier.test.ts` に足す
2. B：`docs/process/review.md`「リスク段階」の High の行を、上の表の「kompiro が読むもの」に改める。PR 本文の
   `## For kompiro` 節（3 件まで、残りは答えの後）の手順を足し、`/coderabbit-converge` の渡し方をこの節に揃える
3. A1：`tier.ts` に、base 側の `docs/design/*.md` から ` ```diff file=<path> ` のブロックを読み、決定のパスの
   ファイルの追加行と削除行がブロックに含まれるかを判定する関数を足す。同じ PR がその Design Doc を変えていれば
   使わない。含まれれば、そのファイルを Medium に数える。比較は行の前後の空白を除いて行う
4. A1：`docs/design/TEMPLATE.md` に `### 仕様の変更` 節（任意）を足し、ブロックの書き方を書く
5. A2：`docs/process.md` 手順 8 と `docs/process/review.md` に、Design Doc との照合を足す。subagent に渡すのは
   Design Doc と base との差分だけにし、実装の文脈を渡さない。記録のレビュアーに `design` を足す
   （`local-review-record.ts`）
6. TPL：TPL-3286 に、合意の根拠を PR 側の Design Doc から読む失敗モードを足す（本 PR）
7. AT：過去の PR の差分で確かめる。#3320 の spec の差分を載せた Design Doc を base に置くと Medium になり、文面を
   1 行変えると High に戻る。PR 側で Design Doc を足しても Medium にならない。どれもテストで確かめられるので、
   手動の項目は置かない
8. ADR 昇格：すべてのスライスが終わったら ADR-3542 として昇格し、本 Design Doc を削除する。ADR-3286 を
   `refines` で指す

### 影響範囲・マイグレーション

- 既存の PR への影響：なし。文面を載せた Design Doc が無ければ、段階も検査の結果も変わらない
- ドキュメント更新：`docs/process.md`、`docs/process/review.md`、`docs/process/coderabbit-rounds.md`、
  `docs/design/TEMPLATE.md`、`.claude/skills/coderabbit-converge`
- #3380 の計測：合意済みで Medium になった PR を数え、マージ後 1 週間以内の fix PR を見る（ADR-3286 の見直しの条件）

## Related TPLs

- [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)：合意済みとみなす判定も、最終の差分と base 側の Design Doc で行う。本 PR で適用場面と失敗モードを足す
- [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)：導き出せる一覧を本文に置かない理由
