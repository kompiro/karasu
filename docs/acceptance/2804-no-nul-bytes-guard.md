---
type: tool
---

# AT: raw NUL byte でソースが grep から消えるのを止めるガード

- **日付**: 2026-09-14
- **関連 Issue**: [#2804](https://github.com/kompiro/karasu/issues/2804)
- **関連 ADR**: [ADR-953](../adr/953-ci-docs-only-paired-stub-workflow.md)（docs-only PR の paired stub。stub が `pnpm install` を伴わない検査を 1 本だけ持つ条件の根拠）
- **Related TPLs**: [TPL-2804](../test-perspectives/TPL-2804-guard-scan-set-fails-loud-on-the-unknown.md)（走査集合は未知の要素で大声で落ちる側に定義する。本 Issue で起こした観点）、[TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md)（gate 側の検証は全体を覆う）、[TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md)（列挙は最後に足したものを取りこぼす）、[TPL-2185](../test-perspectives/TPL-2185-drift-guard-distinguishes-declaration-from-mention.md)（宣言と言及を区別する）
- **対象ファイル**:
  - `scripts/lint/no-nul-bytes.ts`（ガード本体）
  - `.github/workflows/ci.yml` / `.github/workflows/ci-skip.yml`（Required な `Check` の両側）
  - `lefthook.yml`（pre-push）

## 概要

raw NUL byte を含む tracked text file は `grep` / `rg` から binary 扱いされ、黙ってスキップされる。
`pnpm run lint:no-nul-bytes` は tracked file を全部読み、binary 拡張子（`.png` / `.ttf` / `.otf`）以外で
NUL を持つファイルを、ファイル・行・オフセット付きで報告して非ゼロ終了する。

## 受け入れ条件

### AC-1: raw NUL は落ち、escape 表記は通る（Issue の AC 1・2）

- [x] tracked text file に raw NUL があると、ファイル・1-based の行・オフセット・個数を挙げて落ちる
> ✅ Automated — `scripts/lint/no-nul-bytes.test.ts` › `reports a raw NUL in a text file with its line, offset and count` / `names the file and line of a finding`

- [x] 同じ値を escape 表記（`\0` / `\u0000`）で書いたファイルは通る。バイトを見るので、ディスク上の backslash と数字は NUL ではない
> ✅ Automated — `scripts/lint/no-nul-bytes.test.ts` › `passes the escaped spelling, which is plain ASCII on disk`

- [x] 拡張子のないファイル（`Dockerfile`）と Markdown も検査対象に入る。allow-list では名指しできなかった範囲
> ✅ Automated — `scripts/lint/no-nul-bytes.test.ts` › `reports a file with no extension, which an allow-list could not have named` / `reports a Markdown file too: code search reads docs as well as sources`

- [x] 失敗時の出力が、直し方（escape 表記に置き換える / binary 拡張子を足す）を持っている
> ✅ Automated — `scripts/lint/no-nul-bytes.test.ts` › `shows the escaped spelling to write instead` / `says where a binary extension goes and that it must stay backed`

### AC-2: binary 拡張子の deny-list は claim に縛られる

- [x] `BINARY_EXTENSIONS` の拡張子を持つファイルの NUL は報告しない。拡張子は大文字小文字を区別しない
> ✅ Automated — `scripts/lint/no-nul-bytes.test.ts` › `does not report a NUL in a file whose extension is denied` / `matches a denied extension case-insensitively`

- [x] NUL を持つファイルに 1 件も裏付けられていない拡張子は、それ自体が finding になる（念のため足した拡張子が残らない）
> ✅ Automated — `scripts/lint/no-nul-bytes.test.ts` › `reports a denied extension that no NUL-carrying file backs` / `does not count a NUL-free file with a denied extension as backing`

- [x] 拡張子は最後のものを小文字で取り、拡張子なしのファイルと dotfile は空になる
> ✅ Automated — `scripts/lint/no-nul-bytes.test.ts` › `returns the last extension, lower-cased, with its dot` / `returns an empty string for a file without one, including a dotfile`

### AC-3: 走査対象は git の index から正しく読む

- [x] `git ls-files -s -z` のレコードから mode とパスを読み、末尾の NUL 終端を空パスとして拾わない
> ✅ Automated — `scripts/lint/no-nul-bytes.test.ts` › `reads mode and path from each NUL-terminated record` / `does not read the trailing terminator as an empty path`

- [x] パスに含まれるタブを保つ（レコードを最初のタブでだけ分割する）
> ✅ Automated — `scripts/lint/no-nul-bytes.test.ts` › `keeps a tab inside a path, splitting the record at the first tab only`

- [x] symlink（mode `120000`）は読まない。conflict 中のパスは stage ごとではなく 1 回だけ読む
> ✅ Automated — `scripts/lint/no-nul-bytes.test.ts` › `drops a symlink, whose content would be read from the link's target` / `reads an unmerged path once, not once per conflict stage`

- [x] 作業ツリーが index と食い違っていても、ディスク上で通常ファイルでないものは読まない。stage 前に symlink へ置き換えた tracked file（index 上は `100644`）の link 先を追わず、ディレクトリや消えたパスも飛ばす（FIFO や `/dev/zero` を指す link で pre-push が止まらない）
> ✅ Automated — `scripts/lint/no-nul-bytes.test.ts` › `does not follow a symlink that replaced a tracked regular file` / `skips a directory standing where a file was, and a path gone from disk`

### AC-4: lefthook と CI の両方で、全 PR に対して走る（Issue の AC 3）

- [x] `package.json` の `lint:no-nul-bytes` として呼べる
> ✅ Automated — `scripts/lint/no-nul-bytes.test.ts` › `is a package script`

- [x] lefthook の pre-push job として `glob` なしで走る（どのファイルも NUL を獲得しうる）
> ✅ Automated — `scripts/lint/no-nul-bytes.test.ts` › `runs on pre-push with no glob, since any file can acquire the byte`

- [x] Required な `Check` を出す 2 つの job の両方で走る: コード変更時の `ci.yml` と、docs-only PR の `ci-skip.yml`
> ✅ Automated — `scripts/lint/no-nul-bytes.test.ts` › `runs in ci.yml, the Check for code changes` / `runs in ci-skip.yml, the Check for docs-only PRs`

- [x] `ci-skip.yml` は依存を install しない（ADR-953 が常時 CI を却下した理由のコストを持ち込まない）。コメントでの言及は install ではないので数えない
> ✅ Automated — `scripts/lint/no-nul-bytes.test.ts` › `keeps ci-skip.yml free of dependency installs, the cost ADR-953 rejected`

- [x] `ci-skip.yml` が実際に書いている `node` コマンドで実行した結果が、`tsx` 経由と同じになる（erasable でない構文が入ると docs-only 側だけが壊れるのを防ぐ）
> ✅ Automated — `scripts/lint/no-nul-bytes.test.ts` › `runs under plain node exactly as ci-skip.yml invokes it`

### AC-5: リポジトリはガード着地時点で通る（Issue の AC 4）

- [x] 実リポジトリの tracked file に finding がない
> ✅ Automated — `scripts/lint/no-nul-bytes.test.ts` › `has no finding`

- [x] 実際に tree を読んでいる（何も読まずに緑になる状態を落とす）
> ✅ Automated — `scripts/lint/no-nul-bytes.test.ts` › `actually reads the tree, so an empty scan cannot pass as a clean one`

## 検証方法

```bash
pnpm run lint:no-nul-bytes
pnpm exec vitest run --config scripts/vitest.config.ts scripts/lint/no-nul-bytes.test.ts
```

## 手動確認

N/A — 自動テストですべて覆っている。
