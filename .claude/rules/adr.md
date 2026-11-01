---
paths:
  - "docs/adr/**/*.md"
  - "docs/design/**/*.md"
---

# ADR Authoring Rules

ADR（Architecture Decision Record）と、ADR に昇格させる前の Design Doc を
書くときのルール。

## 言語

- **タイトル（frontmatter `title:` + body H1 `# ADR-...:`）は日本語**
- **本文も日本語**（背景・決定・理由・却下した案 など）
- コード例・識別子・固有名詞（`Bun`, `Dependabot`, `Playwright`, `i18n`,
  `OPFS`, `draw.io`, `karasu render` など）は英語綴りのまま残す
- 詳細・経緯は **ADR-830** 参照

> OSS 化時に ADR タイトル・本文を英語に一括翻訳する想定があるため、
> flowery な日本語表現は避けて素直な訳にする。後で機械的に英訳できる
> 程度に抑えると将来の作業が軽い。

## 構造

ADR の必須要素は `docs/adr/TEMPLATE.md` を参照。frontmatter スキーマと
関係性セマンティクス（`supersedes` / `depends_on` / `related_to` など）の
詳細は `docs/adr/788-adr-knowledge-graph.md` および `pnpm adr:validate` の
バリデータが正となる。

### Frontmatter で必須なもの
- `id`、`title`、`status`、`date`、`topic`
- `topic` は `docs/adr/README.md` の見出しに対応する controlled vocabulary

### 本文で書くべき節
- **背景**: なぜ検討に至ったか
- **決定**: 何を決めたか（一文）
- **理由**: 採用根拠（箇条書き）
- **却下した案**: 検討した代替案と却下理由（必要に応じて）

## 既存 ADR を覆すとき

旧 ADR を書き換えず、新 ADR で `supersedes` する。旧 ADR は歴史的記録として残す。

**到達状態**: 既存 ADR に対する差分が frontmatter と supersede のステータス行だけで、
本文の散文が 1 行も変わっていない。

判定条件は 1 つ、**その行が frontmatter より下かどうか**。下なら触らない。**リンクの
張り替えも本文編集である** — 指し先のファイルが消えても、本文はそのまま残す。

例外は 1 つだけで、supersede されたときの body ステータス行（下記）。これは
`pnpm adr:validate` が frontmatter 側と対で検査する。

**現在の参照は frontmatter が持つ。** 後継 ADR へ導きたいなら `related_to` /
`superseded_by` に足す。毎日の再生成 PR（`pnpm adr:regenerate-pr`）が `graph.md` と
`effective.md` に反映するので、本文を書き換えなくても読者は辿り着ける。

本文に残った dead path を CI は追いかけない。`scripts/lint/record-source-paths.ts` が
`docs/adr/**` を走査対象から外しており、その理由（本文は当時の記録、現在の指し先は
frontmatter が持つ）をファイル冒頭に書いている。**ルールとガードはここで同じ線を引く。**
経緯は [ADR-2687](../../docs/adr/2687-adr-body-is-immutable.md)。

- 新 ADR の**背景に「何が変わったためこの再評価に至ったか」を書く**
- 旧 ADR の body ステータス行を `決定済み` から `Superseded by ADR-<n>` に更新する
- frontmatter は旧 ADR に `status: superseded` + `superseded_by: ADR-<n>`、新 ADR に
  `supersedes: [ADR-<n>]`。`pnpm adr:validate` が双方向整合をチェックする
- 新 ADR の「関連」に旧 ADR へのリンクを置く

## ADR から karasu 構造へリンクする（permalink）

**到達状態**: frontmatter の `permalink:` が taka 短縮リンク（`short`）と
in-repo `.krs`（`source`、必須）を持ち、`pnpm adr:check-permalinks` が通る。
記録（SoT）は `source` の `.krs` で、permalink はそれを見る pointer
（taka が消えても repo から復元でき、shortener を単一障害点にしない）。

```yaml
permalink:
  - short:  https://taka.kompiro.dev/TkrZQG    # taka 短縮リンク（クリック用 pointer）
    source: examples/payments/system.krs       # 必須: in-repo .krs（記録・復元元）
    view:   system                             # 任意: 既定 view
```

形式違反はバリデータが具体的なエラーで検出するので、ここには書き手が
自分で守るもの（検出不能・warning 止まり）だけを挙げる:

- 生の `/s?s=` payload（数 KB になりうる）は frontmatter にインラインしない。
  復元は `source` から
- 要素ドリルは `source` に anchor を添える（例 `system.krs#krs-system-payment-api`）。
  identity は author-given `id` であり `label` ではない
- repo-backed permalink（`karasu.kompiro.dev/<owner>/<repo>...`。`/r/` prefix は
  ADR-1961 で廃止、301 で bare に着地する）を `short` に貼るなら
  **full 40-hex の commit SHA で pin** する（`…@<40-hex>#krs-…`）。
  branch / tag / HEAD / 短縮 SHA は mutable で link rot する。非準拠は
  `adr:check-permalinks` が warning を出すが CI は落とさない
- 本文サマリ表（`## 構造（permalink）`）の自動生成は adr-tools 側 follow-up で
  未実装。当面は手書きしてよい

背景と詳細はツール非依存の L1 guide `docs/guide/adr-permalinks.md` と
[ADR-1829](../../docs/adr/1829-adr-permalink-convention.md) を参照。

## assumptions に書くこと

**`assumptions:` に書くのは ADR が決めたことだけで、日常の保守が動かす値は書かない。**
終わった状態は「その ADR の決定が変わらないかぎり `pnpm adr:check-assumptions` が
落ちない」こと。

判断基準は 1 つ、**caret / tilde のレンジを assert するなら major で止める**。

```
- "grep: package.json :: \"oxfmt\": \"\\^0.62.0\""   # 0.63.0 で落ちる
+ "grep: package.json :: \"oxfmt\": \"\\^0\\."      # 0.x のあいだ成立する
```

caret は「後ろは動いてよい」という宣言なので、その後ろを assert すると同じ行で
矛盾する。逆に exact pin（`"pkg": "1.2.3"`）はその版を固定したこと自体が決定なので、
版を書いてよい。

違反は `pnpm adr:validate` が落とす（`adr.config.json` の
`assumptions.rangePin: "error"`）。緩めた形の実例は
[ADR-1338](../../docs/adr/1338-fast-uri-override-pin.md) と
[ADR-2447](../../docs/adr/2447-dependabot-triage-2026-08-10.md)、経緯は
[ADR-2628](../../docs/adr/2628-adr-assumption-version-policy.md)。

## 編集後のチェック

```
pnpm adr:validate          # スキーマ・関係性整合
pnpm adr:check-assumptions # 本文の参照ファイル / 識別子の存在確認
```

**生成物（`docs/adr/effective.md`・`graph.md`・`graph/*.md`）は ADR の PR に含めない。**
毎日の routine が `pnpm adr:regenerate-pr` で生成物だけを変える PR を作ってマージする
（[#3416](https://github.com/kompiro/karasu/issues/3416)）。表示を確かめるために
`pnpm adr:regenerate` を手元で実行してよいが、生成物の差分は捨ててからコミットする
（`git restore --source=HEAD --staged --worktree -- docs/adr/effective.md docs/adr/graph.md docs/adr/graph && git clean -fdq -- docs/adr/graph`。stage 済みの生成物も戻る。
`git restore docs/adr` は未コミットの ADR 本体の編集まで戻すので使わない）。混ぜた PR は pre-push の `adr-generated-check` と required check の `Validate` が
止める。急いで `main` の生成物を更新したいときは、PR の外で `pnpm adr:regenerate-pr` を実行する。

`adr.config.json` の `paths.outputs`（出力先）を変える PR は、古い出力の削除だけを含め、
新しい出力先には書かない。新しい出力先は次の再生成 PR が作る（上のコマンドは今の出力先しか
戻さないので、新しい出力先に生成したファイルは自分で消す）。

**到達状態**: コミットした ADR の変更で次が通る。生成物を混ぜていれば、出力先がどこでも落ちる。

```
pnpm exec tsx scripts/adr/check-generated.ts --base origin/main
```

## Design Doc → ADR への昇格

**Design Doc のステータスが「採用」または「取りやめ」に確定したら ADR を作成する。**
`docs/design/<name>.md` の内容を ADR に集約し、元ファイルを削除する（履歴は PR / Issue
で追える）。新規 Design Doc の書き出しは `docs/design/TEMPLATE.md`。
昇格時のファイル名は `docs/adr/<n>-<name>.md`。`<n>` は **起点の GitHub Issue 番号**、
Issue が無ければ **その ADR を書いた PR の番号**を使う（[#2083](https://github.com/kompiro/karasu/issues/2083)）。
ゼロ埋めしない。GitHub の番号は大域的に一意なので、並行 PR 間で採番が衝突しない
（旧 `YYYYMMDD-NN` 形式では衝突が構造的に起きていた — #1985/#1986、#2086/#2092）。

同じ Issue から 2 本目の ADR を起こす場合は、**Issue 番号はその Issue を最もよく
表す 1 本に与え**、残りは各自の PR 番号を使う。

新規 Design Doc の雛形は `docs/design/TEMPLATE.md` を参照。

昇格フローの位置づけは `/start-dev` スキルのステップ 9.5 を参照。

## ADR PR の auto-merge

実装と切り離して ADR のみを記録する PR（昇格 PR・新規 ADR 追記 PR の
どちらも含む）は、下の適用条件を満たせば段階が Low になり、auto-merge を有効化する。

**到達状態**: 適用条件を満たす PR は `risk: low` ラベルとローカルレビューの記録を持ち、required check
「Review tier」を含む CI を待って auto-merge される。CodeRabbit の review 枠は使わない（Low には CodeRabbit が
走らない）。満たさない `docs(adr):` PR は、分類器が出した段階のラベルで通常どおり扱う
（`docs/process/review.md`「リスク段階」）。

```
node scripts/review/tier.ts classify   # "tier": "low" なら適用条件を満たしている
```

> この節は「PR のマージはユーザー確認を経る」という本リポジトリの既定運用に
> **優先する明示的な例外**。例外が成立するのは下の適用条件をすべて満たす
> 場合のみで、判定は分類器が差分という観測可能な事実で行う。
> 下の適用条件は分類器の規則を読める形にしたもので、食い違えば分類器が正しい。

手順は次の順で行う。**段階は PR を作る前にブランチの差分で判定する。**

```
git fetch origin main
git diff --stat origin/main...HEAD; git diff origin/main...HEAD   # 差分を読む
node scripts/review/tier.ts classify                    # 1. Low であることを確認
# 2. /engineering:code-review と CLI の指摘をローカルレビューの記録として本文に書く
gh pr create --draft --label "risk: low" --title "docs(adr): ..." --body-file <本文>
gh pr ready <N>
gh pr merge <N> --auto --squash --delete-branch
```

Low でなければ、出た段階のラベルを付けて draft で作り、`gh pr ready <N>` だけ実行して通常の PR として扱う。

### 適用条件（すべて満たすこと）

1. PR タイトルが `docs(adr): ` で始まる
2. **差分が「決定の記録」と「その記録に伴うリンクの整合」だけで構成されている**。
   具体的には次の 5 種以外の差分が 1 行もない:
   - **新しい ADR の追加**（生成物の `effective.md` / `graph.md` / `graph/*.md` は
     含めない。上の「編集後のチェック」）
   - **既存 ADR の frontmatter**、および supersede の body ステータス行
     （「既存 ADR を覆すとき」が許す範囲ちょうど。**本文の散文は入らない**）
   - 昇格対象 `docs/design/<name>.md` の **削除**（Design Doc 全体を ADR に昇格させて
     元ファイルを消すケース）。部分昇格（複数フェーズの一部だけ ADR 化し、残りを
     Design Doc に保持するケース。例: ADR-1168）は Design Doc の更新を含むので段階が
     Design になり、auto-merge せずに人間がレビューする
   - **その Design Doc を指していた参照を、新 ADR に張り替える差分**
     （`docs/adr/**` を除く任意のディレクトリ — `docs/acceptance/` /
     `docs/spec/` / `docs/test-perspectives/` / `docs/prd/` / `docs/roadmap.md`
     のいずれでもよい。削除でリンク切れになるものを繋ぎ直すのは昇格の一部で
     あって、別の判断ではない）。変えてよいのはリンク先と、リンクの文字列のうち
     ファイル名・パス・`ADR-<n>` の言い換えだけ。High のパス（`docs/spec/**` など）は
     張り替えだけでも High のままで、人間がレビューする
   - **AT（`docs/acceptance/*.md`）の ADR の行に、新 ADR へのリンクを足すだけの差分**。
     AT は Design Doc ではなく Issue を指すので（`.claude/rules/acceptance.md`）、
     昇格 PR は張り替えではなくリンクを足す。対象は冒頭のメタデータの並び（タイトル `# ` と
     最初の見出しの間）にある
     `- **設計 (ADR)**:` / `- **関連 ADR**:`（`関連ADR` / `ADR` も）の行だけで、許すのは 3 つ:
     値が新 ADR へのリンクだけの行を、別のメタデータ項目（その続きの行や子リストを含む）の後
     （次の行は別の項目かファイルの終わり、または空行で、その後が字下げされていない）に足す、空の値をそのリンクで
     埋める、既存の値の先頭か末尾にリンクを読点・カンマでつなぐ。リンクの文字列はリンク先の
     ADR のファイル名・パス・`ADR-<n>` に限り、リンク先は AT から解決して新 ADR になる相対パス
     （`../adr/<n>-<name>.md`）で、anchor は付けない。ほかのラベルの行、
     本文（最初の見出しより後）や frontmatter の位置、上の項目の続きの行や子リストの前、
     行頭や値の途中への挿入、同じ hunk の
     ほかの変更（手動項目のチェックなど）は外れる。AT 以外のファイルには使えない

   **Design Doc からの新規昇格はこの 5 種で閉じるので、auto-merge してよい** —
   新 ADR を足し、元の Design Doc を消し、他の記録の参照を
   張り替えるか ADR へのリンクを足す、で全部である。外れるのは**既存 ADR の本文を触ったとき**だけで、
   それは「既存 ADR を覆すとき」が禁じているので、そもそも書かれない差分である。
3. `origin/main` を fetch した直後のブランチの差分で 1〜2 を確認し（分類器が `low` を出す）、
   その直後に PR の作成から auto-merge までを実行する

### 補足

- ディレクトリではなく**差分の中身**で判定するのは、参照元が
  `docs/acceptance/` に限らないため（[#2259](https://github.com/kompiro/karasu/issues/2259)
  の昇格 PR が acceptance 1 行で止まった）。許可ディレクトリを数え上げる形だと、
  次に spec や TPL が参照元になったとき同じ理由でまた止まる
  （`.claude/rules/README.md` チェックリスト 5「単一の判定条件に畳む」）
- **ADR 本文だけが張り替えの対象外**なのは、そこだけ「staleness を受け入れる」と
  決めた面だからである。他の記録は真であり続けることを期待され、
  `record-source-paths.ts` がそれを機械で見る。ADR 本文は当時の記録なので同じ
  ガードから外してある。同じ線を 2 箇所で引き直さないために、張り替えの可否も
  この線に揃える（[#2687](https://github.com/kompiro/karasu/issues/2687)）
- **張り替えとリンクの追加以外の変更が同じファイルに混ざったら例外は成立しない。** とくに
  `docs/acceptance/` の受け入れ条件そのもの（TC の増減、手動項目のチェック
  状態）を変える差分が含まれるなら、**通常通りユーザー確認を経る** — AT は
  「何を検証したか」の記録なので、レビューなしに書き換わってよい対象ではない
- 適用条件のいずれかが満たされない場合（例: `packages/**` のファイルが 1 つでも
  差分に含まれる場合）も同様に例外を適用せず、通常通りユーザー確認を経る
- PR を作った後に差分を足すときは、**push の前に** auto-merge を解いて draft に戻す。
  push した瞬間に auto-merge が確認前の差分をマージしうるからである。
  ```
  gh pr merge <N> --disable-auto
  gh pr ready <N> --undo
  ```
  push 後は手順 1（段階の判定）からやり直し、足したコミットの指摘と対応で記録を作り直す。
  - Low のとき: `gh pr ready <N>` で draft を外してから auto-merge を戻す
    （`gh pr merge <N> --auto --squash --delete-branch`）。draft のままではマージされない
  - Low でないとき: ラベルを出た段階に付け替えて `gh pr ready <N>` で draft を外し、通常の PR として扱う。
    `risk: high` / `risk: design` なら、CodeRabbit のレビューはこのときに走る
- Low でない段階では auto-merge を有効にしない。CI の途中で有効にすれば Review tier が落とすが、
  CI が通った後に有効にした PR はそのままマージされ、check では止められない
- `--auto` を使うので CI 完走前にコマンド発行して構わない（GitHub 側が
  required check 通過を待つ）
- リポジトリ設定で `allow_auto_merge=true` 済み
- ブランチ保護で required check が落ちた場合は通常通り失敗する
  （auto-merge は強制ではなく「揃ったら入れる」セマンティクス）

### マージ後の後始末

**到達状態**: auto-merge した PR の worktree とローカルブランチが残っていない。
`git fetch --prune && git branch -vv | grep '\[gone\]'` が何も出さない。

`--auto` はマージを待たずに手を離すので、この PR は `/hane:start-dev` の
ステップ 9（クリーンアップ）を通らない。`--delete-branch` で remote branch は
消えるためローカルは `[gone]` になるが、**worktree は残り続ける**。溜まると次の
Issue の作業中に無関係な worktree として現れる（実例: #2435 と #2448 の worktree が
2 件残り、#2451 の片付け中に気づいた）。

掃除は `/commit-commands:clean_gone` — `[gone]` ブランチとその worktree をまとめて
削除する。auto-merge を有効化した直後にこの後始末を予約するか、上の grep が空に
なることを次のセッション開始時に確認する。
