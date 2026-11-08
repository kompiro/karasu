---
id: ADR-3706
title: 変更ファイルから TPL を引く鍵に、ガードの印と後から足した接頭辞を含める
status: accepted
date: 2026-11-08
topic: testing
authors: [kompiro]
supersedes:
  - ADR-3486
related_to:
  - ADR-1192
  - ADR-1357
  - ADR-2810
  - ADR-3038
  - ADR-3359
  - ADR-2419
  - ADR-2687
scope:
  packages: []
  concerns:
    - ci
assumptions:
  - "file: scripts/tpl/changed-files-reminder.sh"
  - "grep: .claude/settings.json :: scripts/tpl/changed-files-reminder.sh"
  - "grep: package.json :: \"tpl:changed\": \"tpl related --config tpl.config.json --base origin/main\""
  - "grep: tpl.config.json :: \"sourcePrefixes\": \\[[^\\]]*\"packages\""
  - "grep: tpl.config.json :: \"sourcePrefixes\": \\[[^\\]]*\"scripts\""
  - "grep: tpl.config.json :: \"sourcePrefixes\": \\[[^\\]]*\"\\.github\""
  - "grep: tpl.config.json :: \"sourcePrefixes\": \\[[^\\]]*\"functions\""
  - "grep: tpl.config.json :: \"sourcePrefixes\": \\[[^\\]]*\"docs/design\""
  - "grep: .github/PULL_REQUEST_TEMPLATE.md :: pnpm tpl:changed"
  - "grep: docs/test-perspectives/README.md :: #### 変更ファイルから引く"
---

# ADR-3706: 変更ファイルから TPL を引く鍵に、ガードの印と後から足した接頭辞を含める

- **日付**: 2026-11-08
- **ステータス**: 決定済み
- **関連**:
  - [ADR-3486](3486-tpl-changed-files-recall.md)（supersedes。鍵・件数・届け方を決めた。元の測定と却下した案はそちらにある）
  - 測定: #3486 のコメント 2 件。[印の測定](https://github.com/kompiro/karasu/issues/3486#issuecomment-6722522308)（`measure_guard.py`）と、[接頭辞を含む 3 条件の測定](https://github.com/kompiro/karasu/issues/3486#issuecomment-6722802526)（`measure_keys.py`、docs だけの PR を含む集計）。どちらも結果とスクリプトを載せ、ADR-2419 に従い main に入れない
  - 接頭辞を足した PR: [#3693](https://github.com/kompiro/karasu/pull/3693)（[#2732](https://github.com/kompiro/karasu/issues/2732)。`root_cause_file` の引用の検査）
  - [ADR-1192](1192-test-perspective-library.md)（TPL の運用）、[ADR-1357](1357-tpl-tools-extraction.md)（照会と検査は `@kompiro/tpl-tools` が持つ）、[ADR-2810](2810-tpl-source-path-check-ownership.md)（本文のパスの検査は tpl-tools の CLI が持つ）、[ADR-3038](3038-tpl-enforcement-status.md)（チェックリスト項目の印）、[ADR-3359](3359-pr-before-after-screenshots.md)（`gh pr create` の後にフックで促す先例）
  - tpl-tools 側の実装判断: tpl-tools ADR-41（鍵・順位・glob の記法）、ADR-48（`root_cause_file` の引用の検査）

## 背景

ADR-3486 は、PR の変更ファイルから関係する TPL を引く鍵・件数・届け方を決めた。その後、決めたときの
前提が 2 つ動いた。

1. **ガードの印の影響が未測定のまま残っていた。** ADR-3038 の D1 がチェックリスト項目に足す
   `[guard: <path>]` もコードスパンなので鍵に入る。ADR-3486 は影響を小さいと見込んだが、測らずに
   未解決の問いに残した。2026-11-08 時点で印は 35 TPL に 75 個ある
2. **接頭辞が 3 つから 5 つに増えた。** #3693 が `root_cause_file` の引用を検査するために、
   `sourcePrefixes` に `functions` と `docs/design` を足した。tpl-tools は 1 つの接頭辞の一覧を
   `tpl validate` と `tpl related` で共有するので（ADR-3486 の決定）、鍵も同時に広がった。
   ADR-3486 は「`docs/` は鍵の接頭辞に足さない」と決めていたが、この変更は鍵の判断としては
   見直されていなかった

本 ADR は、2 つの影響を測ったうえで、今の鍵をそのまま採ると決め直す。

## 決定

ADR-3486 の決定を引き継ぎ、鍵には次の 2 つを含める。ガードの印が名指すパスを鍵から外す扱いや、
`docs/design` を照会だけから外す扱いは設けない。

- ガードの印が名指すパス（本文のほかのコードスパンと同じ扱い）
- `sourcePrefixes` の 5 つの接頭辞（`packages` `scripts` `.github` `functions` `docs/design`）の
  下のパス。接頭辞の一覧は `tpl validate` と `tpl related` で 1 つのまま共有する

引き継ぐ決定は次のとおり（理由と却下した案は ADR-3486）。

- **鍵:** TPL の本文が `sourcePrefixes` の下で名指すファイルと、名指したテストに対応するソース、
  それに任意の `scope.paths` の glob。ディレクトリを指すスパンは鍵にしない。存在しないパスも鍵に
  残す（tpl-tools ADR-41）
- **件数:** 重み（変更ファイルごとに、そのファイルを名指す TPL の数の逆数の和）の順に上位 10 件。
  11 件目以降は件数と、全件を出すコマンドだけを示す
- **置き場所:** 照会とスキーマは tpl-tools（ADR-41）、karasu は設定・TPL 本文・フックだけを持つ（ADR-1357）
- **届け方:** `gh pr create` の直後に Claude Code のフック（`scripts/tpl/changed-files-reminder.sh`）が
  一覧を出し、`## TPL impact` での引用を促す。人の作成者には `pnpm tpl:changed`（stacked PR は
  `pnpm tpl:related --base origin/<base>`）。引用が無くても PR は止めず、当てなかった TPL に理由も求めない
- **フックの作り:** PostToolUse と PostToolUseFailure の両方に置く。`gh pr create` の出力の URL から
  PR を取り、`gh pr view` の `headRefName` と `baseRefName` を読む。変更ファイルは PR の base から数える
  （stacked PR で下の PR のファイルを数えない）。`git worktree list` で head のブランチの worktree を
  探してそこで `tpl` を実行し、`$CLAUDE_PROJECT_DIR` やフックの入力の `cwd` では実行しない。0 件と
  伝えるのは、tpl-tools の標準エラーに `No active TPL names a changed file.` が出たときだけで、
  この文言は contract test が見張る。worktree が見つからないときやほかの想定外の状態では何も出さない
- **横断的な原則の TPL:** 鍵では引かない。設計時の `tpl related <topic>` で当てる
- **人の作成者:** フックは届かず、`pnpm tpl:changed` を思い出すことに頼る。人の作成者が増えたら、
  ADR-3486 が却下した PR へのコメント（CI）を足す
- **検証:** AT は作らない。tpl-tools のユニットテスト、`scripts/tpl/changed-files-reminder.test.ts`、
  `pnpm tpl:validate` で確かめる

## 測定

インストール済みの `tpl related --changed-files <PR の変更ファイル> --limit 0`（`@kompiro/tpl-tools`
0.1.0、`main` 776a79a0 の TPL 本文）を、3 つの条件で同じ PR に当てた。

- **今:** そのままの TPL と `tpl.config.json` の接頭辞 5 つ
- **接頭辞 3 つ:** 接頭辞を `--source-prefix` で `packages` `scripts` `.github` に戻す
- **接頭辞 3 つ・印なし:** さらに TPL の写しから `[guard: ...]` の印を消す（ADR-3486 の条件）

PR の選び方と引用の数え方は ADR-3486 の測定と同じ（Dependabot と docs だけの PR を除き、タイトルと
本文が引用した active な `TPL-<n>` を正解の代わりにする）。期間は ADR-3486 と同じ 2026-10-22〜11-01
と、印が入った後の 11-02〜11-08 の 2 つ。

| 期間（コードを含む PR / 引用） | 条件 | 中央値 | p90 | 最大 | 0 件 | 10 件超 | 再現率 | 上位 10 件 | 精度 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10-22〜11-01（84 本 / 126 件） | 接頭辞 3 つ・印なし | 5.5 | 18.5 | 50 | 16 | 24 | 91 | 82 | 13% |
| | 接頭辞 3 つ | 5.5 | 19.0 | 50 | 16 | 25 | 92 | 82 | 13% |
| | 今 | 5.5 | 19.0 | 50 | 16 | 25 | 92 | 82 | 13% |
| 11-02〜11-08（39 本 / 128 件） | 接頭辞 3 つ・印なし | 3.0 | 12.0 | 28 | 5 | 5 | 61 | 61 | 30% |
| | 接頭辞 3 つ | 3.0 | 12.0 | 29 | 5 | 6 | 61 | 61 | 30% |
| | 今 | 3.0 | 12.0 | 29 | 5 | 6 | 61 | 61 | 30% |

docs だけの PR を含めても（10-22〜11-01 は 135 本、11-02〜11-08 は 73 本）、条件の間の差は同じ
PR にしか出なかった。

- **印:** 一覧が変わったのは 2 つの期間で 3 本ずつ、どれも 1 件増えただけだった。印が名指すパス
  88 個のうち 82 個は、同じ TPL の本文（主に `## 関連テスト`）がすでに名指している。印だけが足す鍵は
  6 個で、一覧を変えたのは TPL-2254（`.github/workflows/ci.yml`）と TPL-1417 だけだった。引用を
  1 件拾い（#3476 の TPL-2254、11 位）、上位 10 件から引用を押し出した PR は無い
- **接頭辞:** `functions` と `docs/design` で一覧が変わったのは、10-22〜11-01 の 3 本（#3451・#3462・
  #3469）だけだった。どれもコードと Design Doc を同時に変えた PR で、`docs/design/system-view-grouping.md`
  を名指す TPL-1927 が 1 件増えた。引用はされていない。本文が `docs/design/` を名指す TPL は
  TPL-1927 と TPL-3126 の 2 つ、`functions/` を名指す TPL も 2 つしかない

絶対値は ADR-3486 の表とは比べられない。今の TPL 本文と tpl-tools の規則（存在しないパスも鍵に
残す）で数えており、同じ期間でも `gh pr list --search merged:` が返す PR は 147 本（ADR-3486 の
取得は 120 本）だった。11-02〜11-08 の引用には、11-07 に入ったフック自身の影響も含まれうる。

## 理由

- **どちらの影響も、件数を目に見えて増やさない。** 中央値・上位 10 件の再現率・精度はどの条件でも
  同じだった。動いたのは、印による p90 の 0.5 と、最大値・10 件超の PR 数・再現率の 1 ずつだけである。ADR-3486 が鍵の候補を比べたときの差（K0 と K1g で中央値
  66.5 と 3.5）に比べて無視できる
- **印の鍵は、ガードを触る PR に TPL を出す。** 印が名指すのはその項目を守るガードで、ガードを
  変える PR はその TPL を読むべき変更である。外すには印を読み分ける規則が tpl-tools に要るが、外して
  減る件数はほぼ無い
- **`docs/design` では、ADR-3486 が `docs/` を外した理由より得失の小ささが勝る。** 外した理由は 2 つで、
  `docs/` を足しても再現率が 1 件しか増えないことと、`docs/spec/syntax.md`（46 TPL が名指す）の
  ような文書が鍵に入ることだった。`docs/design` は再現率を 1 件も増やさなかったが、増える件数も
  3 本の PR に 1 件ずつで、ADR-3486 が避けた文書のような件数の膨張は起きない。`docs/design/` を
  名指す TPL は 2 つで、Design Doc は ADR への昇格で消える一時的な文書である。接頭辞の目的は
  `root_cause_file` と本文のパスの検査（#3693）で、照会での得失はその副作用として小さい
- **Design Doc が消えたら、`tpl validate` が昇格 PR を止める。** 消えたパスを名指す TPL があると
  `tpl validate` が失敗するので（`at-check-coverage.yml` が `docs/design/**` の変更で走らせる）、昇格 PR は
  TPL を ADR へ付け替えるか、`absent-path-next-line` で消えたパスと宣言する。宣言したパスは鍵に
  残るが、消えたファイルを変える PR はもう無いので、一覧には出ない。ガードの印が名指すパスは
  宣言で黙らせられないので（`docs/test-perspectives/README.md`）、付け替えるしかない。今 Design Doc を
  名指す印は無い
- **接頭辞の一覧は 1 つに保つ。** 照会用と検査用に分けると、`tpl.config.json` に同じような一覧が
  2 つ並び、片方だけ更新されて drift する（TPL-1032）。分けて得られる差は 3 本の PR の 1 件だけだった

## 却下した案

- **ガードの印を鍵から外す。** 上の理由のとおり、外して減る件数がほぼ無く、ガードを触る PR から
  TPL が消える
- **照会だけ接頭辞を 3 つに戻す（`--source-prefix` を `tpl:changed` とフックに渡す）。** 一覧が
  `tpl.config.json` と 2 か所に分かれ、`tpl:validate` と `tpl related` で鍵がずれる。得られる差は
  上の 3 本だけだった
- **ADR-3486 の本文を直す。** ADR の本文は書き換えない（ADR-2687）。決め直しは新しい ADR で行う

## 未解決の問い

ADR-3486 の未解決の問いのうち、ガードの印の影響は本 ADR で閉じた。次の 3 つは残る。

- **フィードバックの仕組み:** 「引用したのに出なかった」TPL を機械で見つけて知らせるか。まずは
  人が気づいたときに `## 関連テスト` か `scope.paths` を足す運用で様子を見る
- **重みの見直し:** 名指しが増えるほど順位が効きにくくなる。目立つようなら、ファイル数での正規化
  などを tpl-tools 側で試す
- **Design Doc の作成時:** まだ変更ファイルが無いので対象にしない。今どおり `tpl related <topic>` を使う
