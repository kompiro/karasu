---
paths:
  - "docs/test-perspectives/**"
  - "tpl.config.json"
---

# TPL の索引は再生成 PR だけが書く

**到達状態**: TPL を足す・直す PR の差分に `docs/test-perspectives/index.md` が無く、次が通る。

```
pnpm exec tsx scripts/adr/check-generated.ts --base origin/main
```

`index.md` は TPL の frontmatter から生成する索引で、毎日の再生成 PR（`pnpm adr:regenerate-pr`、
ADR の生成物と同じ PR）だけが書く（[#3289](https://github.com/kompiro/karasu/issues/3289)）。
TPL の PR は TPL のファイルだけを変え、索引の行は足さない。README に一覧表は無い。

手元で `pnpm tpl:regenerate` を実行して索引を見てよいが、コミットする前に捨てる:

```
(cd "$(git rev-parse --show-toplevel)" && git reset -q -- docs/test-perspectives/index.md && { git restore --source=HEAD --worktree -- docs/test-perspectives/index.md 2>/dev/null || rm -f docs/test-perspectives/index.md; })
```

混ぜた PR は pre-push の `adr-generated-check` と required check の `Validate` が止める。
`pnpm tpl:validate` は索引を見ない（`tpl.config.json` の `"indexCheck": false`）ので、
索引が古くても、まだ無くても落ちない。

`tpl.config.json` の `indexFile` を変える PR は、古い索引の削除だけを含め、新しい索引は書かない。
新しい索引は次の再生成 PR が作る（`.claude/rules/adr.md` の `paths.outputs` と同じ扱い）。
