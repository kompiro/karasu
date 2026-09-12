# raw NUL byte でソースが grep から消えるのを止めるガード

- **日付**: 2026-09-12
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2804](https://github.com/kompiro/karasu/issues/2804)
  - 先行事例: [#2216](https://github.com/kompiro/karasu/pull/2216)（1 回目、escape して修正・ガードなし）、[#2793](https://github.com/kompiro/karasu/pull/2793)（2 回目、6 週間後）
  - 関連 ADR: [ADR-953](../adr/953-ci-docs-only-paired-stub-workflow.md)（paired stub。本 doc で条件付きの例外を提案）、[ADR-2648](../adr/2648-record-source-path-guard.md)（同型ガードの先例）、[ADR-2125](../adr/2125-retire-adr-id-migration-map.md)（lint のためだけに存在する維持物を退役）、[ADR-2687](../adr/2687-adr-body-is-immutable.md)（ADR 本文は書き換えない）
  - 関連 TPL: [TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md), [TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md), [TPL-2643](../test-perspectives/TPL-2643-skip-reports-success-without-running.md), [TPL-1480](../test-perspectives/TPL-1480-consistency-check-triggers-on-both-sides.md), [TPL-2253](../test-perspectives/TPL-2253-removal-sweep-needs-a-search-not-a-file-list.md)
  <!-- absent-path-next-line: 本 doc が作成を提案するガード本体。実装 PR で実在させる -->
  - コード: `scripts/lint/no-nul-bytes.ts`（新規）

## 背景・課題

raw NUL byte（U+0000）を 1 個含むソースファイルは `grep` と `rg` にとって binary であり、
両者とも黙ってスキップする。マッチしない、警告も出ない、そのファイルを見たという形跡も残らない。
**症状が「エラー」ではなく「沈黙」**なので、期待したヒットが返ってこないことに気づく以外の
発見経路がない。

[#2216](https://github.com/kompiro/karasu/pull/2216) が 3 ファイル（`default-style.test.ts` /
`warnings.ts` / `scripts/acceptance/coverage.ts`）を escape 表記に直したが、再発を止める
仕組みは入れなかった。6 週間後、[#2793](https://github.com/kompiro/karasu/pull/2793) が
追加した `packages/core/src/renderer/` の `obstacle-index.test.ts` が sentinel 文字列
リテラルの中に NUL を 4 個抱えて入った。`file` は `data` と報告し、`grep -n "crossings"` は
`let crossings = 0;` と書いてある行に対して何も返さなかった。

CI も lefthook も oxlint もこれを報告しない。2 回起きて 2 回とも偶然見つかっている。

## 現状（インベントリ）

tracked file 全体（2287 ファイル / 26.0MB）を読んで NUL 保有を数えた実測:

| 事実 | 値 |
| --- | --- |
| NUL を含む tracked file | 12 件。拡張子は `.png`（8）、`.ttf`（3）、`.otf`（1）のみ |
| NUL を含まない拡張子 | `.md`(1106) `.ts`(763) `.tsx`(112) `.krs`(95) `.svg`(59) `.json`(48) `.yml`(35) `.css`(14) `.style`(9) `.mjs`(6) `.gitignore`(4) `.astro`(4) `.yaml`(3) `.toml`(3) ほか |
| 拡張子なしの tracked file | `Dockerfile`、`LICENSE`、`_redirects` |
| 全走査のコスト | `git ls-files` 3ms + 読み取り・走査 18ms = **21ms** |

既存の `scripts/lint/*.ts` ガードの配線は一様で、`package.json` の `lint:*` script、
`lefthook.yml` の pre-push job、`scripts/lint/*.test.ts` の vitest mirror（`test:scripts`
経由で `ci.yml` が実行）という 3 点セットになっている。

Required status check は `Check` / `Validate` / `Reference docs` / `Playwright` の 4 つ。
`secret-scan.yml` は唯一 path filter を持たない PR workflow だが **Required ではない**。

`Check` という名前は 1 つの workflow のものではなく、**複数の workflow の fan-in** に
なっている。branch protection は同名のチェックを AND するので、`ci.yml`（コード変更時）、
`ci-skip.yml`（docs-only の stub）、`at-check-coverage.yml`（`docs/acceptance` /
`docs/test-perspectives` / `docs/design` / `scripts/acceptance` 変更時）がいずれも
`name: Check` の job を出す。うち `at-check-coverage.yml` は **docs-only PR でありながら
`pnpm install` を行い、`lint:krs-fences` と `lint:record-source-paths` を実行している**
（「`ci.yml` の `paths-ignore` が、dead reference を持ち込みうる docs-only PR を
まさにスキップするから」という理由がファイルに書かれている）。本 doc 自身の PR
[#2809](https://github.com/kompiro/karasu/pull/2809) でその `Check` は 39 秒で緑になった。

つまり「docs-only PR に実検査を持たせるために `Check` をもう 1 本生やす」のは
本 doc が持ち込む新機軸ではなく、**すでに採られている形**である。

## 制約・前提

- **escape 表記は通らなければならない。** `"\0"` はディスク上では `0x5C 0x30` の 2 バイトで、
  ファイルを binary にしない。#2216 の修正はこの置換そのものなので、ガードは
  「文字列が評価された値」ではなく **バイト列**を見る必要がある。
- **binary asset は正当に NUL を持つ。** png / ttf / otf を finding にしてはいけない。
- **リポジトリは着地時点で緑でなければならない**（AC-4）。
- 対象は tracked file のみ。untracked なビルド成果物や `node_modules` は構造的に対象外にする。
- **symlink は追跡しない。** `readFileSync` は symlink を追跡するので、tracked symlink を
  そのまま読むと作業ツリー外のファイルの中身を、symlink 側のパスの finding として
  報告しうる。現時点で tracked symlink は 0 件だが、走査対象の定義はその偶然に
  依存させない。

## 検討した選択肢

### 論点 1: 「テキストファイル」をどう定義するか

#### 案 1-A: テキスト拡張子の allow-list（Issue の提案）

`.ts` `.tsx` `.md` `.json` `.yml` `.krs` `.css` を列挙し、それだけ走査する。

**メリット**

- 実装が短い。binary を読むことがない。

**デメリット**

- **失敗方向がこのガードの敵と同じ「沈黙」になる。** 新しいテキスト拡張子を足した日から、
  そのファイルは一度も走査されないまま緑になる。誰も気づかない。
  [TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md) が
  「private な列挙は最後に足したものを黙って取りこぼす」として扱っている失敗そのもの。
- 列挙が長い。実測で 14 拡張子と拡張子なし 3 ファイルがあり、今後も増える側。
- `Dockerfile` / `LICENSE` / `_redirects` のような拡張子なしファイルを表現できない。

#### 案 1-B: binary 拡張子の deny-list（推奨）

tracked file を全部読み、NUL を持っていたファイルだけを拡張子で仕分ける。
denied（`.png` `.ttf` `.otf`）なら想定どおり、それ以外なら finding。

**メリット**

- **失敗方向が「大声」になる。** 新しい binary 拡張子は最初のコミットで false positive として
  落ち、1 行足せば直る。新しいテキスト拡張子は足した日から自動的に守られる。
- 列挙が短く閉じている。実測で 3 件。拡張子なしファイルも自動で対象に入る。
- **deny-list を claim に縛れる**: denied な拡張子が tree のどこでも NUL を持っていなければ、
  そのエントリ自体を finding にする。これで「`.jpg` `.zip` を念のため足しておく」という
  検証されない肥大化が構造的に起きない。[ADR-2648](../adr/2648-record-source-path-guard.md) の
  「宣言はスイッチではなく claim」と同じ形で、[ADR-2125](../adr/2125-retire-adr-id-migration-map.md)
  が退役させた「lint のためだけに存在する維持物」にもならない。

**デメリット**

- binary asset も読む（26MB）。ただし実測 21ms なので無視できる。
- deny-list が空でないこと自体は維持物ではある。ただし claim に縛られる分、
  allow-list より腐りにくい。

#### 案 1-C: 内容から sniffing する（拡張子を見ない）

git 自身の判定（先頭 8000 バイトに NUL があれば binary）に倣う。

**デメリット**

- **循環している。**「NUL があるか」を「NUL があるか」で判定することになり、
  png と壊れた `.ts` を区別できない。案として成立しない。

### 論点 2: gate 側をどこに置くか

[TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md) が
**「gate 側で走らない検証は、存在しない検証として扱う」**と規定している。危険なのは
片方が欠けている状態ではなく、**両方あるが対象集合がずれている**状態で、広い方（ローカル）が
狭い方（CI）の穴を日常的に埋めるため、人間が出す PR では穴が観測されない。穴が見えるのは
bot PR、fork PR、Web UI 編集、`--no-verify` だけ。

本件では**この「穴が見える経路」こそが実際の混入経路**である。#2793 は AI が書いた
文字列リテラルから入った。

#### 案 2-A: vitest mirror のみ（他のガードと同じ配線）

<!-- absent-path-next-line: 本 doc が作成を提案する vitest mirror。実装 PR で実在させる -->
`scripts/lint/no-nul-bytes.test.ts` を `test:scripts` 経由で `ci.yml` が実行する。

**デメリット**

- `ci.yml` は `paths-ignore: docs/**, **/*.md, .claude/**` を持つ。docs-only PR では
  `ci-skip.yml` が **走らずに success を報告する**
  （[TPL-2643](../test-perspectives/TPL-2643-skip-reports-success-without-running.md)）。
  lefthook だけが広く CI が狭い、**TPL-2446 が名指しした形そのもの**になる。
- `.claude/**` と `docs/**` は Web UI 編集と AI 生成パッチが最も届きやすい場所でもある。

#### 案 2-B: `Check` の両側に明示ステップを置く（推奨）

`ci.yml` の Check job と `ci-skip.yml` の Check job の両方で走らせる。両者は厳密な
補集合ではない: `paths-ignore` は**変更が全部**無視対象のときだけ除外し、`paths` は
**1 つでも**該当すれば起動するので、コードと docs が混ざった PR では両方が発火する。
必要なのは補集合性ではなく**和集合が全 PR を覆うこと**で、それは満たされる。重複した
ぶんは branch protection が同名チェックを AND するので害がなく、`ci-skip.yml` が
concurrency group を `ci.yml` と分けているのはまさにこの重複時に stub が実 Check に
キャンセルされないためである（同ファイルのコメントに経緯がある）。

`ci-skip.yml` には node も pnpm も入っていない。ただし Node 24 は `.ts` を
そのまま実行できる（type stripping が既定）ので、`actions/checkout` と
`actions/setup-node` に続けて `node scripts/lint/no-nul-bytes.ts` を呼べば
**`pnpm install` なしに**走らせられる。実測でスキャン本体は 21ms。

**ADR-953 との関係**: ADR-953 は stub の中身を「`echo` で 0 終了する空 step」と定め、
却下した案として **「CI を常に走らせて内部 step で `if:` 分岐」** を挙げている。
却下理由は「docs-only でも runner 起動 + `pnpm install` まではかかるため CI 時間が
大して減らない」。本案は `pnpm install` を伴わないため、その却下理由には当たらない。
lint / typecheck / build / test をスキップするという ADR-953 の目的は保たれ、
**path filter する意味がない全 tree バイトスキャン 1 本だけ**が stub に加わる。

**ADR-953 の本文は書き換えない。** [ADR-2687](../adr/2687-adr-body-is-immutable.md) と
`.claude/rules/adr.md` が「frontmatter より下の行は触らない」と規定している。
また本案は ADR-953 を**覆していない**: paired stub パターンも補集合の運用ルールも
そのまま有効で、「stub の中身は空」という記述に条件付きの例外が 1 つ加わるだけなので、
`supersedes` は過剰であり、ADR-953 を `effective.md` から落としてしまう。
参照は frontmatter で張る（新 ADR と ADR-953 の `related_to`）。

**デメリット**

- `ci-skip.yml` の Check が現状の約 5 秒から 15 秒前後に増える。
- `node` 直実行と `tsx` 実行の 2 経路ができる。スクリプトが erasable syntax を
  外れると `node` 側だけ壊れるので、**vitest でどちらの経路も実行できることを縛る**。
- `ci.yml` と `ci-skip.yml` の path 補集合性は ADR-953 時点から手で保守されており、
  機械チェックがない。本案の「全 PR を覆う」はこの手保守に乗っている。

#### 案 2-C: `secret-scan.yml` に相乗りする

唯一 path filter のない PR workflow で、gitleaks という全 tree バイトスキャンの隣に置ける。

**デメリット**

- **Required ではない**ので TPL-2446 の言う gate にならない。落ちてもマージできる。
  Required に足すなら ruleset 変更が要り、案 2-D と同じコストになる。

#### 案 2-D: 専用 workflow を新設して Required 化する

path filter なしの `no-nul-bytes.yml` を足し、ruleset の required status checks に加える。

**デメリット**

- ruleset 変更は post-merge でしか反映できず、順序制約が出る（#1866 の
  `Playwright` Required 化と同型）。得られるものは案 2-B と同じ。

### 論点 3: TPL を起こすか

`test-infra` ラベルの Issue なので `docs/process.md` の 3-Yes ルールに掛ける。

| 条件 | 判定 |
| --- | --- |
| 横展開しうる | Yes。全 package・全 tracked text file が対象 |
| 構造的に再発しうる | Yes。6 週間あけて 2 回。症状が沈黙なので発見が偶然に依存する |
| 既存 TPL に未掲載 | Yes。[TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md) が NUL に触れるが path traversal の入力検証という別文脈 |

3-Yes を満たすので起こす。ただし**観点は「NUL を書くな」ではない**。それは機械チェックで
完全に閉じるので、観点として書く価値がない。残る非機械的な残差は
**「ガードの corpus 定義が、守るべき対象より先に腐らないか」**である。allow-list を選べば
新しいテキスト拡張子が黙って外れる。この観点は本ガードに限らず、走査対象を持つ
すべての drift guard に再適用できる。

## 比較

| 観点 | 案 1-A allow-list | 案 1-B deny-list |
| --- | --- | --- |
| 列挙の長さ（実測） | 14 拡張子 + 拡張子なし 3 件 | 3 拡張子 |
| 未知の拡張子が来たとき | テキストなら**黙って未検査** | binary なら**大声で false positive** |
| 拡張子なしファイル | 表現できない | 自動で対象 |
| 列挙の腐り検出 | なし | denied エントリが未使用なら finding |
| コスト | 読む量が少し減る | 26MB / 21ms |

| 観点 | 案 2-A mirror のみ | 案 2-B Check 両側 | 案 2-C secret-scan | 案 2-D 専用 workflow |
| --- | --- | --- | --- | --- |
| 全 PR を覆うか | No（docs-only が抜ける） | Yes | Yes | Yes |
| Required か | Yes | Yes | **No** | 要 ruleset 変更 |
| TPL-2446 適合 | **不適合** | 適合 | 不適合 | 適合 |
| 追加コスト | 0 | docs-only PR に約 10 秒 | 約 10 秒 | 約 10 秒 + 順序制約 |

## Related TPLs

- [TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md):
  gate 側の対象集合が全体を覆っているかを見る。論点 2 の判断根拠。
- [TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md):
  private な列挙は最後に足したものを黙って取りこぼす。論点 1 の判断根拠。
- [TPL-2643](../test-perspectives/TPL-2643-skip-reports-success-without-running.md):
  走らずに success を報告する gate。`ci-skip.yml` がこれに当たる。
- [TPL-1480](../test-perspectives/TPL-1480-consistency-check-triggers-on-both-sides.md):
  片側にだけ path filter / hook glob を張らない。lefthook job に `glob` を置かない根拠。
- [TPL-2253](../test-perspectives/TPL-2253-removal-sweep-needs-a-search-not-a-file-list.md):
  手書きのファイル一覧ではなく検索で閉じる。`git ls-files` 全走査の根拠。
- 本 PR で起こす proactive TPL（論点 3）: drift guard の corpus 定義は、
  未知の要素が来たときに黙って外れる側ではなく大声で落ちる側に倒す。

## 現時点の方針

**案 1-B（binary 拡張子の deny-list、claim に縛る）と案 2-B（`Check` の両側）を採用する。**

論点 1 は「このガードが敵にしている失敗モードを、ガード自身が持ってはならない」で決まる。
allow-list の失敗は沈黙であり、raw NUL の失敗と同じ形をしている。deny-list は失敗が大声で、
しかも実測で列挙が 3 件と短く、claim に縛れば肥大化もしない。

論点 2 は TPL-2446 が「gate 側で走らない検証は、存在しない検証」と規定している以上、
案 2-A は選べない。案 2-B は ADR-953 の却下理由（`pnpm install` のコスト）に当たらず、
ruleset も触らずに全 PR を覆える。

### 実装の指針

<!-- absent-path-next-line: 本 doc が作成を提案するガード本体。実装 PR で実在させる -->
1. `scripts/lint/no-nul-bytes.ts` を新規作成する。
   - **純関数と入口を分ける。** 判定本体は「ファイルパスとバイト列の列」を受け取る
     export された関数にし、`git ls-files` を呼ぶのは `main()` だけにする
     （`record-source-paths.ts` の `checkMarkdown(file, content, repoRoot)` と同じ形）。
     これで fixture テストが実リポジトリにも一時 git repository にも依存しない。
   - 入口は `git ls-files -s -z` を使い、**mode も一緒に受け取る**（untracked / ignored は
     構造的に対象外）。レコードは `<mode> <sha> <stage>\t<path>\0` で、`-z` が無いと
     NUL 終端にならずパスも quote されるので、`-s` と `-z` は必ず対で使う。
   - **symlink（mode `120000`）は読まずに skip する。** `readFileSync` は symlink を
     追跡するので、そのまま読むと作業ツリー外のファイルを読み、その NUL を symlink 側の
     finding として報告してしまう。git が tracked symlink に持たせている内容はリンク先の
     パス文字列で、そもそも NUL を含みえない。mode で判別すれば `lstat` の追加 syscall も要らない。
     現時点で tracked symlink は 0 件だが、判定を「今たまたま無いから」に依存させない。
   - 各ファイルを Buffer で読み、`indexOf(0)` で判定する。バイトを見るので
     `"\0"` の escape 表記は定義上そのまま通る。
   - finding は `nul-byte-in-text-file`（file / 1-based line / byte offset）と
     `stale-binary-extension`（denied なのに tree のどこでも NUL を持たない拡張子）の 2 種。
   - 失敗メッセージに直し方（escape 表記に置換する / deny-list に足す）を書く。
     `record-source-paths.ts` と同じく、`.claude/rules/` に同じことを書かない。
   - erasable syntax のみで書く（`node` 直実行の経路があるため）。
   <!-- absent-path-next-line: 本 doc が作成を提案する vitest mirror。実装 PR で実在させる -->
2. `scripts/lint/no-nul-bytes.test.ts` を新規作成する。
   - **fixture テストは純関数に直接バイト列を渡す**（実リポジトリにも git にも触らない）:
     raw NUL が落ちる / `\0` escape が通る / png・ttf・otf が通る / stale な deny
     エントリが落ちる。fixture 内の NUL は `String.fromCharCode(0)` で組み立てる
     （テストファイル自身を binary にしないため）。
   - **入口テストは別立てにする**: `git ls-files -s -z` の出力のパースと、mode `120000`
     の除外。純関数は mode を受け取らない（パスとバイト列だけ）ので、symlink の除外は
     こちら側でしか検証できない。
   - リポジトリ全体が finding ゼロ（AC-4、CI mirror を兼ねる）。ここだけが実リポジトリを見る。
   - **`node` 直実行の経路**が `tsx` 経路と同じ結果を返すこと（案 2-B の 2 経路対策）。
3. `package.json` に `lint:no-nul-bytes` を足す。
4. `lefthook.yml` に pre-push job を足す。**`glob` は置かない**（TPL-1480 と
   `record-source-paths` と同じ理由: どのファイルも NUL を獲得しうるので、
   path で絞ると混入させた push こそスキップする）。
5. `ci.yml` の Check に明示ステップ、`ci-skip.yml` の Check に `node` 直実行ステップを足す。
   両ファイルにクロスリファレンスのコメントを残す。
6. proactive TPL を `test-perspective` スキルで起こす（論点 3）。
7. AT: `docs/acceptance/2804-no-nul-bytes-guard.md`。TC は AC 4 件に加えて
   deny-list の staleness と 2 経路一致。全件自動化できるので `## 手動確認` は N/A。
8. ADR 昇格: 実装完了後に `docs/adr/2804-no-nul-bytes-guard.md` として昇格し、
   本 Design Doc は同 PR で削除する。stub が空でなくなったこととその条件
   （`pnpm install` を伴わない全 tree 検査に限る）は**新 ADR の本文に書く**。
   ADR-953 側は本文を触らず、frontmatter の `related_to` に新 ADR を足すだけにする
   （[ADR-2687](../adr/2687-adr-body-is-immutable.md)）。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし。開発者向けの検査のみ。
- リポジトリの現状: 着地時点で finding ゼロ。main の tracked file 2287 件のうち NUL 保有は
  png / ttf / otf の 12 件のみ（実測）。open PR 8 本が変更するファイルも全件 NUL なし
  （#2793 の `obstacle-index.test.ts` はレビュー中に修正済みで、マージされても緑を壊さない）。
- CI 時間: `ci-skip.yml` が出す `Check` が約 5 秒から約 15 秒に増える
  （checkout と setup-node の分。`pnpm install` は行わない）。`docs/acceptance` /
  `docs/test-perspectives` / `docs/design` を触る PR は `at-check-coverage.yml` の
  `Check`（約 39 秒）も並行して出しているので、体感の待ち時間は変わらない。
- ドキュメント更新: ADR 昇格時に ADR-953 の **frontmatter の `related_to` のみ**。
  本文は触らない（ADR-2687）。

## 未解決の問い / 決めないこと

- **`ci.yml` と `ci-skip.yml` の補集合性に機械チェックがない。** ADR-953 以来「必ず同じ集合を
  表すように保守する」という運用ルールと相互参照コメントだけで支えられている。案 2-B の
  「Required な `Check` が全 PR を覆う」はこの手保守に乗っている。本 doc では**決めない**:
  補集合性のガードは [TPL-2643](../test-perspectives/TPL-2643-skip-reports-success-without-running.md)
  の領域で、NUL byte とは独立した関心事なので別 Issue に切る。
- **deny-list の粒度は拡張子に固定する。** 「このディレクトリ配下はまるごと binary fixture」
  という単位が将来必要になる可能性はあるが、現時点で該当がないので拡張子だけにする。
  必要になった時点で、claim に縛る仕組み（未使用エントリを finding にする）はそのまま流用できる。
