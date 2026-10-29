# topic: ラベルと topics の一致を PR で確かめる

- **日付**: 2026-10-29
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3314](https://github.com/kompiro/karasu/issues/3314)
  - 関連 PR / Issue: PR [#3315](https://github.com/kompiro/karasu/pull/3315)（`topic:` ラベルの導入）、[#3389](https://github.com/kompiro/karasu/issues/3389)（open の Issue すべてに付ける）
  - 関連 TPL: [TPL-1480](../test-perspectives/TPL-1480-consistency-check-triggers-on-both-sides.md)（両側の変更で起動する）、[TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md)（同じ語彙の複数表現は和集合で突き合わせる）、[TPL-2046](../test-perspectives/TPL-2046-pnpm-double-dash-arg-forwarding.md)（`pnpm run` 経由の flag）
  - コード: `scripts/lint/config-topics-sync.ts`、`.github/workflows/adr-validate.yml`、`.claude/rules/adr-topics.md`

## 背景・課題

ADR と TPL の `topics` の語彙は `adr.config.json` と `tpl.config.json` に同じものが書かれ、repo の `topic: *` ラベルにも写されている。2 つの config の一致は `scripts/lint/config-topics-sync.ts` が確かめるが、ラベルとの一致はどこも確かめていない。`.claude/rules/adr-topics.md` の到達状態 4 に `diff` のコマンドがあるだけで、topics を変える人が読み込まれたルールに従って手で回す。

ずれは 2 方向に起きる。

- `adr.config.json` に topic を足したが、ラベルを作っていない（Issue に付けられない）
- topics に無い `topic:` ラベルがある（GitHub の画面で作った、改名・削除の後に旧ラベルが残った）

## 制約・前提

- ラベルは GitHub にしか無いので、比較には API が要る。pre-push の config 比較（lefthook。CI では `test:scripts` の vitest が同じものを見る）はオフラインで速いまま残す
- `adr-validate.yml` の `Validate` は required check で、`adr-validate-skip.yml` と paths を対にしている（ADR-953 の paired-stub）
- topics を変えるのは年に数回。仕組みは小さく保つ
- open の Issue がそれぞれ `topic:` を 1 つ持つことの確認（`docs/process.md`「Issue トピックラベル」）は対象外。本件はラベルの集合だけを扱う

## 検討した選択肢

### 案1: PR で落とし、ラベル操作をすべてマージ前に行う

topics を変える PR の `Validate` で、config とラベルを突き合わせる。今のルールでは改名・削除のラベル操作がマージ後なので、そのままだと改名・削除の PR は必ず落ちる。そこで、追加・改名・削除のラベル操作をすべてマージ前に行う手順に変える。

**メリット**

- ずれがマージ前に見つかり、ほかの lint と同じ場所で止まる
- 「マージ後に実行するラベル操作」を PR 本文に書いて覚えておく必要がなくなる

**デメリット**

- 追加・改名・削除のどれでも、PR がマージされるまでのあいだ、ラベルが main の config より先に進む。その間に照合が走る別の PR（topics かチェッカーのスクリプトを変える PR）も落ちる。そうした PR は 1 本ずつ通すことになる（頻度は低い）
- ラベルを操作しても PR の `Validate` は再実行されない。ラベル操作を push の前に済ませるか、後から run を再実行する
- PR を取り下げたら、ラベル操作を手で戻す（改名は名前を戻す。削除は戻せないので、削除はレビューで合意してから行う。そのため削除の PR は、合意するまで `Validate` が赤い）

### 案2: マージ後に main で落とす

main への push と週 1 回の schedule で突き合わせ、ずれていれば run を赤くする。ルールの手順は今のまま。

**メリット**

- 手順を変えなくてよい

**デメリット**

- ずれは PR では止まらず、マージの後に赤い run として現れる。誰かが気づくまで残る

### 案3: ローカルのコマンドだけ

`--labels` のコマンドを用意し、ルールの `diff` を置き換えるだけにする。

**メリット**

- workflow を変えない

**デメリット**

- 今と同じく、読み込まれたルールに従う人の記憶に頼る

### ずれたラベルを自動で直すか

チェックはずれを報告するだけにし、ラベルを作ったり消したりしない。改名は、自動の側からは「旧ラベルの削除と新ラベルの作成」に見える。それを自動で行うと、旧ラベルを付けていた Issue からラベルが外れる。

## 現時点の方針

**案1 を採用する。** ずれはマージ前に止めるのがこの repo のほかの drift ガードと同じ形で、topics を変える頻度が低いので、マージ前のラベル操作で起きる不便は小さい。

**照合するのは、そのコミットで `adr.config.json`・`tpl.config.json`・チェッカーのスクリプトが変わったときだけにする。** `Validate` は ADR を触る PR すべてで走る。案1 ではマージ前にラベルが main の config より先に進むので、無条件に照合すると、そのあいだ topics と関係のない ADR の PR（昇格 PR など）まで落ちる。topics を変える PR のマージ後には、main への push で同じ照合が走り、main の config がラベルに追いついたことを確かめる。main の run は push ごとに concurrency group を分け、後続の push に cancel も置き換えもさせない（されると、後続の run の差分には topics の変更が無く、照合が失われる）。

**ラベルの側の変更（GitHub の画面での作成・改名・削除）では起動しない。** TPL-1480 は両側の変更で起動することを求めるが、`label` イベントの run は main の config と照合する。案1 の正しい手順（マージ前のラベル操作）でも必ず落ち、本物のずれと区別できない。画面で作られた余計な `topic:` ラベルは、次に topics を変える PR の `Validate` で止まる。ラベルを付けた Issue の側は、`docs/process.md`「Issue トピックラベル」の確認で見つかる。

### 実装の指針

1. `scripts/lint/config-topics-sync.ts` に `--labels` を足す。付けたときは、今の config 同士の比較に加えて、`gh api --paginate 'repos/{owner}/{repo}/labels?per_page=100' --jq '.[].name'` でラベル名を読み、大文字小文字を区別せず `topic:` で始まるもの（空白の有無を問わない）と `adr.config.json` の topics を和集合で突き合わせる（TPL-1415）。どちら向きのずれも 1 件ずつ出し、直し方（`gh label create` / `gh label edit` / `gh label delete`）を添える
2. `package.json` に `lint:config-topics-sync:labels` を足す。`pnpm run lint:config-topics-sync -- --labels` の形にしない（TPL-2046）
3. 比較は純粋関数にして、ラベル名の配列を引数で受け取る。CLI の入口も、ラベルの読み元を差し替えられる形にする。テストは API を呼ばずに、比較と終了コード（どちらかがずれたら 1、`--labels` が無ければ API を呼ばない）を検証する。ラベル名は大文字小文字を区別しないので、`Topic: x` や空白の無い `topic:x` も topics に無いラベルとして報告する
4. `adr-validate.yml`:
   - paths に `tpl.config.json` と `scripts/lint/config-topics-sync.ts` を足し、`adr-validate-skip.yml` の `paths-ignore` にも同じものを足す（TPL-1480）
   - checkout を `fetch-depth: 2` にし、`git diff --name-only HEAD^1 HEAD` に `adr.config.json`・`tpl.config.json`・`scripts/lint/config-topics-sync.ts` のどれかがあるときだけ照合する（PR の merge commit でも main の squash commit でも、親 1 が base になる。main は squash merge だけを受け付ける）。スクリプトを含めるのは、照合を変える PR 自身の CI で照合が走るようにするため。`adr-validate.yml` は含めない（Dependabot が action の pin を上げる PR まで巻き込むため）
   - 差分は先に変数へ取り、`git diff` の失敗をステップの失敗にする（パイプのまま grep に渡すと、失敗が「topics の変更なし」と読まれる）
   - `concurrency` は、PR の run は今どおり ref で group を作って cancel し合い、main の push は commit ごとに group を分けて cancel しない（pending の run も後続に置き換えられない）
   - ステップ「Check topic labels against adr.config.json topics」を足し、`GH_TOKEN: ${{ github.token }}` で `pnpm run lint:config-topics-sync:labels` を実行する。`permissions` に `issues: read` を足す。fork からの PR でも、`GITHUB_TOKEN` は読み取り専用のまま `issues: read` を持つので、public repo のラベルは読める
   - API の一時的なエラーで落ちたら再実行する。落ちるのは照合が走る PR（topics かチェッカーのスクリプトを変える PR）だけなので、ADR の PR 全般は止まらない
5. `.claude/rules/adr-topics.md`:
   - 到達状態 4 の `diff` を `pnpm run lint:config-topics-sync:labels` に置き換え、PR の `Validate` が同じものを確かめると書く
   - 追加・改名のラベル操作は topics の変更を push する前に済ませる。改名は `gh label edit`（PR を取り下げたら名前を戻す）
   - 削除だけは例外で、レビューで合意してから Issue を付け替えて `gh label delete` する。それまで `Validate` は赤い
   - push の後にラベルを操作したら、PR の `Validate` を再実行する（`gh run rerun --failed`）。ラベルの変更では再実行されない
   - 「マージ後に実行するラベル操作は PR 本文に書く」を消す
6. AT は作らない。PR の CI で、ずれの無い状態で `Validate` が通ることを確かめる。ずれる場合は単体テストで押さえる
7. ADR 昇格: 実装 PR のマージ後、`docs/adr/3314-topic-label-sync-check.md` として昇格し、本 Design Doc は同じ PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（開発プロセスのみ）
- ドキュメント更新: `.claude/rules/adr-topics.md`
- 今のラベルは topics と一致している（15 対 15）ので、導入時に直すものは無い

## 未解決の問い / 決めないこと

- 画面で作られた余計なラベルを、作られた時点で止める仕組みは足さない。open の PR の config を考慮して `label` イベントを判定する案もあるが、topics を変える頻度に見合わない。次に topics を変える PR で止まれば足りる
