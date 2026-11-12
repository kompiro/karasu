---
name: branch-review
description: >
  Review a branch diff (or a past PR) the way karasu needs: follow each change out of the diff to
  its callers in other packages, the prose that describes it, the en/ja twin, bundled copies, the
  rules whose paths match and the TPLs that name the changed files; keep only findings it verified;
  say whether this PR caused each one; and print a verdict and a table in Japanese for the
  maintainer plus English rows for the local review record. Runs forked, with no implementation
  context. Pass nothing for the current branch against origin/main, a PR number, a PR number
  with a commit (`123@<sha>`) to read the PR as it was at that commit, or a branch.
  Trigger when the user says: "ブランチをレビュー", "差分をレビュー", "branch-review",
  "review this branch", "review PR <n> with branch-review", or similar phrases.
argument-hint: "[<PR number> | <PR number>@<sha> | <branch>]"
context: fork
agent: general-purpose
---

# Branch Review

対象: `$ARGUMENTS`（空なら現在のブランチ）

## 到達状態

終わったとき、最後のメッセージに下の「出力」の形の報告があり、次が成り立っている。

- 表の指摘はすべて、コマンドの出力かファイルを読んで確かめてある。確かめられなかったものは表に入れず、
  「確かめられなかった懸念」に書いてある
- 各指摘に、この PR が原因か、base の時点からあったかが書いてある
- 「確認した範囲」に、下の観点 A〜F のそれぞれで何を見たかが書いてあり、見なかったものは
  「確認していない範囲」に書いてある。指摘が 0 件でも、この 2 つで「問題なし」と「見ていない」を読み分けられる

**レビューは読むだけで行う。** ファイルの編集・コミット・push・PR へのコメントをしない。書き換えて確かめたい
ときは scratchpad にコピーして行う。テストの実行はしてよいが、テストは作業ツリーのコードで走るので、
作業ツリーが `HEAD_REV`（下の 1.）と同じとき（引数が空のときなど）だけ結果を根拠にする。

## 1. 対象を決める

`$ARGUMENTS` に応じて、比べる 2 つのコミット `BASE` と `HEAD_REV` を決める。

| 引数 | 決め方 |
| --- | --- |
| 空 | `git fetch origin main` の後、`BASE=$(git merge-base origin/main HEAD)`、`HEAD_REV=HEAD`。未コミットの変更は対象外とし、あれば「確認していない範囲」に書く |
| PR 番号（`123` / `#123`） | `gh pr view <n> --json title,body,state,baseRefOid,headRefOid,closingIssuesReferences`。`git fetch origin main pull/<n>/head` の後、`BASE=$(git merge-base <baseRefOid> <headRefOid>)`、`HEAD_REV=<headRefOid>`。マージ済みの PR でもこの 2 つで当時の差分を読む |
| PR 番号とコミット（`123@<sha>`） | PR 番号と同じ。ただし `HEAD_REV=<sha>`、`BASE=$(git merge-base <baseRefOid> <sha>)` にして、PR の途中の状態を読む。PR の本文は今のもの（マージ済みならマージ時のもの）なので、`<sha>` より後の修正を前提にした記述は意図として読まない |
| ブランチ名 | `git fetch origin main` の後、手元にブランチがあれば（`git rev-parse --verify <branch>`）`HEAD_REV=<branch>` にして、まだ push していないコミットも読む。手元に無ければ `git fetch origin <branch>` して `HEAD_REV=origin/<branch>`。どちらも `BASE=$(git merge-base origin/main $HEAD_REV)` |

どの行でも main を一緒に fetch する。手元の `origin/main` が古いと、ブランチ名では merge-base が古い main のコミットに
落ちて、その後に main へ入った変更まで PR の差分として読むことになり、PR 番号では `baseRefOid` が手元に無く
`git merge-base` が `Not a valid commit name` で止まる。

差分は `git diff $BASE $HEAD_REV`、ファイルの一覧は `git diff --name-status $BASE $HEAD_REV`。
`HEAD_REV` が作業ツリーと違うときは、ファイルを `git show $HEAD_REV:<path>` で、検索を
`git grep -n <pattern> $HEAD_REV -- <pathspec>` で読む（作業ツリーを読むと別のコードを見ることになる）。

## 2. 意図を読む

何をする変更かを、PR の本文、閉じる Issue（`Closes #N`、無ければブランチ名やコミットの `#N`）、
コミットメッセージから読む。`gh issue view <N>` で Issue の本文とコメントを読む。

ここに書かれた主張（「挙動は変わらない」「すべての呼び出し元を直した」など）は確かめる対象であって、前提にしない。
意図と差分が食い違っていれば、それ自体が指摘になる。

## 3. 観点

A〜F をすべて行う。指摘の候補は、場所と「どんな入力や状況で何が起きるか」を言えるものだけを残す。

### A. 変更した行と、それを含む関数

差分の各 hunk を読み、hunk を含む関数やセクションの全体を読む。変えていない行でも、この変更で
誤りになる行は対象になる。条件の取り違え、境界の値、値が無いとき、`await` の抜け、例外の握りつぶし、
コピーした変数名の取り違えを見る。

テストも見る。変えた挙動を確かめるテストがあるか。既存のテストが古い挙動を前提にしたまま、
確かめずに通っていないか。

### B. 消した行が守っていたもの

消した行と置き換えた行のそれぞれについて、何を守っていたか（検査、エラーの経路、場合分け、テストの
ケース）を言い、新しいコードのどこで同じものが守られているかを探す。見つからなければ候補にする。

### C. 変更した名前の利用者

差分で変わった、または消えた名前を挙げる。関数・型・export、CLI のコマンドとオプション、診断コード、
設定のキー、ラベル名、ファイルのパス、出力の文言などが対象になる。
それぞれを repo 全体で検索し（`git grep -n <name> $HEAD_REV`）、使っている箇所が変更後も正しいかを確かめる。

- package の境界を越えて探す。`packages/core` の変更は app・lsp・cli・vscode・nest・skills から使われる
- コードだけでなく、`docs/**`・`examples/**`・`.claude/**`・`packages/skills/**`・`README*`・テストも探す
- `docs/adr/**` の本文は当時の記録なので、古い名前が残っていても指摘しない（`.claude/rules/adr.md`）

### D. 一緒に変わるべきもの

下の表のうち、変更に当てはまる行を確かめる。CI が検査している部分は CI に任せる。ここで見るのは、
CI が見ていない中身（記述が正しいか）である。

| 変更したもの | 一緒に確かめるもの | CI が見ている部分（ここでは見ない） |
| --- | --- | --- |
| 構文・解決・スタイル・整形（`packages/core/src/` の lexer / parser / resolver / style / formatter） | `docs/spec/*.md` と `*.ja.md` の該当箇所の記述、LSP の補完・hover・診断（`packages/lsp`）、`packages/vscode/syntaxes/*.tmLanguage.json`、`examples/` と AT の `krs` | 日英の見出しの構造（`spec-structure-sync`）、fence が parse できるか（`krs-fences`） |
| 診断コード・warning | `docs/spec/diagnostics.md` / `.ja.md` の説明文、`packages/i18n/src/en.ts` / `ja.ts` のメッセージ | catalog にコードがあるか（`diagnostics-catalog.test.ts`） |
| `docs/spec/**` | skill の本文（`packages/skills/skills/*/SKILL.md`）が spec の内容を述べている箇所の記述 | 同梱コピー（`packages/skills/skills/*/reference/`）がソースと一致するか（`skill-reference-bundle-sync`） |
| CLI のコマンド・オプション・出力 | `docs/tools/**`・`docs/guide/**`・skill（`packages/skills/skills/**`・`.claude/skills/**`）の手順と、そこに書かれた期待する出力 | コマンド名が存在するか（`skill-cli-refs`） |
| app の UI・ショートカット | `docs/tools/**` の説明、AT、`packages/e2e` | ショートカットの一覧（`app-shortcut-docs-sync`） |
| レビュー・CI・workflow の仕組み（`scripts/**`・`.github/**`） | `docs/process.md`・`docs/process/**`・`.claude/rules/**`・`.claude/skills/**`・PR テンプレートの記述 | ADR の assumptions（`adr:check-assumptions`） |
| 振る舞いの変更全般 | その振る舞いを説明している散文（docs、コメント、skill、エラーメッセージ） | なし |

日英の対は、片方だけ変わっていれば、もう片方が同じことを言っているかを読む。

### E. 規則

ルートの `CLAUDE.md` を読む。`.claude/rules/*.md` の frontmatter の `paths:` を読み、変更したファイルに
当てはまるルールを全部読む。差分がそのルールに反していれば候補にする。指摘にはルールのファイルと該当の文を書く。

ルールは `origin/main` と `$HEAD_REV` の両方で読む（`git show <rev>:<path>`）。作業ツリーのルールは、いまの
ブランチの未マージの変更を含みうるので使わない。`$HEAD_REV` 側には、この PR が足したり変えたりしたルールが入る。
`origin/main` 側は今のルールなので、過去の PR では当時に無かったルールも当たる。指摘の根拠にした文が `$BASE` にも
`$HEAD_REV` にも無い（PR の後で足された）ときだけ、F の TPL と同じく原因を「この PR」としたまま重大度を 1 段下げる。

### F. TPL

変更したファイルを名指しする TPL を引く。

```
pnpm -s exec tpl related --config tpl.config.json --limit 0 --changed-files <変更したファイル…>
```

返った TPL のチェックリストのうち、この変更に当てはまる項目を確かめる。TPL の一覧は今の `docs/test-perspectives/` の
ものなので、過去の PR では当時に無かった TPL も返る。その TPL で見つけた指摘は、原因を「この PR」としたまま
重大度を 1 段下げる。

## 4. 確かめる

候補ごとに、指摘を確かめる。コマンドを実行するか、該当のファイルを読む。確かめた方法は表の「確かめた方法」に
短く書く（例: 「`git grep` で呼び出し元 3 件を確認」「日英を比較」「テストを実行して失敗を確認」）。

- 確かめた結果、誤りでなかった候補は捨てる
- 確かめられなかった候補（実行環境が要る、判断が要るなど）は表に入れず、「確かめられなかった懸念」に書く
- 原因を決める。base の時点で同じ問題があったか（`git show $BASE:<path>`、`git grep -n <name> $BASE`）を見て、
  あれば「以前から」、この変更で生じたなら「この PR」とする。次の 2 つも「この PR」とする
  - この変更が直すべきだったのに直していない箇所（消した名前を使い続けている呼び出し元など）
  - この変更が書き換えた行やその文の中にある誤り。主張が base からあっても、書き直した時点でこの PR が引き受けている
- 指摘の場所が差分の hunk（`git diff -U0 $BASE $HEAD_REV`）の外なら、場所の後に「（差分外）」と書く。原因が
  「この PR」でも、差分外の指摘は PR では直さず Issue にするのが `docs/process/review.md`「指摘の重大度と対応」の
  扱いで、それを決めるのは呼んだ側である。引数が空のときは `node scripts/review/tier.ts in-diff <path> <line>` が
  同じ判定をする

## 5. 重大度

| 重大度 | 目安 |
| --- | --- |
| Critical | データやモデルを失う、セキュリティの境界を破る、main の CI を壊す、既存の利用者の手順が動かなくなる |
| Major | 利用者か開発者が普通に踏む誤った挙動。人が従う文書（spec・手順・skill）が事実と違う |
| Minor | 起きる条件が狭い誤り。読み手を迷わせる古い記述 |
| Trivial | 挙動にも理解にも影響しない表記 |

迷ったら重いほうにする。

## 出力

最後のメッセージを次の形にする。表示は日本語で書き、識別子とパスはそのまま書く。

````
**判定: <要修正 | 修正の推奨あり | 指摘なし>**（<Critical と Major の件数。この PR が原因のもの>）

| # | 重大度 | 場所 | 何が起きるか | 原因 | 確かめた方法 |
| --- | --- | --- | --- | --- | --- |
| 1 | Major | `path/to/file.ts:42` | <どんな入力や状況で、何が起きるか> | この PR | <方法> |

**確認した範囲**
- A: <読んだ関数やセクション>
- B: <消した行と、守り直されていた場所>
- C: <検索した名前と件数>
- D: <確かめた表の行>
- E: <読んだルール>
- F: <確かめた TPL。無ければ「該当なし」>

**確認していない範囲**
- <見なかったものと理由>

**確かめられなかった懸念**
- <あれば。無ければこの節を省く>

<details><summary>Local review record rows (English)</summary>

```json
[{"reviewer": "branch-review", "sev": "Major", "where": "path/to/file.ts:42", "finding": "<one sentence>", "disposition": ""}]
```

</details>
````

- 判定は、この PR が原因の Critical か Major があれば「要修正」、表が空なら「指摘なし」、それ以外（Minor と
  Trivial だけ、または Critical と Major が「以前から」だけ）は「修正の推奨あり」
- 表は重い順に並べる。原因が「以前から」の指摘は、同じ重大度の中で後ろに置く
- 英語の行は、PR 本文のローカルレビューの記録（`docs/process/review.md`「ローカルレビューの記録」）に移すためのもので、
  対応（`disposition`）は空にしておく。記録を書くのは呼んだ側である。`reviewer` の `branch-review` は
  review.md が挙げる名前（`engineering` など）に無いので、呼んだ側は `local-review-record.ts render` に
  `--reviewers "/branch-review (forked), coderabbit CLI --deep"` のように、このスキルを名指す `Reviewers:` の行を渡す
  （省くと `/engineering:code-review` と書かれる）
