# Security Policy

## Reporting a vulnerability

If you find a security issue in karasu, please **do not** file a public issue.
Instead, use GitHub's private vulnerability reporting:

- <https://github.com/kompiro/karasu/security/advisories/new>

karasu is maintained on a **best-effort, no-SLA** basis as a personal learning
project. We aim to **acknowledge a report within 7 days** — a best-effort
target, not a guarantee — and there is **no fixed timeline for shipping a
fix**. Please include reproduction steps and the affected package / version
(e.g. `@kompiro/karasu-tools@x.y.z`, VS Code extension version, or commit SHA).

## Supported versions

Only the latest published version of `@kompiro/karasu-tools` and the latest
VS Code Marketplace release of the karasu extension receive security fixes.
Older versions are not patched.

## Coordinated disclosure

We prefer **coordinated disclosure**. Once a report is received:

- We confirm the issue and develop a fix privately, in the draft GitHub
  Security Advisory.
- The **embargo length is negotiable per report** — agreed with the reporter
  based on severity and the time a fix realistically needs.
- When the fix ships (or the embargo expires), we publish the advisory and
  credit the reporter, unless they ask to remain anonymous.

Please do not disclose the issue publicly before the advisory is published.

## Secret scanning

We run [`gitleaks`](https://github.com/gitleaks/gitleaks) at three points:

- **`pre-push` (local)** — `lefthook.yml` runs a diff scan before anything
  reaches `origin`. gitleaks ships in the devcontainer; if it is not on your
  `PATH` the hook fails with install instructions rather than skipping
  silently.
- **Pull requests** — diff scan in `.github/workflows/secret-scan.yml`.
- **Daily schedule against `main`** — full-history scan (same workflow), so
  anything that slips past the per-PR check is caught within a day.

The gitleaks version is pinned and kept in sync between
`.devcontainer/Dockerfile` and the CI workflow so local and CI runs match.

### History rewrite policy

We **will not rewrite git history** to remove low-severity findings (e.g.
example values, test fixtures, already-rotated credentials). Public OSS
repositories accumulate this kind of noise, and force-pushing history is
disruptive to downstream consumers (forks, clones, package archives).

If a **high-severity** real secret is ever committed (a live production
credential with broad blast radius), we will:

1. Rotate the secret immediately,
2. Decide on history rewrite case-by-case, weighing exposure window vs.
   ecosystem disruption,
3. Document the decision in an ADR under `docs/adr/`.

For everything else, rotation alone is the remediation — the historical
artifact stays in place and the rotated value makes the historical one inert.
