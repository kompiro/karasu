# PR の変更ファイルから関係する TPL を引く

- **日付**: 2026-11-01
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3486](https://github.com/kompiro/karasu/issues/3486)（#3038 の D5 から分けた）
  - 関連 ADR: [ADR-1192](../adr/1192-test-perspective-library.md)（TPL の運用）、[ADR-1357](../adr/1357-tpl-tools-extraction.md)（照会と検査は `@kompiro/tpl-tools` に置き、karasu は設定と本文だけを持つ）、[ADR-3359](../adr/3359-pr-before-after-screenshots.md)（`gh pr create` の後に Claude Code のフックで促す先例）
  - tpl-tools ADR-17（本文のコードスパンが名指すパスの実在検査。`--source-prefix`）
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
| TPL 数 | active 185（2026-11-01、`main` 9b614c1f） |
| `scope.packages` | 必須。パッケージ名の配列。`tpl validate` が実在パッケージか検査する |
| 本文のパス | `## 関連テスト` などのコードスパンに書く。`tpl validate --source-prefix packages --source-prefix scripts` が、その接頭辞のパスが実在するか検査する（tpl-tools ADR-17） |
| 本文がパスを 1 つ以上名指す TPL | 182 / 185 |
| `tpl related` | `<topic>` と任意の `--package` で絞る。変更ファイルは受け取らない |
| 名指しの補完 | #3485 が、分類が根拠に挙げたのに本文が名指していなかったテストを 75 TPL に足す |

## 測定

鍵の候補ごとに、直近にマージされた 120 PR（2026-10-28〜11-01。うち Dependabot 12）で
「PR の変更ファイルに当たる TPL が何件出るか」を数えた。docs だけの PR では TPL を引く必要が
薄いので、docs 以外のファイルに触れた 72 PR を主に見る。

正解の代わりに、PR 本文が引用した TPL（`TPL-<n>`、作業の前に作成者が当てた TPL）を使い、
各鍵がその何件を拾うかを「引用の再現率」とした。引用は不完全（当てたのに書かなかった、
書いていない TPL も関係した）なので、これは上限ではなく目安である。

| 鍵 | 件数の中央値 | p90 | 最大 | 0 件の PR | 引用の再現率 |
| --- | ---: | ---: | ---: | ---: | ---: |
| K0 `scope.packages` | 66.5 | 124 | 155 | 27 / 72 | 70 / 100 |
| K1 本文が名指すファイル（テストなら対応するソースも） | 8 | 23 | 68 | 4 / 72 | 70 / 100 |
| K1v K1 のうち `packages/` `scripts/` の下だけ | 4 | 16 | 66 | 18 / 72 | 63 / 100 |
| K2 名指すファイルのディレクトリ | 45 | 103 | 148 | 2 / 72 | 85 / 100 |

名指すファイルの重みで並べて上位 N 件に切った場合の引用の再現率:

| 上位 N | K1 | K1v |
| ---: | ---: | ---: |
| 5 | 43 / 100 | 42 / 100 |
| 10 | 61 / 100 | 55 / 100 |
| 15 | 66 / 100 | 60 / 100 |

重みは「変更ファイルごとに、そのファイルを名指す TPL の数の逆数」の和。`docs/spec/syntax.md` は
46 TPL が、`packages/core/src/parser/parser.ts` は 12 TPL が名指すので、そこへの一致だけでは
上位に来ない。

読み取れること:

1. **`scope.packages` では引けない。** 中央値 66 件は読まれない。0 件の 27 PR は
   `packages/` の外（workflow・scripts）だけを触った PR で、そこでは逆に何も出ない。
2. **本文が名指すファイル（K1）が、件数と再現率の釣り合いが最もよい。** 中央値 8 件で、
   K0 と同じ 70% を拾う。ディレクトリに広げる（K2）と再現率は 85% に上がるが、件数は
   K0 と同じ桁に戻る。
3. **上位 10 件に切っても、拾える引用の 9 割近くが残る。** K1 では 70 件のうち 61 件、K1v では
   63 件のうち 55 件。大きな PR（最大 68 件）でも読む量を抑えられる。
4. **取りこぼす 30 件の多くは、触ったファイルを本文が名指していない TPL である。** 例:
   renderer の変更で引用された TPL-1954 は、#3485 で `edge-routing-lanes.test.ts` を
   名指すようになる。残りは workflow やレビューの仕組みを触った PR で引用された運用系の TPL
   （TPL-1725・TPL-2786・TPL-3286 など）で、個別のファイルではなく「workflow 全般」に
   関係するため、ファイル名では結べない。

#3485 で 75 TPL の名指しを補った後の本文で測り直すと、K1v は中央値 5・p90 20・引用の再現率
64 / 100、上位 10 件で 53 / 100 だった。名指しが増えた分だけ件数は少し増えるが、桁は変わらない。

測定のスクリプトはこの PR には含めない（ADR-2419: 分析の生成物は main に入れない）。手順は
「直近の merged PR の `files` と本文を `gh pr list --json` で取り、各 TPL の本文のコードスパンから
パスを抜き、上の 4 つの規則で突き合わせる」で、#3486 にコメントで残す。

## 制約・前提

- 照会と frontmatter のスキーマは `@kompiro/tpl-tools` に置く。karasu は設定と TPL 本文、
  それに karasu の作業の流れに差し込む部分（フックなど）だけを持つ（ADR-1357）。
  tpl-tools に karasu の語彙（`packages/core` などのパスやパッケージ名）を埋め込まない
- 出すことが目的で、判定はしない。judgment 項目は機械で確かめられないので、出した TPL を
  「当てたか」で PR を止めると、「該当なし」と書くだけの定型文を育てる
- #3038 の項目の印・導出状態とは独立に成り立つ。印が無くても本件は動き、本件が無くても
  印は動く
- out of scope: TPL の本文構成の変更、`scope.packages` の廃止、topic の見直し

## 検討した選択肢

### 鍵

#### 案 A: TPL ごとにパスの glob を frontmatter に持たせる

`.claude/rules` の `paths:` と同じ発想で、`scope.paths: ["packages/core/src/renderer/**"]` の
ような glob を TPL ごとに書く。

**メリット**

- TPL の作者が関係する範囲を直接言える。運用系の TPL（「workflow 全般」）も書ける

**デメリット**

- 185 TPL に誰かが書かなければならない。書く基準が人によって揺れ、粗く書けば K2 の
  ように件数が膨らむ
- 本文の `## 関連テスト` と別に、パスの一覧をもう 1 つ手で持つことになる。片方だけ
  更新されて drift する（TPL-1032）

#### 案 B: 本文が名指すパスから導く

`tpl validate` が既に実在を検査している、本文のコードスパンのパスをそのまま鍵にする。
テストファイル（`x.test.ts`）を名指していれば、対応するソース（`x.ts`）にも一致させる。

**メリット**

- 新しいフィールドも埋め戻しも要らない。新しい TPL は `## 関連テスト` を書いた時点で
  鍵を持つ
- 鍵が実在検査を通ったパスなので、ファイルの移動・削除で鍵が黙って死なない
- 測定で件数と再現率の釣り合いが最もよい（K1）

**デメリット**

- 本文がファイルを名指していない TPL は引けない（運用系の TPL）
- 「歴史として触れたパス」も鍵になる。ただし実在検査がそれを `absent-path-next-line` で
  宣言させるので、存在しないパスは一致しない

#### 案 C: 案 B を基本にし、案 A を任意で足す（採用）

鍵は本文のパス（案 B）から導く。それで引けない TPL だけが、任意の `scope.paths` に glob を
書いて鍵を足す。`scope.paths` は本文のパスを置き換えず、和にする。

**メリット**

- 埋め戻しが要らない。書くのは、取りこぼしが観測された TPL だけ
- 運用系の TPL も引ける

**デメリット**

- tpl-tools のスキーマ変更が 1 つ要る（任意フィールドなので既存の TPL は壊れない）

### 名指すパスのうちどれを鍵にするか

tpl-tools の `--source-prefix`（実在検査の対象を決める既存の設定）の下にあるパスだけを使う
（K1v）。karasu では `packages/` と `scripts/` で、`docs/spec/syntax.md` のような多数の TPL が
名指す文書は鍵にしない。

- K1 との差は件数の中央値 8→4、引用の再現率 70→63。落ちる 7 件は spec や `docs/process.md` に
  触れた PR での一致で、それらの PR は別の経路（spec 監査、`.claude/rules`）で TPL に当たる
- 実在検査と同じ集合なので、鍵に入るパスはすべて実在が保証される。プレフィックスの外の
  パスは、検査されないので移動しても誰も気づかない
- 運用系で `.github/workflows/` を鍵にしたい TPL は、案 C の `scope.paths` で足す

### 件数の目標

読まれる件数を「上位 10 件」とする。p90 の PR でも 16 件（K1v。#3485 後は 20 件）で、
上位 10 件に切ると K1v が拾える引用の 87%（55 / 63）が残る。11 件目以降は件数と全件を出すコマンドだけを示す。

並べ順は、変更ファイルごとに「そのファイルを名指す TPL の数」の逆数を足した値の降順。
多数の TPL が名指す中心的なファイル（`parser.ts`・`warnings.ts`）だけに当たった TPL は
下に行き、変更が局所的なファイルに当たった TPL が上に来る。

### 届け方

#### 案 1: PR へのコメント（CI）

PR ごとに CI が一覧をコメントする。

- 全 PR に通知が増える。人の作成者にもボットの作成者にも同じコメントが付く
- 一覧が届くのは PR を開いた後で、本文を書く時点に間に合わない

#### 案 2: pre-push フック（lefthook）

- push のたびに出る。1 PR で何度も push すると同じ一覧を何度も見る
- 出力はターミナルに流れて消え、PR 本文に残らない

#### 案 3: `.claude/rules` 風のトリガー

TPL ごとに `paths:` のルールファイルを生成して、編集時に読み込ませる。

- 185 ファイルを生成して `.claude/rules` に置くことになる。編集のたびに複数の TPL 本文が
  文脈に入り、他のルールが効かなくなる（`.claude/rules/README.md`「どの層に書くか」）
- Claude Code 以外の作成者には届かない

#### 案 4: draft PR を作ったときに Claude Code のフックで出す + 人向けのコマンド（採用）

`gh pr create` の後に走る PostToolUse フック（ADR-3359 の before/after と同じ形）が、
PR の変更ファイルから上位 10 件を引き、「当てた TPL を本文で引用し、当てなかったなら
理由を書く」よう促す。人の作成者には同じ一覧を出す `pnpm tpl:changed`（中身は
`tpl related --changed-files`）を用意し、`docs/process.md` の手順 10 に 1 行足す。

- karasu の PR は手順 10 で必ず draft として作られ、draft のうちは CI もレビューも走らない。
  一覧を見て直す余地がまだある時点に届く
- 結果は PR 本文の引用として残り、後から読める
- 止めない。フックは出すだけで、引用が無くても PR は作られる

## 比較

| 論点 | 採用 | 主な却下案 | 決め手 |
| --- | --- | --- | --- |
| 鍵 | 本文のパス + 任意の `scope.paths`（案 C） | glob を全 TPL に書く（案 A） | 埋め戻し不要。実在検査済みのパスなので drift しない |
| 鍵にするパス | `--source-prefix` の下（K1v） | 本文の全パス（K1） | 多数の TPL が名指す文書を除き、件数を半分にする。実在が保証される |
| 件数 | 上位 10 件、重み付きの順 | 全件 | p90 でも読める量。拾える引用の 87% が残る |
| 届け方 | draft PR 作成時のフック + `pnpm tpl:changed`（案 4） | PR コメント / pre-push / ルール生成 | 本文を書く時点に届き、結果が本文に残る。止めない |
| 止めるか | 止めない | 引用が無ければ失敗 | judgment は機械で確かめられず、定型文を育てるだけ |

## 現時点の方針

**鍵は案 C、届け方は案 4 を採る。** 本文が名指すパス（`--source-prefix` の下、テストなら対応する
ソースも）を鍵にし、取りこぼしが観測された TPL だけ `scope.paths` で足す。draft PR を作った
直後に上位 10 件を出して引用を促し、止めはしない。

### 実装の指針

tpl-tools の変更、karasu での採用、取りこぼしの補完の順に進める。各段の Issue は本 Design Doc の
マージ後に起こす。

1. **tpl-tools**（tpl-tools の Issue と ADR）
   - `tpl related --changed-files <path...>`（と `--base <ref>` で `git diff --name-only <ref>...HEAD` を読む形）を足す。
     鍵は本文のコードスパンのうち `--source-prefix` の下のパスと、`scope.paths` の glob。
     テストファイルの名指しは対応するソースにも一致させる（`.test.` / `.spec.` を外した名前。
     規則は設定で変えられるようにし、既定は TS/JS の慣習だけを持つ）
   - 重み付きで並べ、`--limit`（既定 10）で切り、切った件数を出す
   - frontmatter に任意の `scope.paths: string[]` を足す。`tpl validate` は glob が少なくとも
     1 つのファイルに一致するか検査する（一致しない glob は、パスの実在検査と同じく腐った鍵）
   - パスの抜き出しは `source-paths.ts` の既存の走査を再利用する
2. **karasu で採用する**
   - tpl-tools を上げ、`pnpm tpl:changed` を足す（`tpl related --changed-files --base origin/main`）
   <!-- absent-path-next-line: the hook script this design creates (#3486) -->
   - `scripts/tpl/changed-files-reminder.sh`（仮）を PostToolUse フックに足す。`gh pr create` の出力の
     PR URL から変更ファイルを取り、上位 10 件と促しを `additionalContext` で返す。想定外の状態では
     何も出さずに終わる（ADR-3359 のフックと同じ方針）
   - `docs/process.md` の手順 10 に「`pnpm tpl:changed` の一覧のうち当てた TPL を本文で引用する」を
     足す（仕組みは ADR を指す。`docs/process.md` にスクリプトのパスを書かない）
   - フックのテスト（stub の gh で、一致あり・一致なし・URL なし）
3. **取りこぼしを補う**
   - 運用系の TPL（TPL-1725・TPL-2786・TPL-3286 など、測定で workflow や
     レビューの仕組みの PR に引用された TPL）に `scope.paths` を書く
   - 以後は、PR で引用したのに一覧に出なかった TPL を見つけたら、その PR で `scope.paths`
     か `## 関連テスト` を足す
4. AT は作らない。ユーザーが観測する挙動は無く、検証は tpl-tools のユニットテスト、
   フックのテスト、`pnpm tpl:validate` で行う
5. ADR 昇格: 2 のマージ後に、本 Design Doc を `docs/adr/3486-tpl-changed-files-recall.md` に
   昇格し、本ファイルを同じ PR で削除する。tpl-tools 側の実装判断は tpl-tools の ADR に置く

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（開発ツールと TPL frontmatter の任意フィールドだけ）
- ドキュメント更新: `docs/process.md` 手順 10、`docs/test-perspectives/README.md`（`scope.paths` の書き方と、
  `## 関連テスト` が想起の鍵にもなること）
- テスト・examples への影響: なし

## 未解決の問い / 決めないこと

- **フィードバックの仕組み**: 「引用したのに出なかった」TPL を機械で見つけて知らせるか。
  PR 本文の引用と一覧を突き合わせれば出せるが、引用自体が不完全なので、まずは人が気づいたときに
  足す運用で様子を見る
- **重みの見直し**: 逆数の和は単純な既定値である。上位 10 件で拾えない引用が目立つようなら、
  ファイル数での正規化などを tpl-tools 側で試す
- **Design Doc の作成時に出すか**: Design Doc を書く時点ではまだ変更ファイルが無いので、本件の
  対象にしない。そこは今どおり `tpl related <topic>` を使う
