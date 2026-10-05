---
type: product
---

# AT: karasu の skill を npm の `karasu-skills` として配り、Claude Code に plugin として入れられる（#2932）

- **日付**: 2026-09-28
- **関連 Issue**: [#2932](https://github.com/kompiro/karasu/issues/2932)（親 [#2901](https://github.com/kompiro/karasu/issues/2901) の slice C1）
- **設計**: [#2901](https://github.com/kompiro/karasu/issues/2901) の Design Doc（案 1-D、PR #2931）
- **Related TPLs**: [TPL-1681](../test-perspectives/TPL-1681-publishable-tarball-completeness.md)（公開 tarball に必要なものが揃い、余計なものが入らない。AC-1）、[TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md)（repo 内の skill と公開物が刻印以外で同じ。AC-2・AC-5）、[TPL-2084](../test-perspectives/TPL-2084-skill-cli-command-refs-drift.md)（skill の CLI コマンド参照が登録済み。AC-4）
- **対象ファイル**:
  - `packages/skills/package.json` / `packages/skills/.claude-plugin/plugin.json` / `packages/skills/scripts/stamp-version.mjs` / `packages/skills/skills/reverse-architecture/`
  - `.claude-plugin/marketplace.json`
  - `.claude/skills/reverse-architecture`（`packages/skills/skills/reverse-architecture` への symlink）
  - `scripts/lint/skill-cli-refs.ts` / `scripts/lint/skill-reference-bundle-sync.ts` / `scripts/lint/krs-fences.ts`

> reverse-architecture を新しいパッケージ `karasu-skills` に移し、Claude Code の plugin として npm から入れられるようにする。pack 時に CLI の版を各 SKILL.md に刻み、skill は最初の手順（Step 0）で利用者の CLI がその版以上かを確かめる。karasu repo では元の場所に symlink を残し、食い違いのチェックは実体を見る。

## 受け入れ条件

### AC-1: 公開 tarball が plugin の形をしている

- [x] AT-A: `pnpm pack` した tarball に `.claude-plugin/plugin.json` と、`skills/` の全ファイル（SKILL.md と reference）が入り、stamp スクリプトとその退避先は入らない

  > ✅ Automated — `scripts/skills/karasu-skills-package.test.ts` › karasu-skills packed tarball › ships the plugin manifest and every source file of every skill / does not ship the stamping script or its backup

### AC-2: CLI の版が刻まれ、作業ツリーは元に戻る

- [x] AT-B: tarball の各 SKILL.md では、`metadata.karasu-version` と Step 0 の本文が pack 時の CLI の版になり、プレースホルダが残らない

  > ✅ Automated — `scripts/skills/karasu-skills-package.test.ts` › karasu-skills packed tarball › stamps %s with the CLI version in metadata and in Step 0

- [x] AT-C: `pnpm pack` の前後で `packages/skills` の git status が変わらない

  > ✅ Automated — `scripts/skills/karasu-skills-package.test.ts` › karasu-skills packed tarball › leaves the working tree as it found it

- [x] AT-C2: 刻印の途中で失敗しても何も書き換えない（placeholder の無い skill が 1 つでもあれば、どの SKILL.md にも触れずに失敗する。npm は prepack の失敗後に postpack を走らせないため）

  > ✅ Automated — `scripts/skills/karasu-skills-package.test.ts` › stamp-version.mjs on a skill without the placeholder › fails without touching any skill

### AC-3: marketplace の定義が npm のパッケージを指す

- [x] AT-D: marketplace の entry が `{"source": "npm", "package": "karasu-skills"}` で、plugin 名と合わせて `karasu@karasu` で入れられ、どちらの manifest も版を固定しない

  > ✅ Automated — `scripts/skills/karasu-skills-package.test.ts` › plugin and marketplace manifests

### AC-4: 食い違いのチェックが実体を見る

- [x] AT-E: `skill-cli-refs` が `packages/skills/skills` を走査し、symlink 経由の同じ skill を二重に数えない

  > ✅ Automated — `scripts/lint/skill-cli-refs.test.ts` › check (packaged skills and the dev symlink)

- [x] AT-F: `skill-reference-bundle-sync`・`reverse-skill-adr-sync`・`krs-fences` が `packages/skills/skills` の実体を読む

  > ✅ Automated — `scripts/lint/skill-reference-bundle-sync.test.ts` / `scripts/lint/reverse-skill-adr-sync.test.ts` / `scripts/lint/krs-fences.test.ts` › covers the spec, guide, acceptance and concepts docs, and the published skills

### AC-5: karasu repo 内では今までどおり使える

- [x] AT-G: `.claude/skills/reverse-architecture/SKILL.md` が symlink 経由で、パッケージ内の SKILL.md と同じ内容を返す

  > ✅ Automated — `scripts/skills/karasu-skills-package.test.ts` › karasu-skills sources › keeps the dev symlink pointing at the packaged reverse-architecture

### AC-6: karasu 以外の repo に plugin として入る（初回 publish 後）

marketplace の解決、npm からの取得、Step 0 をエージェントが実際にどう扱うかは Claude Code 本体の挙動で、テストからは届かない。下の「手動確認」で見る。

## 手動確認

判定に Claude Code 本体と、公開済みの `karasu-skills`（初回 publish は maintainer の手作業、`docs/release.md`）が要る 3 項目。新しい版を公開した後に更新がどう届くかは、こちらから任意に起こせる事象ではないので AT に置かず、`docs/release.md` のリリース手順で確かめる。

- [ ] AT-H: karasu repo で Claude Code を開くと `reverse-architecture` skill が一覧に出て起動でき、Step 0 が「repo 内の未公開版」として照合を飛ばす
- [ ] AT-I: karasu 以外の repo で `/plugin marketplace add kompiro/karasu` → `/plugin install karasu@karasu` を実行すると、npm の `karasu-skills` から `reverse-architecture` が入り、起動できる
- [ ] AT-J: 手元の karasu CLI が刻まれた版より古い（または入っていない）状態で skill を起動すると、Step 0 が `.krs` に触れる前に更新を案内して止まる。同じ版以上なら何も言わずに進む
