# Bundled reference — generated copies, do not edit here

The reverse-architecture skill runs against an **arbitrary repository**, where
karasu's `docs/` tree does not exist. These files are copies of their sources in
this repo, identical except for their links, bundled so the skill carries its own grammar
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

The one difference from the source is the links (#3103). A relative link in
the source resolves against `docs/`, which an installed skill does not have, so
the copy points it at the bundled sibling when the target is one of the files
above, and at the file in
[the karasu repository](https://github.com/kompiro/karasu) on GitHub otherwise.
`--write` applies that rewrite, and the check compares each copy to its
rewritten source.
