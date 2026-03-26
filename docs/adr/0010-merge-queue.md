# ADR-0010: Main Branch Health Strategy

## Status

Accepted

## Context

The main branch was protected with `strict_required_status_checks_policy: true`, which requires every PR to be up to date with `main` before it can be merged. This causes friction: developers must manually rebase or merge the latest `main` into their branch whenever another PR is merged ahead of them.

The ideal solution was GitHub's merge queue, which automates rebasing and re-testing before merging. However, the merge queue feature is unavailable for private repositories on GitHub Pro (requires GitHub Team or higher).

## Decision

Adopt a two-layered approach to ensure main branch health without the merge queue:

**1. Push trigger on CI (`ci.yml`)**

Add `push: branches: [main]` to the CI workflow. This runs the full check suite immediately after every merge to `main`. If a merge breaks `main`, GitHub automatically sends an email notification to the repository owner.

**2. Scheduled health check (`health-check.yml`)**

Add a separate workflow that runs the full check suite on `main` daily at 09:00 JST. This catches latent failures that are not caused by a specific merge (e.g., external dependency changes, environment drift). GitHub automatically sends an email notification on failure.

**`merge_group` trigger (retained for future use)**

The `merge_group` trigger is kept in `ci.yml`. If the plan is upgraded to GitHub Team or higher in the future, the merge queue can be enabled without additional CI changes.

## Consequences

**Positive:**

- Any failure on `main` is caught within minutes (push trigger) and at least once daily (scheduled check)
- Notification is automatic via GitHub email — no external service required
- The `strict_required_status_checks_policy` concern is partially mitigated: while PRs can still be merged without being up to date, failures are detected quickly after the fact
- Easy to upgrade to full merge queue later if the GitHub plan changes

**Negative:**

- CI still runs twice on every merge to `main` (PR check + push trigger), which is slightly wasteful
- The push trigger catches breakage *after* it reaches `main`, whereas the merge queue would have prevented it from reaching `main` in the first place

## Alternatives Considered

**Merge queue (original plan):**
Ideal, but not available for private repositories on GitHub Pro.

**Keep `strict_required_status_checks_policy: true` with manual rebasing:**
Safe but creates developer friction. Rejected in favor of detecting failures quickly rather than preventing them at merge time.

**Disable strict checks with no additional monitoring:**
Reduces friction but leaves `main` health unobserved. Rejected.
