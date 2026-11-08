# karasu — PR のレビュー

> PR ワークフロー（`docs/process.md`）の手順 8 に入る前に読む。手順 8〜11 のレビューの順序、段階の判定、指摘の扱い、ローカルレビューの記録を持つ。
>
> `docs/process.md` と同じ規律で書く。「今どうするか」だけを書き、経緯は ADR / Issue に置く
> （[ADR-2351](../adr/2351-process-md-holds-instructions.md)）。

**CodeRabbit の初回レビューは `/engineering:code-review` の修正を反映したコードに当てる。** CodeRabbit が
自分でレビューするのは、High と Design の PR が draft を外れたときの 1 回だけで、それ以降は頼んだときだけ
レビューする。どちらも review 枠を 1 回使い（rate limit で弾かれた試行は使わない）、枠の補充レートは直近 7 日の
利用量が増えるほど下がる。PR を ready で開いてから `/engineering:code-review` を当てると、直す前の
コードと直した後のコードで 2 回使う。レビューは PR を作る前に base ブランチとの差分へ当てるので、
修正は PR の最初の push に含まれる。順序の決定と計測値は
[ADR-2898](../adr/2898-draft-first-code-review.md)、レビュー対象を base との差分にした決定は
[ADR-3052](../adr/3052-review-branch-diff-before-draft-pr.md)。

**CodeRabbit CLI は ready の前に 1 回だけ回す。** CLI の枠は PR の review 枠とは別に
数えられる（`coderabbit usage` で残りを見る）ので、ready の前に CLI の指摘を直しておけば、
同じ種類の指摘で PR のラウンドを使わずに済む。指摘が 0 件になるまで回し直すことはしない。
1 回に数分かかり、同じ差分でも実行ごとに違う指摘が出るので、回し続けると PR のラウンドと
同じ待ちが ready の前に移るだけになる。High と Design では CLI の後にも PR の初回レビューは走り、
Medium と Low では CLI が CodeRabbit の唯一の目になる。
`/coderabbit-converge` のラウンドでは、push の前にそのラウンドの修正分だけへ 1 回当てる
（ADR-3340）。CLI が使えない環境（未インストール・
未認証・枠切れ）では `docs/process.md` の手順 9 を飛ばし、手順 11 の ready を `KARASU_LOCAL_REVIEW_SKIPPED=<理由> gh pr ready <n>`
で実行する（理由を付けない ready は拒否される）。Low の PR は CLI を飛ばせない（下の「リスク段階」）ので、
draft を経ずに作る Low の ADR の PR でも CLI が使えなければ、`risk: medium` に上げて draft で作る。決定は
[ADR-3326](../adr/3326-coderabbit-cli-once-before-ready.md) と ADR-3342。

### リスク段階

**到達状態**: どの PR にも段階のラベル（`risk: low` / `risk: design` / `risk: medium` / `risk: high`）が付き、
required check「Review tier」が通っている。この check は、ラベルが変更から判定した段階より低い PR、Low でないのに
auto-merge が有効な PR、High 以外でローカルレビューの記録が無いか HEAD を覆っていない PR を落とす。ラベルの無い PR は
High として扱う。

```
node scripts/review/tier.ts classify          # PR を作る前、ブランチの差分で判定する
node scripts/review/tier.ts check --pr <n>    # CI と同じ判定
```

段階は変更から決め、作成者の判断や差分の行数では決めない。PR の段階は変更したファイルの段階の最大値で、
どの規則にも当たらないパスは Medium になる。作成者が信頼リスト（`kompiro`）にいなければ High になる。
規則の正本は分類器で、ここには要約だけを置く。

| 段階 | 変更したもの | PR での CodeRabbit | 通す条件 |
| --- | --- | --- | --- |
| Low | `docs/test-perspectives/**`・`docs/guide/**`・新しいテストファイル（既存のテストファイルの変更は Medium）、新しい ADR、ADR の昇格（Design Doc の削除、リンクの張り替え、ADR へのリンクの追加）、既存 ADR の frontmatter、ADR の生成物と TPL の索引だけを変える再生成 PR | 回さない | 記録と CI が通れば auto-merge（再生成 PR は記録なしで、スクリプトが REST でマージする） |
| Design | `docs/design/**` | ready の直後に 1 回だけ。ゲートにしない | 記録と人間のレビュー |
| Medium | ほかのすべて（`packages/*`・`docs/acceptance/**`・`examples/**`・既存 ADR の本文など） | 回さない | 記録と、人間の判断。描画やレイアウトが変わる PR（`rendering-change` ラベル、下）は人間が preview で動作を確かめる |
| High | workflow・release・依存の変更・`docs/spec/**`・`docs/concepts*.md`・`docs/process.md`・`docs/process/**`・`.claude/rules/**`・`.coderabbit.yaml`・レビューの仕組み（`scripts/review/**`・`scripts/coderabbit/**`・`scripts/render-equivalence/**`・`.claude/skills/**` など）・セキュリティの境界（下）・言語の挙動（下） | Critical / Major の未対応が無くなるまで回す（再レビューは 3 回まで） | 人間が High のファイルと `## For Reviewers` 節を読む。合意済みの Design Doc が裏付ける PR は、節と、summary が並べるファイル（セキュリティの境界と、決定・言語の挙動のパスの外の High のファイル）を読む（下の「High の PR で人間が読むもの」） |

- **セキュリティの境界**：信頼できない入力（他人の `.krs`、URL、webview のメッセージ、ディスクのパス）を受ける
  コード。`packages/nest/**`、`karasu serve` と `render` のエンドポイント・ファイルアクセス、`packages/core/src/fs/**`、
  VS Code の webview とのやりとり、SVG のエスケープ、app のサニタイズ箇所。足した行か消した行に
  `dangerouslySetInnerHTML`・`innerHTML`・`DOMPurify`・`openExternal`・`eval(`・`new Function` を含むコードも
  ここに入る
- **言語の挙動**：`packages/core/src/` の lexer・parser・resolver・spec・style・formatter・annotations、
  `language-version.ts`、既定のスタイル、LSP の診断。`refactor` の PR もいまは High になる（等価の検査が required に
  なったら Medium に下げる。#3540）
- テストファイルはこの 2 つの規則から外れ、新しいファイルは Low、既存のファイルの変更は Medium のまま。ただし
  セキュリティの境界のテストから行を消す変更は High になる

- **`rendering-change` ラベル**：check「Render equivalence」が merge base と HEAD で描画・診断・整形の出力に差を
  見つけたか、比較を終えられなかった PR に、workflow が付ける。次の比較で差が無ければ外す。マージは止めない。比較が
  走るのは `render-equivalence.yml` の `paths`（`packages/**`、`package.json`、`pnpm-lock.yaml`、比較のスクリプトなど）に
  触れる PR だけなので、examples や AT だけを変える PR には付かない（`pnpm pr:shots` で before/after を見せる）。
  パスの判定は push ごとではなく PR 全体の差分で行うので、PR がそのパスを変えているあいだは、どの push でも比較が走って
  ラベルを判定し直す。そのパスの変更をすべて戻した PR では比較が走らず、最後の判定のラベルが残る。判定の表は
  `scripts/render-equivalence/label.ts`
- **差分がセキュリティの境界か `.github/workflows/**` に触れる PR は、段階とは別に `/security-review` を当てる**
  （分類器の `securityReview` が true になる）
- **段階のラベルは draft のうちに付ける。** CodeRabbit は `risk: high` / `risk: design` の付いた PR だけを、draft を
  外れたときにレビューする。ラベルを上げるのはよい（人間が CodeRabbit に見せたいと判断した PR など）。ready の後に
  `risk: high` へ上げた PR でレビューが始まらなければ、`@coderabbitai full review` を投げる。Low の ADR の PR だけは
  draft を経ずに作るので、`gh pr create --label` で付ける（`.claude/rules/adr.md`「ADR PR の auto-merge」）
- **Low の auto-merge は「PR のマージはユーザー確認を経る」という既定運用への例外である。** 条件は Review tier を含む
  CI が通ること。有効にした後に変更を足すなら、先に `gh pr merge <n> --disable-auto` で解く。Low 以外では auto-merge を
  使わない。CI の途中で有効にすれば Review tier が落とすが、CI が通った後に有効にした PR はそのままマージされ、check では
  止められない
- `skip-coderabbit` ラベルと本文の ignore コマンドは使わない。Medium 以下には CodeRabbit が走らないので、外す必要がない
- 仕組みと却下した案は [ADR-3286](../adr/3286-risk-based-review-tiers.md)

#### High の PR で人間が読むもの

**到達状態**: High の PR では、Review tier の job summary に変更したファイルを段階ごとに並べた表があり、PR 本文の
`## For Reviewers` 節に、kompiro の判断が要る論点のうち答えの無いものが 3 件まで載っている。論点が無ければ節に
「None」と書く。kompiro が読むものは次のどちらかで、summary が表の上にどちらかを出す。

| PR | kompiro が読むもの |
| --- | --- |
| 合意済みの Design Doc が裏付け、Design Doc との照合が HEAD を覆っている（下の「Design Doc との照合」） | `## For Reviewers` 節と、summary が「Files still read」に並べるファイル。ほかの差分は、節が指す箇所を確かめるときに開く |
| それ以外 | 表の High のファイルと `## For Reviewers` 節 |

- **合意済みの Design Doc** は Review tier が git の履歴だけで決める。PR の base が `main` で、PR が閉じる Issue
  （`Closes #N` など）へのリンクを「引き金 Issue」の行に持つ Design Doc が merge-base にちょうど 1 本あり、PR がそれを
  変えておらず、`main` の先頭でも同じ blob で、作成から `main` の先頭までにそれを変えたコミットがすべて Design の段階
  （`docs/design/**` と Low のファイルだけ）で、名前を変えた履歴が無いこと。どれかが欠ければ裏付けは無く、summary が
  理由を出す。Design Doc を変えた High や Medium の PR では、kompiro はその Design Doc を読んでいないので、それ以降
  その Design Doc は裏付けにならない
- **読まなくてよくなるのは、決定のパス（`docs/spec/**`・`docs/concepts*.md`・`docs/process.md`・`docs/process/**`・
  `.claude/rules/**`）と言語の挙動のコードだけである。** どちらも中身を Design Doc で合意し、ずれは照合が拾う。
  セキュリティの境界（テストファイルも含む）と、それ以外の High（レビューやリリースの仕組み、依存の変更など）は、
  文面が合意どおりでも挙動を確かめる必要があるので読む
- **kompiro に渡す直前に、Review tier を走り直させる。** ruleset は base に追いついていることを求めないので、検査の後に
  main で Design Doc が変わると、公開された summary が古いまま絞った範囲を示す。走り直した run は `main` の先頭の blob と
  比べ直し、違えば「merge main」を理由に裏付けを外すので、そのときは main を取り込む。渡した後の変化は拾わない。その改訂は
  kompiro がマージした Design の PR である

- 表は Review tier が HEAD から毎回作り直す。PR 本文にファイルの一覧を書かない（コミットを足すと古くなる。TPL-1032）
- job summary に表が無い PR（この表を書く前の Review tier の結果が残っている PR など）は、差分の全部を読むか、
  Review tier を走り直させて表を出してから読む
- 次の PR は差分の全部を読む（summary がそう出す）。作成者が信頼リストにいない PR、High のファイルが無く
  ラベルで（ラベルが無いことも含む）High になった PR、パスを読めない差分の節がある PR、High のファイルが表の行数
  （200）に収まらない PR
- `rendering-change` ラベルの付いた PR は、High でも人間が preview で動作を確かめる（上の表の Medium の行）
- 節に載せるのは、従うと記録済みの決定が変わる指摘（CodeRabbit の指摘は coderabbit-rounds.md「人間に確認する
  指摘の判定」、ローカルレビューの指摘も同じ判定）と、作成者が kompiro に決めてほしいことである。項目ごとに、
  論点・該当する記録・取りうる選択肢・議論している thread かコメントへのリンクを書く
- **一度に載せるのは 3 件まで。** 4 件以上あるときは、kompiro が載せた 3 件すべてに答えた後で、残りを見直して
  次の 3 件として載せる。答えによって残りの論点が消えたり変わったりするので、先に全部を並べない。まだ載せない論点は、セッションが
  終わっても残るように、節の中の HTML コメントに置く
- 答えが付いた項目は、答えを反映してから節から外す。どう反映したかは、その項目の thread かコメントに返す

#### Design Doc との照合

**到達状態**: PR が閉じる Issue を「引き金 Issue」の行に挙げた Design Doc があれば、PR を作る前に、実装の文脈を
持たない subagent がその Design Doc とブランチの差分を照合し、ずれがローカルレビューの記録にレビュアー `design` の
行として残っている。ずれが無ければ、`design` の行を 1 つ、対応 `no deviation` で残す。

- subagent に渡すのは Design Doc と `git diff origin/main...HEAD` だけにする。実装の文脈や、作成者が考えた
  ずれの説明を渡さない（照合が作成者の読み方に引っ張られる）
- 照合するのは、Design Doc の「現時点の方針」「実装の指針」「制約・前提」から外れた点である。ずれは 2 つに分ける

  | ずれ | どうするか |
  | --- | --- |
  | 実装が Design Doc を外れている | 実装を直す。対応は `fixed in <sha>` |
  | Design Doc の方が実態に合わない（実装して分かった制約など） | 直さずに `## For Reviewers` 節に載せる。記録済みの決定を変えるので、coderabbit-rounds.md「人間に確認する指摘の判定」と同じ扱い。対応は `declined: asked in For Reviewers` |

- `design` の行の場所の列には、照合した Design Doc を `<パス>@<blob>` で書く（blob は `git rev-parse origin/main:<パス>`、
  7 文字以上）。main が Design Doc を改めると blob が変わり、前の照合の行は数えられなくなるので、照合を当て直す
- ずれが無いときの行は `| <番号> | design | Trivial | <パス>@<blob> | No deviation | no deviation |` と書く
  （`local-review-record.ts render` の findings なら `{reviewer: "design", sev: "Trivial", where: "<パス>@<blob>", finding: "No deviation", disposition: "no deviation"}`）
- 照合は自己申告で、Review tier は中身を確かめない。確かめるのは形だけで、PR 本文に `## For Reviewers` 節があり、
  その節が空でなく（論点が無ければ「None」）、記録が `Waived:` でなく、`design` の行を持ち、そのすべてが裏付けの Design Doc を今の blob で名指し、Medium の記録と同じ検査を通る（HEAD を覆い、どの行にも対応がある）
  ことである。満たせば読む範囲を絞る（上の表の 1 行目）。満たさなくても check は落ちず、範囲が絞られないだけで、
  summary が理由を出す
- 記録の後にコミットを足したら、照合もそのコミットに当て直す。記録の `head` が HEAD を覆わなくなると、範囲は絞られない

#### バグ修正のテストと、既存のテストの変更

**到達状態**: バグを直す PR はテストケースを足しているか、本文に `No test: <理由>` の行がある。既存のテストを
弱める PR は、`refactor` でなく、本文に `Test change: <理由>` の行がある。テストの実行範囲を決める runner の設定を
変える PR は、`refactor` を含めて `Test change:` の行がある。Review tier は段階によらずこれを検査し、
理由の行で通した PR は check の summary に理由を出す。理由の行は HTML コメントの外に書く。

- **バグを直す PR**：タイトルの型が `fix` か、`bug` ラベルの Issue を閉じる（`Closes #N` など）PR。テストケースは、
  新しいテストファイル、既存のテストファイルに足した `it(` / `test(` か `.each` の表の行、`examples/` の新しい `.krs`、
  renderer の新しい fixture、AT に足した `krs` fence のどれか
- **既存のテスト**：テストファイルに加えて、テストの API（`expect` / `test` / `describe` など）を import している
  テストファイル以外のモジュール（`packages/e2e/fixtures/` の helper など）を含む。helper かどうかはディレクトリでなく、
  base 側の import で決まる（`{ test as base }` のような別名や、`@playwright/test` などの名前空間の import も含む）
- **テストの入力**：ディレクトリを読むテストが拾うファイル。`examples/` の `.krs`、renderer の fixture、AT の `krs`
  fence で、足せばテストケースの追加になる。削除すると、AT なら PR の AT 全体で `krs` fence を減らすと、テストケースを
  消したことになる。同じ種類の入力（examples どうし、fixture どうし）のあいだで同じ内容のまま移したものは、
  足したことにも消したことにもならない
- **`refactor` の PR**：既存のテストで変えてよいのは、import の文と、コメントかモジュールのパスの文字列だけが
  違う行の対だけ。それ以外の変更、テストファイルの削除、テストの入力の削除は、理由の行があっても落ちる。挙動を変える refactor
  （廃止した API のテストを消すなど）はタイトルの型を変えて、`Test change:` を書く
- **それ以外の PR**：既存のテストから import 以外の行を消す、テストファイルを消す、`.skip` / `.fixme` /
  `.todo` / `.only` / `skipIf` / `runIf` や単独の `return` を足す、ブロックコメントや文字列で既存のテストを囲む、
  テストの入力を消す PR は、`Test change:` の行が要る
- **runner の設定**（`vitest.config.*` と `vitest.pack.config.*` のような中間名つき、`vitest.workspace.*`、
  `playwright.config.*`、`.vscode-test.*`、`.mocharc.json` / `.mocharc.js`）：コメントの行と空行以外を変える PR、
  変えていない行の周りのコメントを開け閉めする PR は、`refactor` でも `Test change:` の行が要る。どのファイルが走るかは glob や正規表現の
  データで決まり、変更が範囲を狭めるかを文面からは読めない。alias の変更のように範囲を変えない refactor もあるので、
  refactor でも落とさず理由の行で通す

#### 指摘の重大度と対応

**到達状態**: Critical と Major の指摘はすべて、直したか、理由を返して却下したか、PR の差分の外として Issue に
回してある。Minor と Trivial にも、直したかどうかにかかわらず対応が書かれている。CodeRabbit の指摘にも
ローカルレビューの指摘にも、どの段階でも同じ規則を使う。

- 重大度はレビュアーが付けたものを使い、付け替えない。重大度の無い指摘は Major として扱う
- **Critical / Major は必ず対応する。** 対応は直すことに限らない。指摘が誤っていれば理由を返して却下する
- **Minor / Trivial は直すかどうかを決めてよい。** 同じ push で直せるなら直す。直さないなら理由を書いて閉じ、
  議論を続けない
- **PR の差分の外への指摘は直さず、Issue にする。** 判定は、指摘された行が PR の差分の hunk に含まれるかどうか
  （`node scripts/review/tier.ts in-diff <path> <line>`）。CodeRabbit の「Outside diff range」はこの判定に使わない。
  場所を判定できない指摘は PR の範囲として扱う。重複を検索してから Issue を起こし、指摘にはその Issue へのリンクを
  返して閉じる

#### ローカルレビューの記録

**到達状態**: PR 本文に記録の節が 1 つあり、その `head` が PR の HEAD で、すべての指摘に対応が書かれている。
High 以外では Review tier がこれを検査する。High でも、Claude が作る PR では同じ形で残す。
例外は ADR の生成物と TPL の索引（`docs/test-perspectives/index.md`、#3289）だけを変える Low の再生成 PR（`pnpm adr:regenerate-pr`、#3416）で、記録を求めない。
生成物が head から生成し直した結果とちょうど一致することを `Validate` が確かめるので、読む差分が無い。

```
node scripts/review/local-review-record.ts render --findings <findings.json> --into <本文ファイル>
gh pr edit <n> --body-file <本文ファイル>
```

`<findings.json>` は `{reviewer, sev, where, finding, disposition}` の配列で、対応は `fixed in <sha>`・
`declined: <理由>`・`→ #<Issue>` のどれかで書く。レビュアーは `engineering`（/engineering:code-review）、`cli`
（CodeRabbit CLI）、`coderabbit`（PR での CodeRabbit のレビュー）、`design`（Design Doc との照合）と書く。対応の
`no deviation` は `design` の行にだけ使える。Design での CodeRabbit の 1 回の指摘も同じ表に
足し、check は Design の `coderabbit` の行だけを判定から外す（レビューが届く前と後で結果が変わらないように）。

- **記録の後にコミットを足したら、そのコミットにも `docs/process.md` の手順 8 の確認を当てて記録を作り直す。** `head` から HEAD までが
  main の取り込みだけで、PR の変更が変わっていなければそのままでよい
- **Low では、Critical / Major の却下・CLI を飛ばした記録・`Waived:` の記録を通さない。** 要るならラベルを
  `risk: medium` に上げる
- 記録を作れない事情（人間が手で作った PR など）は `Waived: <理由>` と書く
- 記録は自己申告で、check が見るのは形式と、記録が HEAD を覆っているかだけである
