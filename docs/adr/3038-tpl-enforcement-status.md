---
id: ADR-3038
title: TPL の enforcement 状態をチェックリスト項目の印から導出する
status: accepted
date: 2026-11-05
topic: testing
authors: [kompiro]
related_to:
  - ADR-1192
  - ADR-1357
  - ADR-2810
  - ADR-3289
  - ADR-2687
  - ADR-3169
assumptions:
  - "grep: tpl.config.json :: \"checklistHeading\": \"チェックリスト\""
  - "grep: tpl.config.json :: \"sourcePrefixes\": \\[.*\"\\.github\""
  - "grep: .github/workflows/tpl-review.yml :: --config tpl\\.config\\.json"
  - "grep: docs/test-perspectives/README.md :: ### チェックリスト項目の印"
---

# ADR-3038: TPL の enforcement 状態をチェックリスト項目の印から導出する

- **日付**: 2026-11-05
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3038](https://github.com/kompiro/karasu/issues/3038)（分類の結果と `## Slice status` 表）、設計 PR [#3478](https://github.com/kompiro/karasu/pull/3478)
  - スライス: [#3487](https://github.com/kompiro/karasu/issues/3487)（見出しの統一）、[kompiro/tpl-tools#31](https://github.com/kompiro/tpl-tools/issues/31)（印の解析と状態の導出）、[#3488](https://github.com/kompiro/karasu/issues/3488)（印のバックフィル、PR [#3610](https://github.com/kompiro/karasu/pull/3610)）、[#3489](https://github.com/kompiro/karasu/issues/3489)（ガードの backlog）
  - [ADR-1192](1192-test-perspective-library.md)（TPL の運用）、[ADR-1357](1357-tpl-tools-extraction.md)（検査と照会は `@kompiro/tpl-tools` が持つ）、[ADR-2810](2810-tpl-source-path-check-ownership.md)（TPL ディレクトリの検査は tpl-tools の CLI が持つ）、[ADR-3289](3289-tpl-index-daily-regeneration.md)（状態を出す索引は毎日の再生成 PR が書く）
  - tpl-tools 側の実装判断: tpl-tools ADR-17（本文のパスの実在検査と `--source-prefix`）、ADR-27（`tpl regenerate` の索引）、ADR-31（印の解析・状態の導出・`checklistHeading`）。印の解析と状態の導出は `@kompiro/tpl-tools@0.0.12` で公開
  - 変更ファイルから TPL を引く仕組みは別の設計: [#3486](https://github.com/kompiro/karasu/issues/3486)

## 背景

TPL は、設計・実装・bug 修正のときに人か LLM が**思い出して**当てるチェックリストで、当たるかどうかは
思い出すかどうかで決まる。TPL は 180 件を超え、deprecated は 0 件なので、思い出す負担は増える一方だった。

2026-10-02 に、当時の 154 TPL・804 項目を「プログラムで判定できるか」「今プログラムが判定しているか」で
分類した（基準と数値は #3038 本文）。

| 区分                                                     | 項目 | 割合 |
| -------------------------------------------------------- | ---: | ---: |
| mechanized（新しい箇所の違反で CI が赤くなる）           |  117 |  15% |
| instance-only（元 bug の箇所だけを固定するテストがある） |  382 |  48% |
| unguarded（判定できるが何も判定していない）              |   83 |  10% |
| judgment（設計時の判断、または人が行為をしたかの問い）   |  222 |  28% |

思い出すことに頼っている部分は 10% ではなく 48% の側にあった。instance-only はテストがあるので守られているように
見えるが、そのテストは元の bug を固定しているだけで、次の箇所で同じ形を捕まえる役目は TPL を思い出す人が負っている。
そして TPL の本文からは、どの項目が機械で守られているかが読めなかった（76 TPL は分類が根拠に挙げたテストを
本文で名指ししていなかった）。

## 決定

TPL のチェックリストの各項目の末尾に、CI が守っている項目は `[guard: …]`、プログラムで判定できない項目は
`[judgment]` を書き、印の無い項目を「判定できるがガードが無い」とみなして、TPL ごとの状態はこの印から導出するだけで
TPL のファイルには宣言しない。

## 仕組み

### 印（D1）

```markdown
- [ ] key の dot-segment 数が 4 以下か。
      [guard: `packages/i18n/src/catalog.test.ts`]
- [ ] sub-feature を導入するなら、そのまとまりだけで element.state キーが
      複数生まれるか。[judgment]
- [ ] dark / light の両テンプレートで同じ kind 集合を揃えているか
```

- チェックリスト節は `## チェックリスト` から次の見出し（レベルを問わない）まで。見出し名は karasu の
  `tpl.config.json` の `checklistHeading` が持ち、tpl-tools は karasu 固有の語をハードコードしない
- `[guard: …]` はインラインコードスパンでパスを 1 つ以上並べる。印は項目の本文（続き行を含む）の最後に 1 つだけ置ける
- 印をブラケットで囲むのは、項目の文中の「judgment」「guard」を印と読まないためである（検出器の near-miss は
  tpl-tools のテストが持つ。TPL-2287）
- `tpl validate` は、ガードのスパンが既存の実在検査（tpl-tools ADR-17）の対象になる形でないもの（行番号付き・glob・
  ファイル名だけなど）、ファイルを指さないもの、`<!-- absent-path-next-line -->` の直下にあるもの、位置や書式の
  誤った印を finding にする。黙って読み飛ばされる形を許すと、ガードの参照が検査されないまま残るからである
- 印の検査が有効なのに `--source-prefix` が 1 つも渡されていなければ usage error にする（パスを検査する手段が無い）
- 項目が 1 つも無いチェックリストも finding にする（これが無いと、D3 の `judgment` の「すべての項目が judgment」が
  空虚に成り立つ）

### 状態（D2・D3）

| 状態        | 条件                           | 意味                                     |
| ----------- | ------------------------------ | ---------------------------------------- |
| `guarded`   | unguarded = 0 かつ guarded ≥ 1 | 判定できる項目はすべて機械が守っている   |
| `partial`   | unguarded ≥ 1 かつ guarded ≥ 1 | 一部の項目は思い出す必要がある           |
| `unguarded` | guarded = 0 かつ unguarded ≥ 1 | 判定できる項目をすべて思い出す必要がある |
| `judgment`  | すべての項目が judgment        | 機械には判定できない。思い出すことが前提 |

- 状態は生成索引（ADR-3289）の各行と `tpl related <topic> --status` に出る。`tpl checklist` は印ごとに項目を並べる
- `tpl related` の既定の出力には状態を出さない。既定の出力は Design Doc の「Related TPLs」節に貼る形なので、
  状態を混ぜると導出値の写しが Design Doc に入り、昇格後は本文を変えない ADR（ADR-2687）に固まる
- 書式の誤った印は、状態の導出では unguarded に数える（守られていない側に倒す）。導出するコマンドは
  `--source-prefix` を受けないので、ここで言う書式は印そのものの形と位置（位置・後ろの句読点・パスの無い `[guard: ]` など）で、
  スパンが検査の対象になる形か・ファイルを指すかは `validate` だけが見る。誤った印を finding にするのも
  `validate` だけで、CI がそこで落とすので main には残らない
- 月次レビューの Issue（`tpl review-body --config tpl.config.json`）は状態ごとに問いを変える。`unguarded` /
  `partial` には「印の無い項目のうち、新しい箇所の違反で赤くなるガードにできるものはあるか」、`guarded` には「チェックリストを薄くできるか」、
  `judgment` には「プログラムで判定できるようになった項目はあるか」
- 状態は `status: active | deprecated`（ライフサイクル）とは直交する

### ガードと呼んでよいもの（D4）

`[guard: …]` に書いてよいのは、**その項目に新しい箇所が違反したとき、CI で動くチェックが赤くなる**ものだけにする
（ファイル集合の走査、registry の列挙、型レベルの網羅、閉じたクラスをテストが全列挙している、のどれか）。

- 元 bug の箇所や known_consumers だけを固定するテストは `[guard: …]` に書かず、「関連テスト」節に書く。その項目は印なしのまま残る
- 手で保守する表を回すテストは、新しい箇所が表に入ることを型・表とコードの突き合わせ・導出のどれかが強制しているときだけガードになる
- 参照先は、CI の step から辿った呼び出しの終点にある、この repo のファイルにする（テストファイルや、`scripts/`・`packages/*/scripts/` のスクリプト）。
  終点が外部の実行ファイル（`adr validate` など）のときだけ、その step を持つ workflow をガードにし、項目の本文で
  呼ばれるコマンドを名指しする。設定データや外部パッケージの中身はガードではない。このため karasu の
  `pnpm tpl:validate` に `--source-prefix .github` を足した
- **ガードの一般性はプログラムでは判定できない。** 実在は validator が見て、一般性は TPL を変える PR のレビューが見る。
  確かめていない項目は印なしにする（間違ったガードは、ガードが無いより悪い）

README「横断観察 A」の、curated table を meta-check の既定にする理由は、表への登録を型・表とコードの突き合わせ・導出のどれかで
強制したときに限り、explicit な表は新しい箇所も捕まえるガードになる、という形に書き直した。

### 運用への反映（#3488 / PR #3610）

- 分類を出発点に印を付けた。`[guard: …]` は 74 項目、`[judgment]` は 262 項目（#3610 の時点）で、ほかの項目は
  印なしのままである。`[guard: …]` はガードを開いて D4 を確かめた項目にだけ付け、
  確かめた記録を PR に残した
- 1 つの関数の case を列挙する項目（TPL-1755・1936・1944・1961・1967 の 22 項目）は、D4 の「閉じたクラスの全列挙」に
  当たるかでレビューの読みが割れた（新しい実装や経路を覆わないという指摘があった）。迷う項目は印なしにする規則に従い、
  印なしにした
- `docs/test-perspectives/README.md`（「チェックリスト項目の印」節・Validator・月次レビューの問い・横断観察 A）と
  `TEMPLATE.md` を更新した

## 理由

- 人も LLM も、項目を読んだその場で「これは機械が守っている / 自分が確かめる」が分かる
- 印の無い項目を unguarded とみなすので、新しく書いた項目の既定が正直な側になる。judgment は明示して外す
- 状態は印から一意に決まるので、どこかに宣言すると二重記帳になる（TPL-1032）。導出値は生成索引に出し、
  索引の鮮度は再生成 PR の `Validate` が保証する
- ガードの参照をパスにすれば、既存の実在検査に乗る。ガードが消えれば `validate` が落ちる
- 4 つ目の値 `judgment` が無いと、全項目が judgment の TPL が空虚に「機械が守っている」と読める

## 却下した案

- **印を HTML コメントで書く（`<!-- guard: path -->`）。** 読者に見せたい情報を隠すことになり、コメント内のパスは
  既存の実在検査に掛からない
- **項目番号とガードの対応表を別の節に置く。** 項目を並べ替えたり足したりすると番号がずれ、対応が黙って崩れる
- **チェックリストを frontmatter に移す。** 本文の散文（続き行・強調・リンク）を YAML に閉じ込め、読みやすさを大きく損なう
- **frontmatter に `enforcement` を宣言させ、導出値と照合する（#3038 の提案）。** drift は防げるが、印を直すたびに
  frontmatter も直す二重記帳が残り、増える情報が無い
- **自己申告だけ（照合しない）。** 申告がチェックリストからずれても誰も気づかない
- **語彙を `automated` / `partial` / `manual` にする（#3038 の提案）。** 全項目が judgment の TPL が空虚に automated になる。
  karasu では「手動」が受け入れテストの手動項目（ADR-3169）を指すので紛らわしい
- **変更ファイルから TPL を引く仕組みを同じ設計に含める（D5）。** 対応付けの鍵（パス）が frontmatter に無く、`scope.packages`
  は粗すぎる（`core` を持つ TPL が大半）。印と状態はその仕組みが無くても成り立つので、別の設計（#3486）に分けた

## 残っていること

- ガードの backlog の起票（#3489）。どんなガードを作るかは印に無く分類の `mechanism` 列にしか無いので、backlog は
  分類から起こす。起票し終えたら分類 CSV は使わず、印を唯一の記録にする（TPL-2810）
- 上の 22 項目を `[guard: …]` にするかどうかは未決である
- `guarded` の TPL でチェックリストをどこまで縮めてよいかの基準は、最初の月次レビューで実例を見てから README に書く

## 作らなかったもの

- 受け入れテスト: 変わるのは開発ツールと TPL 本文だけで、ユーザーが観測する挙動が無い。検証は tpl-tools のユニットテストと `pnpm tpl:validate` で行う
- proactive TPL: 本設計が破りうる原則「実在を検査された参照は、参照先が主張どおりの役割を果たすことまでは保証しない」は、TPL-2810 と TPL-2291 が既に持つ

## Related TPLs

- [TPL-2287](../test-perspectives/TPL-2287-detector-near-misses-are-the-spec.md): 印の検出器は、項目の文中に出る「judgment」「guard」を印と読まないことを near-miss 事例として持つ
- [TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md): ガードの参照はパスで書き、既存の実在検査に乗せる
- [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md): 状態を frontmatter に持たない理由（導出できる値を二重に持たない）
- [TPL-2810](../test-perspectives/TPL-2810-two-implementations-agree-only-when-measured.md): backlog の起票を終えたら分類 CSV を退役させ、CSV と印を並べて保守しない
- [TPL-3589](../test-perspectives/TPL-3589-exhaustiveness-contract-must-not-be-vacuous.md): 印のバックフィル中に、ガードとして引用していた型の契約が空だったと分かった（#3589）。ガードを開いて確かめる理由の実例
