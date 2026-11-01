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
| Low | `docs/test-perspectives/**`・`docs/guide/**`・新しいテストファイル（既存のテストファイルの変更は Medium）、新しい ADR、ADR の昇格（Design Doc の削除、リンクの張り替え、ADR へのリンクの追加）、既存 ADR の frontmatter、ADR の生成物だけを変える再生成 PR | 回さない | 記録と CI が通れば auto-merge（再生成 PR は記録なしで、スクリプトが REST でマージする） |
| Design | `docs/design/**` | ready の直後に 1 回だけ。ゲートにしない | 記録と人間のレビュー |
| Medium | ほかのすべて（`packages/*`・`docs/acceptance/**`・`examples/**`・既存 ADR の本文など） | 回さない | 記録と、サマリー・証拠・preview を見た人間の判断 |
| High | workflow・release・依存の変更・`docs/spec/**`・`docs/concepts*.md`・`docs/process.md`・`docs/process/**`・`.claude/rules/**`・`.coderabbit.yaml`・レビューの仕組み（`scripts/review/**`・`scripts/coderabbit/**`・`.claude/skills/**` など） | Critical / Major の未対応が無くなるまで回す（再レビューは 3 回まで） | 人間が差分を読む |

- **差分が `packages/nest/**` か `.github/workflows/**` に触れる PR は、段階とは別に `/security-review` を当てる**
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
例外は ADR の生成物だけを変える Low の再生成 PR（`pnpm adr:regenerate-pr`、#3416）で、記録を求めない。
生成物が head から生成し直した結果とちょうど一致することを `Validate` が確かめるので、読む差分が無い。

```
node scripts/review/local-review-record.ts render --findings <findings.json> --into <本文ファイル>
gh pr edit <n> --body-file <本文ファイル>
```

`<findings.json>` は `{reviewer, sev, where, finding, disposition}` の配列で、対応は `fixed in <sha>`・
`declined: <理由>`・`→ #<Issue>` のどれかで書く。レビュアーは `engineering`（/engineering:code-review）、`cli`
（CodeRabbit CLI）、`coderabbit`（PR での CodeRabbit のレビュー）と書く。Design での CodeRabbit の 1 回の指摘も同じ表に
足し、check は Design の `coderabbit` の行だけを判定から外す（レビューが届く前と後で結果が変わらないように）。

- **記録の後にコミットを足したら、そのコミットにも `docs/process.md` の手順 8 の確認を当てて記録を作り直す。** `head` から HEAD までが
  main の取り込みだけで、PR の変更が変わっていなければそのままでよい
- **Low では、Critical / Major の却下・CLI を飛ばした記録・`Waived:` の記録を通さない。** 要るならラベルを
  `risk: medium` に上げる
- 記録を作れない事情（人間が手で作った PR など）は `Waived: <理由>` と書く
- 記録は自己申告で、check が見るのは形式と、記録が HEAD を覆っているかだけである
