# Security Policy

## Reporting a vulnerability

If you find a security issue in karasu, please **do not** file a public issue.
Instead, use GitHub's private vulnerability reporting:

- <https://github.com/kompiro/karasu/security/advisories/new>

karasu is maintained on a **best-effort, no-SLA** basis as a personal learning
project. You will get a response, but not a guaranteed turnaround. Please
include reproduction steps and the affected package / version (e.g.
`@kompiro/karasu-tools@x.y.z`, VS Code extension version, or commit SHA).

## Supported versions

Only the latest published version of `@kompiro/karasu-tools` and the latest
VS Code Marketplace release of the karasu extension receive security fixes.
Older versions are not patched.

## Secret scanning

We run [`gitleaks`](https://github.com/gitleaks/gitleaks) on every pull
request (diff scan) and on a daily schedule against `main` (full-history
scan). The workflow is at `.github/workflows/secret-scan.yml`. The version
of gitleaks used in CI is pinned and kept in sync with
`.devcontainer/Dockerfile` so local and CI runs match.

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
