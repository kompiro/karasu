---
id: ADR-20260408-01
title: Trunk-Based Development with Release Toggles
status: accepted
date: 2026-04-08
topic: build
related_to:
  - ADR-20260326-01
scope:
  concerns:
    - ci
---

# ADR-20260408-01: Trunk-Based Development with Release Toggles

## Status

Accepted

## Context

When adding the `preview.yml` workflow for PR preview deployments, the `on.pull_request.branches: [main]` filter was considered. This filter restricts preview deployments to PRs targeting `main` only, and raises the question of whether `feat/*` or other long-lived base branches should be supported.

This led to explicitly deciding the branch strategy for karasu.

## Decision

Adopt trunk-based development: all development branches target `main` directly, and incomplete features are managed with release toggles rather than long-lived feature branches.

- All PRs target `main` as the base branch
- No long-lived branches such as `develop`, `release/*`, or `feat/*` base branches
- The `on.pull_request.branches: [main]` filter in CI and preview workflows is sufficient and intentional

## Consequences

**Positive:**

- Small, frequent merges to `main` reduce integration risk
- No merge hell from long-lived branches diverging over time
- CI and deploy workflows remain simple — a single base branch to handle
- `on.pull_request.branches: [main]` filter does not need to be extended

**Negative:**

- Incomplete features must be hidden behind release toggles, which adds implementation overhead per feature
- Requires discipline to keep in-progress work behind toggles rather than isolating it in a branch

## Alternatives Considered

**Feature branch strategy (`feat/*` base branches):**
PRs target a shared `feat/*` branch before merging to `main`. Avoids the need for release toggles but introduces long-lived branches, complex merge coordination, and CI complexity (multiple base branches to support). Rejected.

**GitFlow (`develop` / `release/*` branches):**
Well-known model but heavyweight for a small team. Adds branch management overhead with limited benefit. Rejected.
