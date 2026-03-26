# ADR-0010: Enable Merge Queue for Main Branch Protection

## Status

Accepted

## Context

The main branch was protected with `strict_required_status_checks_policy: true`, which requires every PR to be up to date with `main` before it can be merged. This means developers must manually rebase or merge the latest `main` into their branch whenever another PR is merged ahead of them — causing friction, especially when multiple PRs are in flight.

## Decision

Enable GitHub's merge queue for the main branch and disable the strict up-to-date requirement.

**Ruleset changes:**

- Remove `strict_required_status_checks_policy: true` → set to `false`
- Add `merge_queue` rule with the following parameters:
  - Merge method: squash (consistent with existing allowed merge methods)
  - Grouping strategy: `ALLGREEN` (each PR tested independently)
  - Min entries to merge: 1
  - Max entries to build/merge: 5

**CI changes:**

- Add `merge_group` trigger to `.github/workflows/ci.yml` so that CI runs inside the merge queue context

## Consequences

**Positive:**

- Developers no longer need to manually keep branches up to date; the merge queue handles rebasing and re-testing automatically
- Merge safety is maintained: a PR is only merged if CI passes against the latest `main` at the time of merging
- Reduces wasted CI runs caused by developers repeatedly rebasing just to satisfy the strict check

**Negative:**

- PRs must be explicitly added to the merge queue (click "Merge when ready") instead of being merged directly; this is a minor UX change
- If the queue is busy, a PR may wait longer than a direct merge would take

## Alternatives Considered

**Keep `strict_required_status_checks_policy: true` (status quo):**
Safe but requires manual developer action on every competing merge, which is inefficient.

**Disable strict checks without merge queue:**
Removes developer friction but also removes the guarantee that CI has passed against the latest `main`, increasing the risk of broken builds on `main`.
