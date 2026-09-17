---
id: ADR-2804
title: raw NUL byte を含む tracked file を除外リスト方式の全走査で検出し、Required な Check の両側で走らせる
status: accepted
date: 2026-09-15
topic: build
scope:
  packages: []
  concerns: [ci]
related_to: [ADR-953, ADR-2648, ADR-2125, ADR-2687]
assumptions:
  - "file: scripts/lint/no-nul-bytes.ts"
  - "symbol: scripts/lint/no-nul-bytes.ts :: BINARY_EXTENSIONS"
  - "symbol: scripts/lint/no-nul-bytes.ts :: readRegularFiles"
  - "grep: package.json :: lint:no-nul-bytes"
  - "grep: lefthook.yml :: no-nul-bytes"
  - "grep: .github/workflows/ci.yml :: lint:no-nul-bytes"
  - "grep: .github/workflows/ci-skip.yml :: scripts/lint/no-nul-bytes.ts"
---

# ADR-2804: raw NUL byte を含む tracked file を除外リスト方式の全走査で検出し、Required な Check の両側で走らせる

- **日付**: 2026-09-15
- **ステータス**: 決定済み
- **関連**:
  - Issue: [#2804](https://github.com/kompiro/karasu/issues/2804)（Nothing stops a raw NUL byte from making a source file invisible to grep）
  - 設計 PR: [#2809](https://github.com/kompiro/karasu/pull/2809)、実装 PR: [#2821](https://github.com/kompiro/karasu/pull/2821)
  - 先行事例: [#2216](https://github.com/kompiro/karasu/pull/2216)（1 回目、escape して修正・ガードなし）、[#2793](https://github.com/kompiro/karasu/pull/2793)（2 回目）
  - 観点: [TPL-2804](../test-perspectives/TPL-2804-guard-scan-set-fails-loud-on-the-unknown.md)（走査集合は未知の要素で大声で落ちる側に定義する）、[TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md)（gate 側の検証は全体を覆う）、[TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md)、[TPL-2643](../test-perspectives/TPL-2643-skip-reports-success-without-running.md)
  - 関連 ADR: [ADR-953](953-ci-docs-only-paired-stub-workflow.md)（docs-only PR の paired stub。本 ADR が条件付きの例外を加える）、[ADR-2648](2648-record-source-path-guard.md)（同型ガードの先例、宣言は claim）、[ADR-2125](2125-retire-adr-id-migration-map.md)（lint のためだけの維持物を退役）、[ADR-2687](2687-adr-body-is-immutable.md)（ADR 本文は書き換えない）

## 背景

raw NUL byte（U+0000）を 1 個含むファイルは `grep` と `rg` にとって binary であり、両者とも黙って
スキップする。マッチしない、警告も出ない、読まれたという形跡も残らない。症状が「エラー」ではなく
「沈黙」なので、期待したヒットが返ってこないことに気づく以外に発見経路がない。

#2216 が 3 ファイルを escape 表記に直したが、再発を止める仕組みは入れなかった。6 週間後、#2793 が
追加したテストファイルが文字列リテラルの中に NUL を 4 個抱えて入り、`let crossings = 0;` と書いて
ある行への grep が何も返さなかった。2 回とも別件の grep が空振りしたことで偶然見つかっている。

着手時点の実測は次のとおり:

| 事実 | 値 |
| --- | --- |
| NUL を含む tracked file | 2287 件中 12 件。拡張子は `.png`（8）、`.ttf`（3）、`.otf`（1）のみ |
| テキスト側の拡張子 | 14 種以上に加え、拡張子のない `Dockerfile` / `LICENSE` / `_redirects` |
| 全走査のコスト | `git ls-files` と読み取り・判定を合わせて約 21ms（26MB） |

既存の `scripts/lint/*` ガードは `lint:*` script、lefthook の pre-push job、`test:scripts` 経由で
`ci.yml` が走らせる vitest mirror の 3 点で配線されている。ところが `ci.yml` は
`paths-ignore: docs/**, **/*.md, .claude/**` を持ち、docs-only PR では ADR-953 の stub
`ci-skip.yml` が**走らずに success を報告する**。この配線のままだと、lefthook だけが広く CI が狭い
状態になる。

## 決定

**tracked file を全部読み、binary 拡張子の除外リストに当たらないファイルに raw NUL があれば落とす
ガード `lint:no-nul-bytes` を置き、lefthook と、Required な `Check` を出す `ci.yml` / `ci-skip.yml`
の両方で走らせる。**

### 走査集合: 全体から binary 拡張子を除外し、除外リストを claim に縛る

- `git ls-files` の tracked file を全部読む。NUL が許されるのは `BINARY_EXTENSIONS`（`.png` /
  `.ttf` / `.otf`）の拡張子を持つファイルだけで、それ以外は `nul-byte-in-text-file` になる。
  拡張子のないファイルも Markdown も自動で対象に入る。
- `BINARY_EXTENSIONS` の各エントリは、NUL を持つ tracked file に 1 件以上裏付けられていなければ
  ならない。裏付けのないエントリは `stale-binary-extension` として報告する。念のため足した拡張子が
  検証されないまま残り、除外が実質的な列挙に戻るのを防ぐ。
- 判定はディスク上の**バイト**で行う。`\0` のような escape 表記はバックスラッシュと数字の 2 バイト
  なので、#2216 の修正はそのまま通る。

### 走査対象の読み方

実装とレビューで、走査集合を正しく定義しても**読み方で黙って取りこぼす**経路が 3 つ見つかった。
いずれも本ガードが防ぐべき沈黙と同じ形なので、決定に含める。

- **パスはバイト列のまま扱う。** `git ls-files -s -z` の出力を UTF-8 文字列に decode すると、
  UTF-8 として正しくない名前が置換文字に書き換わり、その名前はどのファイルにも一致せず読まれない。
  出力は Buffer のまま record を分割し、パスのバイト列を `lstatSync` / `readFileSync` へ渡す。
  文字列にするのは finding の表示だけで、不正な名前は非 ASCII バイトを `\xNN` で綴る。重複排除も
  バイト列で行う（表示が同じ別名のファイルがありうるため）。
- **レコードは最初のタブでだけ分割する。** `-z` は quoting を無効にするので、パス中のタブは
  そのままバイトとして出てくる。
- **ディスク上で通常ファイルでないものは読まない。** index の mode `120000` で tracked symlink を
  落とすのに加え、`lstatSync` で作業ツリー上の実体を確かめる。stage 前に symlink へ置き換えた
  tracked file は index 上 `100644` のままで、`readFileSync` が link 先を追うと作業ツリー外の
  ファイルを読み、FIFO や `/dev/zero` を指していれば pre-push が止まる。conflict 中のパスは stage
  ごとではなく 1 回だけ読む。

### gate の置き場

- **lefthook**: pre-push job に `glob` を置かない。どのファイルも NUL を獲得しうるので、path で
  絞ると混入させた push こそスキップする。
- **`ci.yml`**: `Check` job に明示ステップ（`pnpm run lint:no-nul-bytes`）を置く。
- **`ci-skip.yml`**: docs-only PR の stub にも同じ検査を置く。stub には `pnpm install` を足さず、
  `actions/checkout` と `actions/setup-node` のあと `node scripts/lint/no-nul-bytes.ts` で直接
  実行する（Node 24 は erasable な TypeScript をそのまま実行できる）。`ci.yml` の `paths-ignore`
  と `ci-skip.yml` の `paths` は、変更が混在する PR で両方発火するため厳密な補集合ではないが、
  和集合は全 PR を覆う。重複は branch protection が同名チェックを AND するので害がない。

### ADR-953 との関係

ADR-953 は stub の中身を `echo` で 0 終了する空 step と定め、「CI を常に走らせて内部 step で
`if:` 分岐する」案を「docs-only でも runner 起動と `pnpm install` まではかかる」ことを理由に
却下している。本 ADR は **`pnpm install` を伴わない全 tree バイト検査 1 本に限って**、stub が
空でなくなることを認める。lint / typecheck / build / test をスキップするという ADR-953 の目的と、
両ファイルの path リストを同じ集合に保つ運用ルールはそのまま有効である。

ADR-953 は覆していないので `supersedes` は使わない。ADR-2687 に従い ADR-953 の本文は書き換えず、
参照は両者の frontmatter の `related_to` で張る。

### 機械で縛っているもの

`scripts/lint/no-nul-bytes.test.ts` が次を検査し、`test:scripts` として `ci.yml` で走る:

- 判定: raw NUL が行・オフセット・個数付きで落ちる、escape 表記が通る、除外拡張子が通る、
  裏付けのない除外拡張子が落ちる、拡張子なしファイルと Markdown が対象に入る
- 読み方: 合成した `git ls-files -s -z` 出力でタブ入りパス・symlink・conflict stage・UTF-8 でない
  名前を扱い、実ファイルで作業ツリー上の symlink とディレクトリを飛ばし、実 git repository で
  UTF-8 でない名前のファイルを走査する
- 配線: `package.json` の script、lefthook job に `glob` が無いこと、`ci.yml` と `ci-skip.yml` の
  両方にステップがあること、`ci-skip.yml` が依存を install しないこと
- 2 経路の一致: `ci-skip.yml` が書いている `node` コマンドの実行結果が `tsx` 経由と一致すること。
  erasable でない構文が入ると docs-only 側だけが壊れるのを防ぐ
- 実リポジトリが finding ゼロで、かつ実際に tree を読んでいること

## 理由

- **ガードは、自分が検出する失敗と同じ向きに失敗してはならない。** allow-list の取りこぼしは
  「新しい種類のファイルが黙って読まれない」で、raw NUL の症状と同じ沈黙である。外から
  「ガードが緑」と「対象外で読まれていない」を区別できない。除外リスト方式の失敗は false positive
  で、最初のコミットで必ず表に出て 1 行で直る（TPL-2804、TPL-1720）。
- **除外リストは実測で短く閉じている。** 3 拡張子で全 tree が説明でき、テキスト側の列挙より
  はるかに小さい。claim に縛れば肥大化もしない（ADR-2648 の「宣言はスイッチではなく claim」、
  ADR-2125 の「lint のためだけの維持物を作らない」と同じ形）。
- **全走査は安い。** 実測約 21ms で、「重いから列挙する」理由が無かった。lefthook に `glob` を
  置かない判断もこのコストが支えている。
- **gate 側で走らない検証は、存在しない検証である（TPL-2446）。** 穴が見えるのは bot PR・Web UI
  編集・AI 生成パッチ・`--no-verify` だけで、#2793 はまさに AI が書いた文字列リテラルから入った。
  vitest mirror だけでは docs-only PR が抜ける。
- **実例がこの判断を裏付けた。** 実装中、AT レコード（Markdown）を書く過程で U+0000 の escape
  表記が生のバイトとして書き出され、その行への grep が何も返さなかった。ガードは stage した時点で
  報告した。テキスト系ソースの allow-list なら Markdown は対象外で、`ci.yml` だけの配線なら
  docs-only PR で素通りしていた。
- **ADR-953 の却下理由に当たらない。** 却下の根拠は `pnpm install` のコストで、本 ADR の stub
  ステップは install を伴わない（実測で docs-only の `Check` は 6〜9 秒）。

## 却下した案

- **テキスト拡張子の allow-list（Issue の当初提案）**: 失敗が沈黙になる。拡張子のないファイルを
  名指しできず、列挙は長く、今後も増える側にある。
- **内容から binary を判定する（git の先頭 8000 バイト判定に倣う）**: 「NUL があるか」を
  「NUL があるか」で判定することになり循環する。png と壊れた `.ts` を区別できない。
- **claim に縛らない除外リスト**: 裏付けのないエントリが溜まり、除外が列挙に戻る。
- **vitest mirror だけで CI に載せる（他のガードと同じ配線）**: docs-only PR では `ci-skip.yml` が
  走らずに success を報告し、TPL-2446 が名指しした「ローカルが広く CI が狭い」形になる。
- **`secret-scan.yml` に相乗りする**: 唯一 path filter の無い PR workflow だが Required ではなく、
  落ちてもマージできる。
- **専用 workflow を新設して Required にする**: 得られるものは `Check` の両側に置く案と同じで、
  ruleset 変更の順序制約（#1866 の `Playwright` Required 化と同型）だけが増える。
- **`ci-skip.yml` に `pnpm install` を足して `tsx` で走らせる**: ADR-953 が却下したコストをそのまま
  持ち込む。
- **ADR-953 を `supersedes` する / 本文の運用ルールを改訂する**: ADR-953 の決定は覆っておらず、
  `supersedes` は有効な決定を `effective.md` から落とす。本文の改訂は ADR-2687 が禁じている。
- **パスを UTF-8 文字列として扱う**: 実装初版はこうしていた。UTF-8 として正しくない名前のファイルが
  黙って読まれないことをレビューで指摘され、scratch repository で再現した（tracked 2 件のうち
  走査 1 件）。バイト列のまま扱う形に改めた。

## 影響

- docs-only PR の `ci-skip.yml` の `Check` に checkout と setup-node と検査が加わり、数秒延びる。
  lint / typecheck / build / test は引き続きスキップされる。
- `node` 直実行と `tsx` 実行の 2 経路ができた。スクリプトは erasable な TypeScript で書き続ける
  必要があり、テストが 2 経路の一致を検査する。
- 新しい binary asset の拡張子を追加すると、最初のコミットで `nul-byte-in-text-file` として落ちる。
  `BINARY_EXTENSIONS` に 1 行足して直す。逆にその拡張子のファイルが全部消えたら
  `stale-binary-extension` で落ちるので、エントリを外す。
- **決めていないこと**: `ci.yml` の `paths-ignore` と `ci-skip.yml` の `paths` が同じリストで
  あることは ADR-953 以来手で保守されており、機械チェックが無い。本 ADR の「和集合が全 PR を覆う」
  はこの手保守に乗っている。このガードは TPL-2643 の領域で、NUL byte とは独立した関心事として
  別に扱う。除外リストの粒度は拡張子に固定しており、「ディレクトリごと binary fixture」の単位が
  必要になった時点で、claim に縛る仕組みをそのまま流用して拡張する。
