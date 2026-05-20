# Contributing to karasu

Thanks for taking the time to look at karasu. This guide tells you where to
file things, what to expect from the maintainer, and what the basic flow
looks like if you want to send a change.

## Maintainer stance — "Best-effort, no SLA"

karasu is a **personal learning project** — one of its stated goals is to
explore Claude Code in the open. The maintainer ([@kompiro](https://github.com/kompiro))
works on it in spare time.

That means:

- **Response time is not guaranteed.** Issues and PRs may sit for days or
  weeks. That is normal here.
- **Priorities follow maintainer interest and bandwidth.** A well-argued
  request can still be declined, deferred, or left open.
- **No backwards-compatibility promise on TypeScript APIs (yet).** The
  `.krs` / `.krs.style` language reaches a stable v1.0 at OSS launch
  (see the `docs/spec/` references); the `@karasu-tools/core` / `lsp`
  TypeScript surfaces stay on `0.x` with no stability promise.
- **External contributions are welcome but optional.** The project will
  continue to make sense without them, so don't feel obligated to send
  anything.

If you need a guaranteed turnaround for something — please don't depend on
karasu for it.

## Code of Conduct

Participation is governed by the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md).
Report concerns via GitHub's [private vulnerability reporting](https://github.com/kompiro/karasu/security/advisories/new)
on this repository or by DMing [@kompiro](https://github.com/kompiro).

## Security

Found a security vulnerability? **Do not file a public Issue.** Use GitHub's
[private vulnerability reporting](https://github.com/kompiro/karasu/security/advisories/new)
instead. The full policy — supported versions, coordinated-disclosure
expectations, and the best-effort response target — is in
[`SECURITY.md`](SECURITY.md).

## How to file an Issue

Issues are the **external contributor surface**. There are exactly two
templates:

- **[Bug report](.github/ISSUE_TEMPLATE/bug-report.yml)** — something is
  wrong with karasu as it ships: a CLI command fails, a `.krs` file is
  rendered incorrectly, an LSP diagnostic is misleading, the VS Code
  extension behaves badly, docs say X but the code does Y.
- **[Feature request](.github/ISSUE_TEMPLATE/feature-request.yml)** —
  something is missing. The template walks you through karasu's scope
  filter (see [`docs/concepts.md`](docs/concepts.md) → "Goals and non-goals
  → Non-goals"); if your request pulls karasu toward implementation detail,
  runtime state, or the time axis, expect a longer discussion before
  anyone implements it.

**Please write Issues, PRs, and comments in English.** The user-facing
documentation has a Japanese track (`docs/concepts.ja.md`, `README.ja.md`),
but the contributor-facing surface (Issues, PRs, commit subjects, code,
labels, workflow names) is English-only — see the language policy in
[`docs/process.md`](docs/process.md) and [`CLAUDE.md`](CLAUDE.md).

### Intake workflow

What happens after you file an Issue depends on what kind of change it is.
The diagram below is the **maintainer-internal** workflow — you don't need
to drive any of the right-hand boxes; the maintainer does. Knowing it
exists helps explain why a feature request might sit before becoming a PR.

```
External (you file this) ──────────► Maintainer-internal (we do this)
─────────────────────────            ─────────────────────────────────
feature-request ─┬───────────────────────────────────────► /start-dev
                 │  (single, small, design already clear)
                 │
                 └──► system-requirements ─► design-doc ─► /start-dev
                      (triage bundle of      (docs/design/
                       related requests)      <slug>.md via
                                              /hane:design-doc)

bug-report ──────┬───────────────────────────────────────► /start-dev
                 └──► design-doc ─► /start-dev  (when the fix is structural)
```

External contributors are **not** expected to author design docs or
system-requirements bundles — those require deep familiarity with
`docs/concepts.ja.md`, the ADR history, and the
[Test Perspective Library (TPL)](docs/test-perspectives/README.md). File an
Issue with the templates and the maintainer will pick the right path.

## Setup

Prerequisites: **Node.js 22+** and **pnpm 10+** (matching the
`packageManager` field in `package.json`).

```sh
git clone https://github.com/kompiro/karasu.git
cd karasu
pnpm install --frozen-lockfile
```

Common scripts (run from the repository root):

```sh
pnpm run dev          # Run the preview app (Vite)
pnpm run build        # Build core, lsp, app, and the cli bundle
pnpm run test         # Vitest across all packages
pnpm run lint         # oxlint
pnpm run format       # oxfmt --write
pnpm run typecheck    # tsc --noEmit per package
pnpm run knip         # unused dependency / export check
pnpm run check:cycles # madge --circular over the production packages
```

`packages/cli/` builds with `esbuild` into a self-contained ESM bundle
(`packages/cli/dist/index.js`), so `node packages/cli/dist/index.js render
examples/getting-started/index.krs` works as a smoke test after `pnpm build`.

## Branch and commit conventions

- **`main` is protected.** Direct pushes and direct commits to `main` are
  blocked — every change goes through a PR.
- **Branch naming** is `feat/<kebab>`, `fix/<kebab>`, `docs/<kebab>`,
  `chore/<kebab>`, or `refactor/<kebab>`.
- **Commit subjects** follow [Conventional Commits](https://www.conventionalcommits.org/)
  and are written in English. The subject is what changesets and the
  release tooling read.
- **Changesets**: if your PR changes the published `karasu` CLI's
  user-visible behaviour, run `pnpm changeset` and commit the generated
  `.changeset/*.md` file. Internal refactors, test-only changes, and
  documentation don't need a changeset. The release flow itself is
  documented in [`docs/process.md`](docs/process.md) ("リリース運用") and
  recorded in [ADR-20260512-05](docs/adr/20260512-05-release-automation-changesets.md).

The full development workflow — worktree setup, the `status: *` issue
labels, the `/hane:start-dev` skill that automates the loop end-to-end —
lives in [`docs/process.md`](docs/process.md). The repository is organized
to be navigable with [Claude Code](https://claude.com/claude-code) and the
[`kompiro/hane`](https://github.com/kompiro/hane) plugin, but none of that
is required to contribute: a plain `git` / `pnpm` / `gh` workflow works.

## Pull request flow

1. Branch from latest `main`.
2. Make your change. Run the scripts listed above locally; CI runs the
   same checks (lint, format check, typecheck, knip, circular-dependency
   check, build, vitest with coverage, and a license allowlist — see
   [License compliance](#license-compliance) below).
3. Open a PR using the [pull request template](.github/PULL_REQUEST_TEMPLATE.md).
   Link to the Issue with `Closes #N`. Write the description in English.
4. Wait for CI. The required checks for merge are visible on the PR.
5. The maintainer reviews and merges. The squash subject is taken from
   the PR title — please make it a good Conventional Commit subject.

If your PR touches code, expect questions about:

- the **scope filter** (the `Scope filter` checklist in the PR template —
  is this change keeping karasu within "a slowly-changing structural
  context"?);
- **TPL impact** (does this PR add a proactive Test Perspective, or does a
  bug fix warrant a retrospective one? See
  [`docs/test-perspectives/README.md`](docs/test-perspectives/README.md));
- **ADR worthiness** (architectural decisions belong in `docs/adr/`).

These are documented in detail in `docs/process.md`. You don't need to get
them perfect on the first PR — the maintainer will point at the relevant
doc.

## License compliance

karasu ships under [Apache-2.0](LICENSE). To keep redistribution clean,
two things are automated in CI and the build.

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
when their code ships inside our artifacts.
`scripts/ci/generate-third-party-notices.ts` runs as a `prebuild` step for
`packages/cli` and `packages/vscode` and writes a `THIRD_PARTY_NOTICES.md`
(git-ignored, regenerated on every build) listing each production
dependency with its version, SPDX id, and full license text. It is included
in the published npm tarball (`files`) and in the `.vsix` produced by
`vsce package`. **Do not edit it by hand** — change the generator instead.
You can regenerate locally with `pnpm run gen:notices`.

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
PR-diff-level safety net.

See [`docs/design/license-compliance-automation.md`](docs/design/license-compliance-automation.md)
for the rationale.
