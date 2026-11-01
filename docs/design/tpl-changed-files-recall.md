# PR の変更ファイルから関係する TPL を引く

- **日付**: 2026-11-01
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3486](https://github.com/kompiro/karasu/issues/3486)（#3038 の D5 から分けた）
  - 関連 ADR: [ADR-1192](../adr/1192-test-perspective-library.md)（TPL の運用）、[ADR-1357](../adr/1357-tpl-tools-extraction.md)（照会と検査は `@kompiro/tpl-tools` に置き、karasu は設定と本文だけを持つ）、[ADR-3359](../adr/3359-pr-before-after-screenshots.md)（`gh pr create` の後に Claude Code のフックで促す先例）
  - tpl-tools ADR-17（本文のコードスパンが名指すパスの実在検査。`--source-prefix`。接頭辞を設定ファイルに置く案は「利用者がいないうちは早い」として見送った）
  - 関連 Design Doc: [`tpl-enforcement-status.md`](tpl-enforcement-status.md)（#3038。D5 で本件を分けた）
  - 関連 TPL: [TPL-1725](../test-perspectives/TPL-1725-gated-test-suite-detection-gap.md)（起動条件が対象を覆わないと検出が抜ける）、[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)（手で持つ対応表は drift する）

## 背景・課題

TPL のチェックリスト項目の多くはプログラムで判定できない。#3038 の分類（2026-10-02）では
804 項目のうち 222 項目が judgment（設計時の判断、または人が行為をしたかの問い）だった。
これらに対して決定論的にできるのは、判定ではなく「この変更にどの TPL を見せるか」である。
今それは、作成者が正しい topic で `tpl related <topic>` を打つことを思い出すかどうかで決まる。

#3038 は `tpl related --changed-files` を提案したが、今の frontmatter には変更ファイルと
TPL を結ぶ鍵が無いので、設計を分けた（`tpl-enforcement-status.md` の D5）。

- `scope.packages` は粗すぎる。`packages/core` の下を変えると、`core` を持つ TPL がほぼ全部出る
- `known_consumers` は機能名で、パスではない

本 Design Doc は、鍵・出す件数の目標・届け方・置き場所を決める。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| TPL 数 | active 185（2026-11-01、`main` 395b961f） |
| `scope.packages` | 必須。パッケージ名の配列。`tpl validate` が実在パッケージか検査する |
| 本文のパス | `## 関連テスト` などのコードスパンに書く。karasu は `tpl validate --source-prefix packages --source-prefix scripts` で、その接頭辞のパスが実在するか検査する（tpl-tools ADR-17）。接頭辞は CLI のフラグで、`tpl.config.json` には無い。ディレクトリを名指すスパンもある（`packages/core/src/renderer` など） |
| 本文が `packages/` `scripts/` `.github/` の下のファイルを名指す TPL | 157 / 185（#3485 後は 176） |
| `tpl related` | `<topic>` と任意の `--package` で絞る。変更ファイルは受け取らない |
| 名指しの補完 | #3485 が、分類が根拠に挙げたのに本文が名指していなかったテストを 75 TPL に足す |

## 測定

直近にマージされた 120 PR（2026-10-22〜11-01）から、Dependabot の 12 PR と docs だけの 36 PR を
除いた 72 PR で、鍵の候補ごとに「PR の変更ファイルに当たる TPL が何件出るか」を数えた。

正解の代わりに、PR のタイトルと本文が引用した TPL（`TPL-<n>`）を使う。作成者が作業中に当てた
TPL で、72 PR のうち 48 PR に計 100 件ある。各鍵がその何件を拾うかを「再現率」、出した件数の
うち引用された割合を「精度」とした。引用は不完全（当てたのに書かなかった、書いていない TPL も
関係した）なので、精度は下限、再現率は目安である。

鍵の候補は、K0 を除いて「本文のコードスパンが名指す、実在するファイル」から作る。glob と
ディレクトリは含めず、frontmatter の `root_cause_file` も含めない（実在検査の対象ではなく、
`:257` のような行番号付きのものもある）。テストファイルを名指していれば、対応するソース
（`x.test.ts` → `x.ts`）にも一致させる。

| 鍵 | 件数の中央値 | p90 | 最大 | 0 件の PR | 再現率 | 精度 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| K0 `scope.packages` | 66.5 | 124 | 155 | 27 / 72 | 70 / 100 | 2% |
| K1 `packages/` `scripts/` `.github/` `docs/` `examples/` の下 | 4 | 16 | 46 | 12 / 72 | 62 / 100 | 12% |
| K1v `packages/` `scripts/` の下 | 3 | 14 | 46 | 24 / 72 | 57 / 100 | 13% |
| K1g `packages/` `scripts/` `.github/` の下 | 3.5 | 14 | 46 | 20 / 72 | 61 / 100 | 13% |

件数を重みで並べ、上位 N 件に切った場合の再現率（同点は TPL 番号順）。重みは「変更ファイル
ごとに、そのファイルを名指す TPL の数の逆数」の和で、多数の TPL が名指すファイル
（K1g では `parser.ts` と `warnings.ts` がそれぞれ 12 件）だけに当たった TPL は下に行く。

| 上位 N | K1 | K1g |
| ---: | ---: | ---: |
| 5 | 44 | 44 |
| 10 | 59 | 59 |
| 15 | 61 | 60 |
| 全件 | 62 | 61 |

#3485 で名指しを補った後の本文で測り直すと、K1g は中央値 3.5・p90 19・再現率 62 / 100・
精度 12%、上位 10 件で 54 / 62 だった。名指しが増えて再現率は 1 件上がるが、件数が増えるぶん
上位 10 件に残る割合は 97%（59 / 61）から 87%（54 / 62）に下がる。

読み取れること:

1. **`scope.packages` では引けない。** 中央値 66 件、精度 2% は読まれない。0 件の 27 PR は
   `packages/` の外（workflow・scripts）だけを触った PR で、そこでは逆に何も出ない。
2. **本文が名指すファイルが、件数と再現率の釣り合いがよい。** K1g は中央値 3.5 件で、精度は
   K0 の 6 倍になる。K1 との差は `docs/` と `examples/` への一致だけで、再現率は 1 件しか違わない。
3. **`.github/` を外す（K1v）と運用系の一致を落とす。** K1g との差 4 件は workflow への一致で、
   0 件の PR も 4 本増える。
4. **上位 10 件に切っても、拾える引用の大半が残る。** `main` で 59 / 61、#3485 後で 54 / 62。
5. **0 件の PR が 20 / 72 ある。** 18 本は運用系・ツール類の PR（どの TPL も名指していない
   `scripts/` の下のスクリプト、`.claude/`、workflow、lockfile、changeset だけのリリース PR）で、
   残り 2 本は `packages/vscode` と `packages/e2e` のテストまわり。0 件は「当てる TPL が無い」では
   なく「この鍵では分からない」なので、そう表示する（下の「届け方」）。

### 取りこぼしの内訳

#3485 後の K1g が拾えない引用 38 件を、TPL と PR の関係で分けた。

| 種類 | 件数 | 例 | 本設計での扱い |
| --- | ---: | --- | --- |
| 運用系の PR（workflow・`.claude/`・レビューやリリースのスクリプト）で引用された、仕組み全般の TPL | 15 | TPL-1725・TPL-2786・TPL-3286（#3458）、TPL-2786・TPL-2804（#3407） | `scope.paths` で足す（実装の指針 3） |
| TPL が同じ領域の別のファイルを名指していて、触ったファイルを名指していない | 15 | 行数予算の分割で生まれたファイル（TPL-2044 #3469、TPL-2174 #3473、TPL-1666 #3462）、隣のファイル（TPL-1927 / TPL-1954 / TPL-3132 #3320、TPL-3137 #3329） | 名指しの補完で直る。PR で引用したのに出なかったら、その PR で `## 関連テスト` を足す（実装の指針 3） |
| 特定のファイルに結びつかない横断的な原則 | 8 | TPL-168・TPL-1207（#3331）、TPL-1032・TPL-2802（#3329）、TPL-219（#3324）、TPL-239（#3327） | 引かない。広い glob を書くとほぼ全 PR に出て件数が K0 に戻る。今どおり設計時の `tpl related <topic>` で当てる |

測定のスクリプトはこの PR には含めない（ADR-2419: 分析の生成物は main に入れない）。手順は
#3486 にコメントで残す。

## 制約・前提

- 照会と frontmatter のスキーマは `@kompiro/tpl-tools` に置く。karasu は設定と TPL 本文、
  それに karasu の作業の流れに差し込む部分（フックなど）だけを持つ（ADR-1357）。
  tpl-tools に karasu の語彙（`packages/core` などのパスやパッケージ名）を埋め込まない
- 出すことが目的で、判定はしない。judgment 項目は機械で確かめられないので、出した TPL を
  「当てたか」で PR を止めると、「該当なし」と書くだけの定型文を育てる
- #3038 の項目の印・導出状態が無くても本件は動き、本件が無くても印は動く。#3038 の D1 が足す
  `[guard: <path>]` もコードスパンなので本件の鍵に入るが、D4 のガードはファイル集合を走査する
  テストで、名指すのはガード自身のテストファイルである。一致するのはガードかその対になる
  ソースを触った PR だけなので件数への影響は小さいと見込み、#3038 のスライス 3 の後に測り直す
- out of scope: TPL の本文構成の変更、`scope.packages` の廃止、topic の見直し

## 検討した選択肢

### 鍵

#### 案 A: TPL ごとにパスの glob を frontmatter に持たせる

`.claude/rules` の `paths:` と同じ発想で、`scope.paths: ["packages/core/src/renderer/**"]` の
ような glob を TPL ごとに書く。

**メリット**

- TPL の作者が関係する範囲を直接言える。運用系の TPL（「workflow 全般」）も書ける

**デメリット**

- 185 TPL に誰かが書かなければならない。書く基準が人によって揺れ、粗く書けば K0 のように
  件数が膨らむ
- 本文の `## 関連テスト` と別に、パスの一覧をもう 1 つ手で持つことになる。片方だけ
  更新されて drift する（TPL-1032）

#### 案 B: 本文が名指すファイルから導く

`tpl validate` が実在を検査している、本文のコードスパンのパスのうちファイルを指すものを
そのまま鍵にする。

**メリット**

- 新しいフィールドも埋め戻しも要らない。新しい TPL は `## 関連テスト` を書いた時点で
  鍵を持つ
- 鍵が実在検査を通ったパスなので、ファイルの移動・削除で鍵が黙って死なない
- 測定で件数と再現率の釣り合いがよい

**デメリット**

- 本文がファイルを名指していない TPL は引けない（運用系の TPL）
- 「歴史として触れたパス」も鍵になる。ただし実在検査がそれを `absent-path-next-line` で
  宣言させるので、存在しないパスは一致しない

#### 案 C: 案 B を基本にし、案 A を任意で足す（採用）

鍵は本文のファイル（案 B）から導く。それで引けない TPL だけが、任意の `scope.paths` に glob を
書いて鍵を足す。`scope.paths` は本文のパスを置き換えず、和にする。

**メリット**

- 埋め戻しが要らない。書くのは、取りこぼしが観測された TPL だけ
- 運用系の TPL も引ける

**デメリット**

- tpl-tools のスキーマ変更が 1 つ要る（任意フィールドなので既存の TPL は壊れない）

### 名指すパスのうちどれを鍵にするか

**実在検査の接頭辞の下で、ファイルを指すパスだけを鍵にし、karasu はその接頭辞に `.github` を
足す**（K1g）。

- 鍵と実在検査を同じ集合にする。鍵に入るパスはすべて実在が保証され、接頭辞の外の
  パス（移動しても誰も気づかないパス）は鍵にならない
- ディレクトリを指すスパンは鍵にしない。完全一致では変更ファイルに当たらず、前方一致にすると
  `packages/core` のようなスパンが K0 と同じ件数を連れ戻す。ディレクトリ単位で引きたい TPL は
  `scope.paths` に glob を書く
- `.github` を足しても、今の 185 TPL はすべて実在検査を通る（2026-11-01 に
  `--source-prefix .github` を足して `tpl validate` を実行して確認）。足せば運用系の一致
  （上の読み取り 3）を、手で `scope.paths` を書かずに拾える
- `docs/` と `examples/` は足さない。K1 との差は再現率で 1 件で、`docs/spec/syntax.md`
  （46 TPL が名指す）のような多数の TPL が名指す文書を鍵から外せる
- 接頭辞は今 `tpl validate` の CLI フラグなので、`tpl related` と共有できるよう tpl-tools の
  設定ファイル（`tpl.config.json`）の項目にする（実装の指針 1）。tpl-tools ADR-17 はこの案を
  「利用者がいないうちに出荷するスキーマに入れるのは早い」として見送った。今は karasu という
  利用者がいて、同じ接頭辞を `validate` と `related` の 2 か所で使うので、見送った理由が
  無くなっている。値は karasu の設定に書き、tpl-tools には既定値を持たせない

### 件数の目標

読まれる件数を「上位 10 件」とする。K1g は p90 の PR でも 14 件（#3485 後は 19 件）で、
上位 10 件に切っても拾える引用の 87〜97% が残る。11 件目以降は件数と、全件を出す
コマンドだけを示す。精度は 12〜13% で、出した 10 件のうち作成者が引用するのは 1 件程度になる。
これは「読んだうえで当てないと判断する」件数で、判定を求めない（制約・前提）以上、10 件が
読める上限と考える。名指しが増えるほど上位 10 件に残る割合は下がるので、重みの見直しは
未解決の問いに残す。

### 届け方

#### 案 1: PR へのコメント（CI）

PR を開いたときに CI のジョブが一覧をコメントする。

- 人の作成者にも届く。Claude Code を使わない作成者にとっては唯一の、思い出さなくても届く経路
- コメントを書くジョブに `pull-requests: write` が要り、workflow の権限が広がる
- 全 PR に通知が増え、push のたびに更新するならその通知も増える
- Claude が作成者のときは、コメントを読みに行く手順が別に要る

#### 案 2: pre-push フック（lefthook）

- push のたびに出る。1 PR で何度も push すると同じ一覧を何度も見る
- 出力はターミナルに流れて消え、PR 本文に残らない

#### 案 3: `.claude/rules` 風のトリガー

TPL ごとに `paths:` のルールファイルを生成して、編集時に読み込ませる。

- 185 ファイルを生成して `.claude/rules` に置くことになる。編集のたびに複数の TPL 本文が
  文脈に入り、他のルールが効かなくなる（`.claude/rules/README.md`「どの層に書くか」）
- Claude Code 以外の作成者には届かない

#### 案 4: draft PR を作った直後に Claude Code のフックで出す + 人向けのコマンド（採用）

`gh pr create` の後に走るフック（ADR-3359 の before/after と同じく PostToolUse と
PostToolUseFailure の両方）が、PR の変更ファイルから上位 10 件を引き、「当てた TPL を本文の
`## TPL impact` で引用する」よう促す。人の作成者には同じ一覧を出す `pnpm tpl:changed`
（中身は `tpl related --base origin/main`）を用意し、`docs/process.md` の手順 10 と PR テンプレートの
`## TPL impact` の案内に 1 行足す。

- 一覧は Claude の文脈に同じターンで入る。作成者が読みに行く手順が要らない
- PR はまだ draft で、CodeRabbit も分単位の CI も走っていない。本文を直し、必要ならコードも
  直してから ready にできる
- 結果は PR 本文の引用として残り、後から読める
- 止めない。当てなかった TPL に理由を書くことも求めない（定型文を育てるため）。0 件のときは
  「この PR の変更ファイルを名指す TPL はない。設計時の `tpl related <topic>` で当てる」と出す
- 弱点は案 3 と同じく、Claude Code を使わない作成者には届かないこと。人の経路はコマンドを
  思い出すことに頼り、背景・課題の問題が残る。測定期間の人の作成者による 108 PR のうち
  105 本は本文に Claude Code の署名があり、今の karasu ではこの経路がほぼ全体を覆う。人の作成者が増えたら案 1 を足す

## 比較

| 論点 | 採用 | 主な却下案 | 決め手 |
| --- | --- | --- | --- |
| 鍵 | 本文のファイル + 任意の `scope.paths`（案 C） | glob を全 TPL に書く（案 A） | 埋め戻し不要。実在検査済みのパスなので drift しない |
| 鍵にするパス | 実在検査の接頭辞の下のファイル。karasu は `packages` `scripts` `.github`（K1g） | `docs/` `examples/` も含める（K1）/ `.github` なし（K1v） | 鍵と実在検査を同じ集合にする。運用系の一致を落とさない |
| 件数 | 上位 10 件、重み付きの順 | 全件 | p90 でも読める量。拾える引用の 87〜97% が残る |
| 届け方 | draft PR 作成直後のフック + `pnpm tpl:changed`（案 4） | PR コメント（案 1）/ pre-push / ルール生成 | 作成者の文脈へ同じターンで届き、結果が本文に残る。workflow の権限を広げない。人の作成者には届きにくい（増えたら案 1 を足す） |
| 止めるか | 止めない | 引用が無ければ失敗 | judgment は機械で確かめられず、定型文を育てるだけ |

## 現時点の方針

**鍵は案 C、届け方は案 4 を採る。** 実在検査の接頭辞（karasu では `packages` `scripts` `.github`）の
下で本文が名指すファイルを鍵にし、テストなら対応するソースにも一致させる。取りこぼしが観測された
TPL だけ `scope.paths` で足す。draft PR を作った直後に上位 10 件を出して引用を促し、止めはしない。
横断的な原則の TPL は鍵では引かず、今どおり設計時の `tpl related <topic>` に任せる。

### 実装の指針

tpl-tools の変更、karasu での採用、取りこぼしの補完の順に進める。各段の Issue は本 Design Doc の
マージ後に起こす。

1. **tpl-tools**（tpl-tools の Issue と ADR。ADR-17 の見送り理由が無くなったことを書く）
   - 実在検査の接頭辞を設定ファイルの項目にする。`--source-prefix` は設定を上書きする形で残す
   - `tpl related` に、変更ファイルを渡す `--changed-files <path...>` と、`git diff --name-only <ref>...HEAD`
     を読む `--base <ref>` を足す（どちらか一方）。鍵は本文のコードスパンのうち接頭辞の下で
     ファイルを指すパスと、`scope.paths` の glob。テストファイルの名指しは対応するソースにも
     一致させる（`.test.` / `.spec.` を外した名前。規則は設定で変えられるようにし、既定は TS/JS の
     慣習だけを持つ）
   - 重み付きで並べ（同点は id 順で決定的に）、`--limit`（既定 10）で切り、切った件数を出す
   - frontmatter に任意の `scope.paths: string[]` を足す。`tpl validate` は glob が少なくとも
     1 つのファイルに一致するか検査する（一致しない glob は、パスの実在検査と同じく腐った鍵）
   - glob の照合は `*` `**` `?` だけを扱う小さな照合器を tpl-tools に書く。tpl-tools は
     `engines.node >=20` で `path.matchesGlob` が使えず、ADR-17 は依存を足さない方針を取っている。
     `.claude/rules` の `paths:` もこの 3 つで足りている。それ以上の記法が要るようになったら、
     依存を足すか Node の下限を上げるかを tpl-tools の ADR で決める
   - パスの抜き出しは `source-paths.ts` の既存の走査を再利用し、ディレクトリを指すものを除く
2. **karasu で採用する**
   - tpl-tools を上げ、`tpl.config.json` に接頭辞 `packages` `scripts` `.github` を書く。
     `package.json` の `tpl:validate` からフラグを外す
   - `pnpm tpl:changed`（`tpl related --base origin/main`）を足す
   <!-- absent-path-next-line: the hook script this design creates (#3486) -->
   - `scripts/tpl/changed-files-reminder.sh`（仮）を PostToolUse / PostToolUseFailure のフックに足す。
     `gh pr create` の出力の PR URL から PR を取り（ADR-3359 のフックと同じ）、`gh pr view` の
     `headRefName` と `baseRefName` を読む。`git worktree list --porcelain` から `headRefName` を
     checkout している worktree を探し、そこで `tpl related --base origin/<baseRefName>` を実行して、
     上位 10 件と促しを `additionalContext` で返す。フックは `$CLAUDE_PROJECT_DIR`（main の checkout）
     から起動するので、そこで実行すると PR で足した `## 関連テスト` が見えない。フックの入力の
     `cwd` は `cd X && gh pr create` のような呼び方で PR の worktree を指さないので使わない。
     base を PR から読むので、stacked PR（`docs/process/stacked-pr.md`）でも下の PR のファイルを
     数えない。worktree が見つからないときやほかの想定外の状態では何も出さずに終わる（ADR-3359 の
     フックと同じ方針）
   - `docs/process.md` の手順 10 に「`pnpm tpl:changed` の一覧のうち当てた TPL を本文で引用する」を
     足す（仕組みは ADR を指す。`docs/process.md` にスクリプトのパスを書かない）。
     `.github/PULL_REQUEST_TEMPLATE.md` の `## TPL impact` の案内にも同じ 1 行を足す
   - フックのテスト（stub の gh で、一致あり・0 件・URL なし・worktree なし・base が `main` でない PR）
3. **取りこぼしを補う**
   - 運用系の TPL（TPL-2786・TPL-2804・TPL-3286 など、測定で `.github/` を名指さずに運用系の PR に
     引用された TPL）に `scope.paths` を書く
   - 以後は、PR で引用したのに一覧に出なかった TPL を見つけたら、その PR で `## 関連テスト` か
     `scope.paths` を足す。横断的な原則の TPL には広い glob を書かない
4. AT は作らない。ユーザーが観測する挙動は無く、検証は tpl-tools のユニットテスト、
   フックのテスト、`pnpm tpl:validate` で行う
5. ADR 昇格: 2 のマージ後に、本 Design Doc を `docs/adr/3486-tpl-changed-files-recall.md` に
   昇格し、本ファイルを同じ PR で削除する。tpl-tools 側の実装判断は tpl-tools の ADR に置く

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（開発ツールと TPL frontmatter の任意フィールドだけ）
- ドキュメント更新: `docs/process.md` 手順 10、`.github/PULL_REQUEST_TEMPLATE.md`、
  `docs/test-perspectives/README.md`（`scope.paths` の書き方と、`## 関連テスト` が想起の鍵にもなること）
- テスト・examples への影響: なし

## 未解決の問い / 決めないこと

- **フィードバックの仕組み**: 「引用したのに出なかった」TPL を機械で見つけて知らせるか。
  PR 本文の引用と一覧を突き合わせれば出せるが、引用自体が不完全なので、まずは人が気づいたときに
  足す運用で様子を見る
- **重みの見直し**: 逆数の和は単純な既定値である。#3485 後に上位 10 件に残る割合が下がったように、
  名指しが増えるほど順位が効きにくくなる。目立つようなら、ファイル数での正規化などを tpl-tools 側で
  試す
- **Design Doc の作成時に出すか**: Design Doc を書く時点ではまだ変更ファイルが無いので、本件の
  対象にしない。そこは今どおり `tpl related <topic>` を使う
