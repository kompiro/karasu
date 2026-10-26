# 描画が変わる PR に before/after の画像を添付する

- **日付**: 2026-10-26
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3359](https://github.com/kompiro/karasu/issues/3359)
  - 関連 ADR: [ADR-2419](../adr/2419-poc-report-directory.md)（`reports/` と `scripts/report/`）、[ADR-529](../adr/529-playwright-with-ai-visual-review.md)（スクリーンショットを Claude が読む）、[ADR-3342](../adr/3342-ready-gate-local-review.md)（gh ラッパー）、[ADR-3333](../adr/3333-converge-after-ready-hook.md)（`gh pr ready` 後の PostToolUse フック）
  - 関連 TPL: [TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md)（対象を列挙せず全走査で回す）
  - コード: `scripts/report/`、`scripts/bin/gh`、`scripts/coderabbit/converge-after-ready.sh`、`.claude/settings.json`

## 背景・課題

この repo の PR はほとんどをコーディングエージェントが `gh` で作る。図の描画やアプリの UI が変わる PR では、差分のコードを読んでも見た目がどう変わったかは分からない。レビューする人は Cloudflare の preview を開くか、ブランチを手元に持ってくる必要がある。PR 本文に before/after の画像が 1 組あれば、変化をその場で判断できる。

`gh` は 2.102 から `gh pr create` / `gh pr edit` に `--attach` を持つ。画像や動画を GitHub の添付ストレージにアップロードし、本文に書いた `![alt](./before.png)` をアップロード先の URL に書き換える。ブラウザでの操作は要らない。#3359 では、devcontainer の `gh auth login` で得た OAuth トークンで `gh issue comment --attach` を実行し、アップロードされた画像が repo のロゴとバイト単位で一致することを確かめた。

足りないのは 2 つ。

- **撮る手段**: `scripts/report/` には `.krs` を SVG にする `renderKrs` と、Chromium で PNG にする `capture` がある。しかし `renderKrs` は今いるツリーのコードで描画するので、before を撮るにはもう 1 つ checkout が要る。手順は `reports/README.md` に 1 段落あるだけで、PR ごとに組み立てる道具は無い
- **撮るきっかけ**: 依頼されなければ、エージェントは画像を撮らない。`docs/process.md` に手順を書くだけでは行動を変える力が弱い（`.claude/rules/README.md`「どの層に書くか」）

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 描画 | `renderKrs(source, { diagramType, theme, styleSource })` が単一ファイルの `.krs` を SVG にする。複数ファイルのモデルは `compileProject` を直接使う。`diagramType` は `system` / `deploy` / `org` |
| 画像化 | `capture([{ html }], { colorScheme })` が SVG を包んだ HTML を Chromium で PNG にする。Chromium は `packages/e2e` の Playwright のものを共有する |
| 入力の候補 | `examples/` に `.krs` が 85 ファイル。複数ファイルのモデルは `index.krs` がエントリ（15 個、en / ja）で、`examples/en/feature-samples/` は単独で描画できるファイルが並ぶ |
| 添付 | `--attach` は OAuth トークンか PAT が必要。GitHub App のトークン（Actions の `GITHUB_TOKEN` を含む）は拒否される（cli/cli#14309）。対象 repo への write 権限も必要 |
| PR の流れ | `docs/process.md` の手順 7 で `origin/main` を merge してから draft で PR を作る。draft の PR には `preview.yml` が走らない（ADR-2643） |
| フック | `gh` はラッパー（ADR-3342）を通る。`gh pr ready` の後は PostToolUse フックが次の手順を促す（ADR-3333） |

## 制約・前提

- 画像は repo にコミットしない。証拠は `reports/` に置き、main に入れない（ADR-2419）
- 撮影と添付はローカルのセッションで行う。CI のトークンでは添付できない
- 画像の有無で PR を止めない。描画が変わらない PR や、描画の変化が要点でない PR にまで手間を足さない
- **対象外**: VS Code の webview（ExTester が arm64 で動かない。必要なら #3355 のレコーダーを使う）、動画、ピクセル単位の比較（ADR-529 が見送った）

## 検討した選択肢

### 論点 1: before を何で描画するか

#### 案 1-A: merge-base の一時 worktree で描画する

`git worktree add --detach` で merge-base を checkout し、`pnpm install --frozen-lockfile --prefer-offline` を実行する。HEAD 側のスクリプトから、その worktree の `packages/core/src/index.ts` を動的に import して描画する。終わったら worktree を消す。

**メリット**

- before と after の違いが、そのブランチの変更だけになる
- 既存の `capture` をそのまま使える。描画は 1 プロセスの中で済む

**デメリット**

- install の分だけ時間がかかる（pnpm の store が温まっていれば数秒）
- before 側でも、HEAD 側のスクリプトが知っている `compile` / `compileProject` の呼び方で base の core を呼ぶ。PR がこのシグネチャを変えると before が描画できない。その場合は黙って誤った画像を出さず、失敗として報告する。公開 API のシグネチャを変える PR はまれなので、これを受け入れる。CLI（`karasu render`）を base 側で呼べばこの問題は無いが、ファイルとビューごとにプロセスを起こすことになり、`examples/` 全体では数分かかる

#### 案 1-B: 公開済みの `karasu` CLI で描画する

**デメリット**

- 前回のリリース以降に main に入った未リリースの変更まで、before と after の差に混ざる

#### 案 1-C: 本番のアプリ（`main` のデプロイ）を撮る

図の描画についてはアプリを介す必要が無く、アプリの起動やビューの切り替えの分だけ不安定になる。アプリの UI そのものの変更に限れば、手順 7 で `origin/main` を merge しているので merge-base は本番とほぼ一致し、使える。

### 論点 2: 何を撮るか、いつ撮る必要があるか

#### 案 2-A: 変更されたパスで決める

`packages/core/src/renderer/**` など、描画に効くパスの一覧を持ち、差分がそこに当たれば撮る。

**デメリット**

- 一覧の更新を忘れても何も落ちない（TPL-2446 と同じ形の失敗）
- リファクタのように描画が変わらない変更でも撮ることになる
- 何を撮るかは別に決める必要がある

#### 案 2-B: `examples/` を全部描画して、SVG が変わったものを撮る

`examples/` のエントリになる `.krs`（同じディレクトリのどの `.krs` からも `@import` されていないファイル）を、`system` / `deploy` / `org` のビューごとに base と HEAD で描画し、SVG の文字列が違う組だけを撮る。エージェントが回帰用の `.krs` を別に指定することもできる。

**メリット**

- 「撮る必要があるか」と「何を撮るか」が、1 つの観測できる事実（SVG が変わったか）で決まる
- パスの一覧を持たない

**デメリット**

- 描画が非決定的だと、変わっていない図まで撮ってしまう。実装時に、同じコミットを 2 回描画して一致することを確かめる
- `examples/` に現れない描画の変化は拾えない。その場合は `.krs` を指定する

### 論点 3: どうやって撮らせるか

#### 案 3-A: `docs/process.md` と PR テンプレートに手順を書くだけ

行動を変える力がいちばん弱い層で、依頼されなかったセッションでは撮られない。

#### 案 3-B: `gh pr ready` を、添付が無いあいだは拒否する

**デメリット**

- 描画が変わらない PR でも、毎回理由を付けて拒否を外す運用が増える
- ラッパーが判定するには、ready のたびに描画を回す必要がある

#### 案 3-C: `gh pr create` の後に PostToolUse フックで促す

`gh pr create` が PR の URL を出力したら、フックがブランチの差分を見る。`packages/core/src/` か `packages/app/src/` のテスト以外のファイルが変わっていて、本文に添付が無ければ、`pnpm pr:shots` を実行して `gh pr edit --attach` で添付するよう促す。止めはしない。

**メリット**

- ADR-3333 と同じ仕組みで、ツールを実行した直後の判断に届く
- パスの条件は「促すかどうか」だけに使う。撮るかどうかは論点 2 の SVG 比較で決まるので、条件が広すぎても、スクリプトが「描画は変わっていない」と答えて終わる

## 比較

| 観点 | 1-A worktree | 1-B 公開 CLI | 1-C 本番アプリ |
| --- | --- | --- | --- |
| 差がブランチの変更だけか | はい | いいえ | ほぼ（UI に限る） |
| 追加の時間 | install 数秒 | ほぼ無し | アプリ起動 |

| 観点 | 3-A 文書のみ | 3-B 拒否 | 3-C フックで促す |
| --- | --- | --- | --- |
| 依頼されなくても撮られるか | いいえ | はい | ほぼ |
| 描画が変わらない PR の手間 | 無し | 毎回外す | 無し |

## 現時点の方針

**案 1-A + 案 2-B + 案 3-C を採用する。** アプリの UI に限って 1-C を使う。

before と after の差が、そのブランチの変更だけで決まることを優先する。撮るかどうかの判定は SVG の比較という事実に寄せ、パスの一覧は促すきっかけにしか使わない。拒否まではしない。描画が変わらない PR の方が多く、そのたびに外す手間を作る価値が無いため。

### 実装の指針

<!-- absent-path-next-line: a file this design creates (#3359) -->
1. **`pnpm pr:shots`**（`scripts/pr-shots/shots.ts`。PoC 用の `scripts/report/` とは分け、その `capture` を import して使う）
   - base は `origin/main` との merge-base。`--base <ref>` で変えられる
   - 一時 worktree を `.claude/worktrees/pr-shots-base-<sha>` に detached で作り、install して、終了時（失敗時も）に消す。ブランチを持たない一時の checkout なので、`git worktree list` に残さない
   - `examples/` のエントリになる `.krs` を `system` / `deploy` / `org` で描画し、base と HEAD の SVG を比べる。`--file <path.krs>` で入力を足せる。base 側の描画が例外で失敗したら、その組を「before を描画できない」として報告し、画像は出さない
   - 変わった組だけ PNG にして `reports/pr-shots/<branch の / を - にした名前>/` に `<name>.before.png` / `<name>.after.png` として書く。既定では最初の 3 組だけを画像にし、残りは名前だけを一覧にする
   - 同じディレクトリに `body.md` を書く。before | after の表で `![…](./reports/pr-shots/…png)` を参照し、そのまま使える `gh pr edit <n> --body-file … --attach …` の例を出力する
   - 変わった組が 0 なら「examples の描画に変化なし」と出力して終了コード 0 で終わる
   - `--url <path>` では、本番のアプリ（`https://karasu.kompiro.dev<path>`）と、手元で起動した `pnpm dev`（`--after-origin` で変えられる）を同じパスで撮る。dev server の管理はしない（`scripts/report/screenshot.ts` と同じ方針）
   <!-- absent-path-next-line: a file this design creates (#3359) -->
2. **フック**（`scripts/pr-shots/reminder.sh`、`.claude/settings.json` の PostToolUse / PostToolUseFailure の Bash に足す）
   - `gh pr create` の出力にある PR の URL から PR を特定する（ADR-3333 と同じく、コマンド文字列ではなく出力を見る）
   - `gh pr diff --name-only` に `packages/core/src/` か `packages/app/src/` のテスト以外のファイルがあり、本文に `user-attachments` が無いときだけ、additionalContext を返す
   - 分からないときは何も出さない。Bash の呼び出しを壊さない
3. **文書**
   - `docs/process.md` の PR ワークフロー手順 10 に 1 行足す。「描画や UI が変わる PR は、本文に before/after を添付する。フックが促す。仕組みは ADR-3359」の形にし、スクリプトのパスは書かない
   - `.github/PULL_REQUEST_TEMPLATE.md` に `## Before / after` 節を足す。該当しなければ `N/A` と書く
   - `reports/README.md`「Capturing a real "before"」に `pnpm pr:shots` を足す
4. **テスト**
   - `pr-shots` の比較と出力（一時 repo と小さな `.krs` で、変化あり・なしの両方）
   - 同じコミットを 2 回描画して SVG が一致すること（非決定性があれば先に直すか、比較の前に正規化する）
   - フック（`converge-after-ready.test.ts` と同じく、偽の gh で、促す・促さないの両方）
5. AT: 新規。人間の確認が必要な項目は「描画が変わる実 PR で、本文の before/after が GitHub 上で表示される」の 1 件だけで、PR の checklist で確かめる
6. ADR 昇格: 実装のマージ後、`docs/adr/3359-pr-before-after-screenshots.md` として昇格し、本 Design Doc は同じ PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（開発の手順だけ）
- ドキュメント更新: `docs/process.md`、`.github/PULL_REQUEST_TEMPLATE.md`、`reports/README.md`
- テスト・examples への影響: なし。`examples/` は読むだけ

## 未解決の問い / 決めないこと

- **light と dark のどちらで撮るか**: まず light だけにする。テーマに関わる変更で必要なら `--theme` を足す
- **drill-down の階層**: 各ビューのルートだけを撮る。深い階層の変化は `--file` と専用の `.krs` で撮る
- **動画**: 操作の変化（hover、ナビゲーション）を見せたい場合は #3355 のレコーダーを使う。この設計には入れない
- **CI での撮影**: cli/cli#14309 が解決して App のトークンでも添付できるようになったら、改めて検討する
