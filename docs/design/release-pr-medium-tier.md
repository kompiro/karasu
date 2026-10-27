# リリース PR を、差分が changeset version の出力だけなら Medium にする

- **日付**: 2026-10-25（2026-10-27 に ADR-3286 の上で書き直し）
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3350](https://github.com/kompiro/karasu/issues/3350)
  - PR: [#3354](https://github.com/kompiro/karasu/pull/3354)
  - 観測した PR: [#3349](https://github.com/kompiro/karasu/pull/3349)（2026-10-25 のトレイン。rate limit でレビューされず、`CodeRabbit` のステータスは pass）
  - リスク段階: [ADR-3286](../adr/3286-risk-based-review-tiers.md)（本設計はその分類器に規則を 1 つ足す）
  - 関連 ADR: [ADR-2922](../adr/2922-monthly-release-train.md)（月次トレイン）、[ADR-1370](../adr/1370-release-flow-actions-driven.md)（リリース PR は人が開き、CHANGELOG を読んでマージする）、[ADR-2331](../adr/2331-adr-automerge-scope.md)（差分の性質で判定する）
  - 関連 TPL: [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)（判定は最終の差分で行い、規則に当たらない入力を厳しい側に倒す）、[TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md)（判定できないときは通過ではなく失敗にする）
  - コード: `scripts/review/tier.ts`, `scripts/release/train.mts`, `.github/workflows/release-prepare.yml`

## 背景・課題

月次トレインのリリース PR（head `chore/release-YYYY-MM-DD`）の差分は、`pnpm version-packages`（`changeset version` と `pnpm install --lockfile-only`）が作ったものだけである。

- 版の更新（`packages/*/package.json` の `version`）、`packages/*/CHANGELOG.md` の追記、消費した `.changeset/*.md` の削除
- `CHANGELOG.md` の各項目は、その changeset を足した PR ですでにレビューを通っている
- リリース PR のレビューは、人が版と CHANGELOG を読んでからマージすること（ADR-1370）で、自動レビューではない

ADR-3286 の分類器では、`**/CHANGELOG.md` と `package.json` の `version` は release の変更として **High** になる。High は CodeRabbit のラウンドを回すので、リリース PR は毎月 CodeRabbit の枠を使う。#3349 ではレビューが rate limit に当たって走らなかったのに、`CodeRabbit` のステータスは pass になり、レビュー済みに見えた。

High のままにしておく理由は、生成物でないコミットがリリースブランチに足される場合に備えることだけである。それは差分を見れば判定できる。

## 当初の案と、書き直した理由

当初の案（2026-10-25）は、ADR-3117 の形でリリース PR を CodeRabbit から外すものだった。compare リンクで PR 本文に ignore コマンドと `release-pr` ラベルを入れ、外した PR の差分が生成物だけであることを、`pull_request_target` で動く専用の workflow と commit status で確かめる。

ADR-3286（2026-10-27）で前提が変わった。

- CodeRabbit は `risk: high` / `risk: design` のラベルの PR だけをレビューする。外す仕組み（ignore コマンド・除外ラベル）は役目を終えた
- check「Review tier」（ruleset の required にするのは #3364 の後）が、push・ラベル・本文の編集のたびに base 側の分類器で最終の差分を判定し、ラベルが差分の段階より低ければ落とす

そこで、リリース PR を「外す」のではなく、**生成物だけの差分を Medium と判定する規則を分類器に足す**。最終の差分の検査は Review tier がすでに行うので、専用の workflow は要らない。

## 制約・前提

- **PR は人が開く。** Actions の PR 作成は OFF のまま（ADR-1370）。開くのはトラッキング Issue の compare リンクから
- **判定は場所ではなく差分の性質で行う（ADR-2331）。** ブランチ名やタイトルでは判定しない。同じ中身なら、どのブランチから開いても同じ段階になる
- **判定は最終の差分で行う（TPL-3286）。** 規則に当たらない変更が 1 行でも混ざれば、規則は効かず通常の段階（`CHANGELOG.md` があるので High）に戻る
- **Medium にはローカルレビューの記録が要る（ADR-3286）。** リリース PR の差分にはローカルレビューを当てるものがないので、`Waived:` に理由を書いた記録を置く。Medium は `Waived:` を通す

## 方針

### 分類器の規則（`scripts/review/tier.ts`）

ファイルの種類だけでなく、**中身が `changeset version` の出力であること**を確かめる。次のすべてが成り立つとき、差分のファイルを Medium に数える。1 つでも外れれば規則は効かず、各ファイルは通常の規則で判定する（`CHANGELOG.md` と `version` は High）。

1. 差分が次の 3 種のファイルだけでできている
   - `.changeset/<name>.md` の削除（`README.md` を除く。`config.json`・`changelog.cjs` の変更は当たらない）
   - `packages/*/CHANGELOG.md` の追加・変更
   - `packages/*/package.json` の変更のうち、前後の JSON で `version` の値だけが変わったもの（ほかのキーの変更、キーの追加・削除は当たらない）
2. `.changeset/*.md` の削除が 1 つ以上ある
3. `CHANGELOG.md` の hunk はすべて行を足すだけ（消す行が無い）。`changeset version` は既存の項目を書き換えない
4. `CHANGELOG.md` が変わったパッケージの集合と、`version` が変わったパッケージの集合が一致する
5. `CHANGELOG.md` に足した行が、削除した changeset から作られる行**だけ**でできていて、過不足が無い。削除した changeset の中身は、分類器が merge-base 側から読む
   - 足してよい行は、版の見出し（`## <その package.json の新しい version>`）、種類の見出し（`### Major Changes` / `### Minor Changes` / `### Patch Changes`）、空行、そして項目の行だけ
   - 項目は `.changeset/changelog.cjs` の形（`- <7〜40 桁の hex>: <要約の 1 行目>` と、要約の続きの行を 2 文字字下げしたもの）で、要約は changeset の本文と一字一句一致する
   - 各 changeset の項目は、その changeset が frontmatter で挙げたパッケージの `CHANGELOG.md` にだけ、ちょうど 1 回ずつ現れる。項目の数は「changeset と、それが挙げたパッケージ」の組の数と一致する。手で足した項目や、別のパッケージの CHANGELOG に入った項目があれば、規則は効かない
   - `changeset version` が workspace 内の依存の更新で足す行（`Updated dependencies`）は、依存がすべて `workspace:*` なので現れない。現れたら規則に当たらない入力として High に倒す（TPL-3286）
6. どのファイルにもモードの変更とバイナリの変更が無い
7. 作成者が信頼リストにいる（いなければ従来どおり High）

直近 5 本のリリース PR（#3349・#3239・#2981・#2921・#1781）の差分は、すべて 1 の 3 種だけでできている（lockfile も root のファイルも変わっていない。workspace 内の依存は `workspace:*` なので、範囲も動かない）。実装 PR で、これらの差分に規則を当てて Medium になることを確かめる。

Low ではなく Medium にするのは、ADR-1370 のとおり人が版と CHANGELOG を読んでマージするからである。

### 開く手順（`scripts/release/train.mts`・`release-prepare.yml`）

当初の案のうち、PR を下書きする部分は残す。下書きの中身は 1 つにして、開き方が 2 通りあっても同じ PR になるようにする。

- `title`: `chore(release): release train YYYY-MM-DD`
- `labels`: `risk: medium`
- `body`: 版の表、`Refs #<トラッキング Issue>`、マージで何が走るか、そしてローカルレビューの記録

記録は `scripts/review/local-review-record.ts` の `renderRecord` で作る（`train.mts` から `../review/` への新しい依存になる。どちらも Node の builtin だけを使うので、install は要らない）。入力は次のとおり。

- `reviewers`: `none (release train)`。CLI の既定値（`/engineering:code-review …, coderabbit CLI --deep`）は使わない。走っていないレビューを書くことになるため
- `waived`: `release train PR: the diff is changeset version output, and the maintainer reads the CHANGELOG before merging (ADR-1370)`
- `base` / `head`: Prepare がリリースブランチにコミットした**後**に取る（`head` はそのコミット、`base` は `git merge-base origin/main HEAD`）。今の `release-prepare.yml` は Issue の本文をコミットの前に作っているので、順序を入れ替える

開き方は 2 通りあり、どちらも同じ下書きを使う。

- **メンテナが GitHub の画面から開く**: トラッキング Issue の compare リンク。`quick_pull=1` を付けると PR 作成のページが開き、`title` / `body` / `labels` のクエリが作成フォームの初期値になる。エンコードは `encodeURIComponent`。本文は版の表（4 行ほど）と記録（600 字ほど）で、エンコード後も 2〜3 KB に収まる。Prepare はリンクの長さが 8 KB を超えたら `body` を付けず、Issue に「`pr-body` で本文を作る」と書く（URL の長さの上限で画面が開けなくなるのを避ける）
- **Claude が開く**（#3239・#3349 はこちらだった）: `node scripts/release/train.mts pr-body --issue <n>` が同じ本文を出す。`gh pr create --draft --label "risk: medium" --title … --body-file <本文>` で draft として作り、`gh pr ready` で外す。draft で作るのは、ラベルが PR の作成の後に付くため。draft なら Review request は `opened` でラベルを付けず、ready の時点では `risk: medium` が付いている

リンクも `pr-body` も使わずにラベル無しで開いた場合も壊れない。Review request が `risk: high` を付け、CodeRabbit のレビューが走る見込みで（後から付いたラベルで始まるかは #3364 で確かめる。始まらなければ `@coderabbitai full review`）、High は記録を求めない。損をするのは CodeRabbit の枠 1 回である。

### 生成物でないコミットが足されたとき

リリースブランチに手でコミットを足すと、規則の 1〜6 のどれかが外れて差分は High になる（CHANGELOG を書き換える・項目を手で足す・`version` 以外を変える、のいずれも当たる）。`risk: medium` のラベルが差分の段階より低いので、Review tier が落ちる。記録の `head` も PR の HEAD と合わなくなる。

戻し方は 1 つで、**ラベルを `risk: high` に上げる**。High は記録を求めないので check は通り、CodeRabbit のレビュー（後から付いたラベルで始まらなければ `@coderabbitai full review`）と、人間の差分の確認に回る。記録を作り直して Medium に戻すことはしない。生成物でない変更は Medium の条件を満たさないからである。Review tier が required になるまで（#3364）は、check の失敗は表示されるがマージは止めないので、マージする人が check を見る。

## 検討した選択肢

| 案 | 内容 | 判断 |
| --- | --- | --- |
| A（採用） | 分類器に「生成物だけなら Medium」の規則を足し、compare リンクで `risk: medium` と `Waived:` の記録を下書きする | 既存の Review tier が最終の差分を検査する。足すのは規則 1 つと下書きだけ |
| B | 当初の案（ignore コマンド・`release-pr` ラベル・専用の `pull_request_target` workflow と commit status） | ADR-3286 で外す仕組みが要らなくなった。専用の workflow は Review tier と同じ検査を二重に持つ |
| C | リリース PR だけ Review tier の記録の要求を外す | 「段階は差分で決め、記録は High 以外で求める」という 1 つの規則に例外を足すことになる。`Waived:` で理由を残せば例外は要らない |
| D | `CHANGELOG.md` を High の一覧から外す | 生成物でない変更（手で書き換えた CHANGELOG）まで軽くなる。判定は差分の性質で行う（ADR-2331） |

## Related TPLs

- [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md): 規則は最終の差分にだけ効き、規則に当たらない変更が混ざれば通常の段階（High）に戻る。テストで、生成物だけの差分が Medium になることと、次のどれもが Medium にならないことを固める
  - `version` 以外のキーの変更、lockfile の変更、`.changeset/config.json` の変更、ほかのファイルが混ざった差分
  - changeset の削除が無い差分、CHANGELOG の行を消す・書き換える差分、削除した changeset の要約が CHANGELOG に無い差分
  - 正しい項目に加えて手で書いた項目を足した差分、項目が別のパッケージの CHANGELOG に入った差分、同じ項目が 2 回入った差分
  - `version` だけが変わって CHANGELOG が変わらないパッケージ（またはその逆）がある差分
  - モードの変更・バイナリの変更がある差分
- [TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md): Prepare が Issue の本文を書き直せなかったら、リンクの無い Issue が残るのでジョブを失敗させる

## 実装の指針

1. `scripts/review/tier.ts`: `classifyChange` に規則を足す。`package.json` の前後と削除した changeset の中身は、`changedFiles` が merge-base と head から読む。`scripts/review/tier.test.ts` で上の Related TPLs の例と、直近 5 本のリリース PR の差分を固める
2. `scripts/release/train.mts`: `composeReleasePrBody({ issue, bumps, date, base, head })` と `pr-body --issue <n>` サブコマンドを足し、`composeTrainIssueBody` が compare リンクに `quick_pull=1`・`title`・`body`・`labels` を付ける（長さが 8 KB を超えたら `body` を外す）。エンコードは `encodeURIComponent`（`URLSearchParams` は空白を `+` にする）。`scripts/release/train.test.ts` で、リンクのパラメータと、Issue の行でリンク全体が autolink になること（本文の `(ADR-1370)` の括弧）を固める
3. `.github/workflows/release-prepare.yml`: リリースブランチへのコミットの後に記録の `base` / `head` を取り、Issue を作ったあと、番号を入れた本文で `gh issue edit` する。失敗したらジョブを失敗させる（TPL-2786）
4. `docs/release.md`「リリースの流れ」: Issue のリンク、または `pr-body` と `gh pr create --draft --label "risk: medium"` で開くと、記録が入り CodeRabbit は走らない。リリースブランチに手でコミットを足したら、ラベルを `risk: high` に上げる
5. マージ後の確認は別 Issue にする（ADR-3271）: 2026-11-29 のトレインで、開いた PR が Medium と判定され、CodeRabbit が走らず、Review tier が通ること。画面から開く場合は、compare フォームの `labels=` が `opened` の時点で付いていて、Review request が `risk: high` を足さないこと
6. ADR 昇格: 実装の完了後、`docs/adr/3350-release-pr-medium-tier.md` として昇格し、本 Design Doc を削除する。ADR-3286 と ADR-2922 への関係を frontmatter に書く

## 影響範囲

- メンテナの作業: 変わらない（Issue のリンクから PR を開き、CHANGELOG を読んでマージする）。本文を書く手間が減る
- 臨時のリリース（`workflow_dispatch`）も同じ Issue とリンクを作るので、同じく Medium になる
- 本設計の実装 PR は `scripts/review/**` と workflow に触れるので High になる
