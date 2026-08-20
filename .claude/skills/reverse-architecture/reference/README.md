# Bundled reference — generated copies, do not edit here

The reverse-architecture skill runs against an **arbitrary repository**, where
karasu's `docs/` tree does not exist. These files are byte-identical copies of
their sources in this repo, bundled so the skill carries its own grammar
instead of depending on the agent happening to run inside a karasu checkout.

| Bundled copy | Source | Why the skill needs it |
| --- | --- | --- |
| `syntax.md` | `docs/spec/syntax.md` | The `.krs` grammar — every construct the skill instructs an agent to write |
| `notation-cookbook.md` | `docs/guide/notation-cookbook.md` | Worked idioms, so an agent picks karasu-idiomatic shapes instead of inventing them |
| `tags-annotations.md` | `docs/spec/tags-annotations.md` | The boundary / annotation / tag / facet register split, and `@draft` |
| `diagnostics.md` | `docs/spec/diagnostics.md` | What the codes in the skill's Phase 4 table mean |

**Edit the source under `docs/`, never the copy here.** Then run:

```
pnpm run lint:skill-reference-bundle-sync --write
```

and commit the source and the copy in the same change. `pnpm run
lint:skill-reference-bundle-sync` (no flag) fails on any drift; it runs from
lefthook on pushes that touch either side, and in the `Reference docs` CI
workflow — the one that still runs on a docs-only PR, which is exactly the PR
that puts these copies out of date.

The copies keep their sources' relative links (`../adr/…`, `./style.md`), which
resolve in this repo and dangle outside it. That is the deliberate cost of
byte-identity: a link rewrite would break the comparison that makes the drift
guard trustworthy. Follow a dangling link back to
[the karasu repository](https://github.com/kompiro/karasu).
