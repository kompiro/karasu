---
type: product
---

# AT: 自分のシステムを会話で .krs に残す `karasu-author` skill と、どのエージェントにも入れられる `karasu skill install`（#2912）

- **日付**: 2026-10-01
- **関連 Issue**: [#2912](https://github.com/kompiro/karasu/issues/2912)（親 [#2901](https://github.com/kompiro/karasu/issues/2901) の slice C2）
- **Related TPLs**: [TPL-2084](../test-perspectives/TPL-2084-skill-cli-command-refs-drift.md)（skill の CLI コマンド参照が登録済み。AC-1）、[TPL-2047](../test-perspectives/TPL-2047-doc-embedded-krs-is-parsed-not-prose.md)（skill に埋めた `.krs` は parse される。AC-1・AC-4）、[TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md)（repo 内の skill と、CLI がコピーする skill が同じ。AC-3）、[TPL-1681](../test-perspectives/TPL-1681-publishable-tarball-completeness.md)（公開 tarball が揃っている。AC-2）、[TPL-1716](../test-perspectives/TPL-1716-user-facing-surface-docs-sync.md)（CLI の表面と docs が食い違わない。AC-5）
- **対象ファイル**:
  - `packages/skills/skills/karasu-author/`（SKILL.md と同梱 reference）
  - `packages/skills/skills/reverse-architecture/SKILL.md`（Step 0 に capabilities の確認を追加）
  - `packages/cli/src/skill.ts` / `packages/cli/src/index.ts` / `packages/cli/src/capabilities.ts` / `packages/cli/src/agent-surface.json` / `packages/cli/package.json`
  - `scripts/lint/skill-reference-bundle-sync.ts`

> 自分のシステムを、エージェントとの会話で 1 層ずつ `.krs` に残す skill `karasu-author` を `karasu-skills` に加える。エージェントは同梱の文法（`reference/`）を読んで `.krs` を自分で書き、書くたびに `karasu check` → `karasu fmt` で検証する。Claude Code の plugin を入れられないエージェント向けに、CLI が skill をコピーする `karasu skill install` を足す。

## 受け入れ条件

### AC-1: skill が CLI と文法の現行に合っている

- [x] AT-A: `karasu-author` の SKILL.md が呼ぶ CLI コマンドはすべて登録済みである

  > ✅ Automated — `scripts/lint/skill-cli-refs.test.ts` › the real skills are in sync with the CLI registry › references no unknown command

- [x] AT-B: SKILL.md の ` ```krs ` fence（出発点のモデル）が parse エラーと deprecation warning なしで通る

  > ✅ Automated — `scripts/lint/krs-fences.test.ts`（`pnpm run lint:krs-fences` が `packages/skills/skills/**` を走査する）

- [x] AT-C: `karasu-author/reference/` の 4 文書が `docs/` の原本とバイト単位で一致し、編集禁止の README を持つ。reverse-architecture の同梱物も引き続き一致する

  > ✅ Automated — `scripts/lint/skill-reference-bundle-sync.test.ts` › the skill's bundled reference docs › are in sync in this repository / check() › requires the bundle's do-not-edit notice

### AC-2: 公開物に karasu-author が入り、CLI の版が刻まれる

- [x] AT-D: `pnpm pack` した `karasu-skills` に `karasu-author` の全ファイルが入り、SKILL.md の `metadata.karasu-version` と Step 0 に CLI の版が刻まれる

  > ✅ Automated — `scripts/skills/karasu-skills-package.test.ts` › karasu-skills packed tarball › ships the plugin manifest and every source file of every skill / stamps %s with the CLI version in metadata and in Step 0

- [x] AT-E: 2 つの skill とも、Step 0 が最初の節で、source にはプレースホルダが残っている。karasu repo の `.claude/skills/` から symlink 経由で同じ SKILL.md が読める

  > ✅ Automated — `scripts/skills/karasu-skills-package.test.ts` › karasu-skills sources › %s keeps the placeholder and puts Step 0 before any other section / keeps the dev symlink pointing at the packaged %s

### AC-3: `karasu skill install` / `karasu skill path`

- [x] AT-F: `karasu skill install <name> --dir <d>` が `<d>/<name>/` に SKILL.md と reference をコピーし、ほかの skill は入れない。名前を省くとすべて入る

  > ✅ Automated — `packages/cli/src/skill.test.ts` › karasu skill install › copies one skill with its bundled reference into <dir>/<name>/ / copies every skill when no name is given

- [x] AT-G: `--dir` を省くと `.claude/skills/` に入る

  > ✅ Automated — `packages/cli/src/skill.test.ts` › karasu skill install › defaults to .claude/skills under the working directory

- [x] AT-H: 入っている skill は上書きせずに失敗し、何もコピーしない。`--force` なら置き換え、古いファイルを残さない。コピーが途中で失敗したら、入っていた skill をそのまま残す

  > ✅ Automated — `packages/cli/src/skill.test.ts` › karasu skill install › refuses to overwrite an installed skill, and copies nothing / replaces an installed skill with --force, dropping stale files / keeps the installed skill when the --force copy fails part way

- [x] AT-I: 知らない名前は、ある skill の一覧を添えて失敗し、何も書かない

  > ✅ Automated — `packages/cli/src/skill.test.ts` › karasu skill install › rejects an unknown name before writing anything / karasu skill path › rejects an unknown name and lists the ones that exist

- [x] AT-J: `karasu skill path [name]` が `karasu-skills` パッケージ内の絶対パスを返す

  > ✅ Automated — `packages/cli/src/skill.test.ts` › karasu skill path › resolves the skills directory of the karasu-skills package / resolves one skill by name

- [x] AT-K: `karasu capabilities --json` が `skill` の下に `install` / `path` を `subcommands` として載せ、下にコマンドを持たないコマンドにはこのフィールドを出さない。テキスト出力にも `skill install [name]` が出る

  > ✅ Automated — `packages/cli/src/compat.test.ts` › karasu capabilities --json › lists nested commands under subcommands, and omits the field elsewhere / prints a plain-text summary without --json

- [x] AT-L: `skill install` の `--dir` / `--force` が後方互換の約束（`agent-surface.json`）に入り、消すには deprecation が要る

  > ✅ Automated — `packages/cli/src/compat.test.ts` › agent-facing surface baseline (agent-surface.json)

### AC-4: skill が教える書き方が、そのまま検証を通る

- [x] AT-M: SKILL.md の出発点のモデルに、SKILL.md の `karasu insert` の例を足したファイルが `karasu check` を診断なしで通り、`karasu fmt` の後に `fmt --check` も通る

  > ✅ Automated — `packages/cli/src/author-pipeline.e2e.test.ts` › karasu-author: write, then check, then fmt › the starter model plus the insert example checks clean and formats

- [x] AT-N: `insert` は parse できない入力でも書いてしまい、それを止めるのは `check`（終了コード 1）である。skill が「書いたら必ず check」とする根拠

  > ✅ Automated — 同上 › insert writes input that does not parse; check is what stops it

- [x] AT-O: parse は通るが正しくないモデル（同じ親の下の id 重複）も `check` が終了コード 1 で止める

  > ✅ Automated — 同上 › check rejects a model that parses but is not valid

### AC-5: 利用者向けの案内

- [x] AT-P: `karasu skill --help` が plugin での入れ方と `npx karasu skill install` の例を示し、`docs/tools/cli.md` / `.ja.md` のコマンド表に `skill install` / `skill path` の行と使い方の例が載る

  > ✅ Automated — `packages/cli/src/help-text.test.ts` › karasu skill --help (#2912) › shows both ways to install the skills / is documented in docs/tools/%s, with every subcommand in the table

## 手動確認

判定にエージェント本体と、公開済みの `karasu` / `karasu-skills` が要る項目。外部での検証は [#2913](https://github.com/kompiro/karasu/issues/2913)（slice D）で行う。

- [ ] AT-Q: karasu 以外の repo で `/plugin install karasu@karasu` すると `karasu-author` が一覧に出て、起動すると Step 0（版と capabilities の確認）を済ませてから `.krs` に触れる
- [ ] AT-R: karasu 以外の repo で `npx karasu skill install karasu-author --dir <エージェントの skill ディレクトリ>` を実行すると、Claude Code 以外のエージェントが skill を読み込んで起動できる
- [ ] AT-S: 会話でモデルを作るセッション: エージェントが 1 回の往復で 1 層だけを扱い、コードで分かることは質問せずに確認を求め、書くたびに `karasu check` → `karasu fmt` を実行し、終わりに何が `@draft` で何が未着手かをまとめる
