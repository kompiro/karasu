# Contributing to karasu

> This is a focused starter file covering **license compliance**. A fuller
> contributing guide (setup, workflow, coding conventions) is tracked in
> [#1312](https://github.com/kompiro/karasu/issues/1312); when that lands, the
> section below will be folded into it.

For now, see [`docs/process.md`](docs/process.md) for the development workflow
and [`CLAUDE.md`](CLAUDE.md) for the repo layout and conventions.

## License compliance

karasu ships under [Apache-2.0](LICENSE). To keep redistribution clean we
automate two things in CI and the build.

### Production-dependency license allowlist

Every production dependency's SPDX license must be in this allowlist:

`MIT`, `ISC`, `BSD-2-Clause`, `BSD-3-Clause`, `Apache-2.0`, `MPL-2.0`,
`0BSD`, `Unlicense`, `CC0-1.0`

The CI job **`License allowlist`** runs `pnpm run check:licenses`
(`scripts/ci/check-license-allowlist.ts`, over `pnpm licenses list --prod`)
and fails the build on anything outside the list — including copyleft
licenses (GPL/LGPL/AGPL) and unrecognised or missing license metadata.

**If your PR fails this check:**

1. Prefer an alternative dependency whose license is already allowed.
2. If the dependency is genuinely necessary and its license is reasonable to
   accept, open an **ADR** (`docs/adr/`) proposing the allowlist change, and
   update `LICENSE_ALLOWLIST` in `scripts/ci/license-allowlist.ts` in the same
   PR. Changing the allowlist requires an ADR — it is a deliberate decision,
   not a quick fix.

The allowlist source of truth is `scripts/ci/license-allowlist.ts`; this
document mirrors it for convenience.

### Third-party notices

MIT and Apache-2.0 both require redistributing the upstream `LICENSE` text
when their code ships inside our artifacts. `scripts/ci/generate-third-party-notices.ts`
runs as a `prebuild` step for `packages/cli` and `packages/vscode` and writes
a `THIRD_PARTY_NOTICES.md` (git-ignored, regenerated on every build) listing
each production dependency with its version, SPDX id, and full license text.
It is included in the published npm tarball (`files`) and in the `.vsix`
produced by `vsce package`. **Do not edit it by hand** — change the generator
instead. You can regenerate locally with `pnpm run gen:notices`.

### NOTICE re-audit for major dependency bumps

Apache-2.0 §4(d) additionally requires propagating an upstream `NOTICE` file
*when one exists*. As of #1306 none of our production dependencies ship a
`NOTICE` file, so karasu has no `NOTICE` file. When a PR adds or major-bumps a
production dependency, the PR template asks the author to check the upstream
repo for a `NOTICE` file and, if present, merge its contents into a
repo-root `NOTICE`.

### Annual re-audit

Once a year (and any time the dependency surface changes meaningfully), run
`pnpm licenses list --prod --long` and skim for: new licenses creeping toward
the edge of the allowlist, and any newly-added `NOTICE` files. A future
addition under consideration is GitHub's `dependency-review-action` as a
PR-diff-level safety net once the repo is public.

See [`docs/design/license-compliance-automation.md`](docs/design/license-compliance-automation.md)
for the rationale.
