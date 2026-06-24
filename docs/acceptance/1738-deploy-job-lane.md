---
type: acceptance-test
issue: "#1738"
feature: "Deploy view clusters job-only containers into a dedicated job band"
date: 2026-06-24
---

# AT-1738: deploy view job lane (first kind band)

## Overview

Deploy units of `kind: job` (scheduled / cron) used to scatter across the
dependency DAG — each placed by the dependency depth of the domain it
`realizes` — so they did not read as one operational group. This change pulls
**job-only containers** (containers whose every unit is a `job`) out of the
Longest Path Layering DAG and clusters them into a dedicated **job band** below
the compute/store DAG and above the `__unclassified__` row. compute / mixed
containers stay on the DAG; `store` already sinks to the DAG bottom and is
untouched. Design: `docs/design/deploy-kind-band-job-lane.md` (promoted to an
ADR after merge).

Related: ADR-20260408-02 (Longest Path Layering), ADR-20260327-01 (deploy
design), ADR-20260616-12 (service→infra edges), [TPL-20260624-01].

## AC-1: job-only containers form one band below the DAG, above unclassified (automated)

**Steps:** lay out a deploy slice with a compute container, two job-only
containers, and an unclassified unit.

**Expected:** both job containers share one sub-row, positioned below the
compute container and above the `__unclassified__` container.

> ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` ›
> `layoutDeploy job band (#1738)` › `clusters job-only containers below the
> compute DAG, above unclassified`.

## AC-2: the band is a labelled ghost wrapper marked `kindBand: job` (automated)

**Expected:** a `__job_band__` ghost container encloses the job containers, has
the caption `Scheduled jobs`, and carries `kindBand: "job"`; the renderer emits
`data-kind-band="job"`.

> ✅ Automated — `deploy-layout.test.ts` › `wraps the job band in a ghost
> __job_band__ container marked kindBand job`; `deploy-renderer.test.ts` ›
> `job band (#1738)` › `emits the job band wrapper with its caption and
> data-kind-band`.

The caption is localized: it falls back to English (`Scheduled jobs`) but is
overridden via `EmptyStateLabels.deployJobBand` (the app's i18n pass-through,
`emptyState.deploy.jobBand` — en/ja). The unclassified container caption is
localized the same way (`EmptyStateLabels.deployUnclassified`).

> ✅ Automated — `deploy-layout.test.ts` › `uses localized captions for the job
> band and unclassified containers`; `deploy-renderer.test.ts` › `renders the
> localized band caption from emptyLabels (i18n pass-through)`.

## AC-3: a mixed job+compute container stays on the DAG (automated)

**Expected:** a container mixing a `job` unit with another kind is **not**
banded (`kindBand` undefined) — the `realizes`-labelled cluster is not split.

> ✅ Automated — `deploy-view-extract.test.ts` › `job band classification
> (#1738)` › `does not mark a container that mixes a job with another kind`;
> `deploy-layout.test.ts` › `keeps a mixed job+compute container on the DAG`.

## AC-4: every unit is placed exactly once; band-crossing edges resolve (automated)

**Expected:** introducing the band drops / duplicates no units; a ghost edge
from a job container to a compute service still resolves both endpoints.

> ✅ Automated — `deploy-layout.test.ts` › `places every unit exactly once when
> a job band is present`; `routes a ghost edge across the band when a job
> container depends on a service`.

## AC-5: backward compatible — no job, no band (automated)

**Expected:** a deploy diagram with no job-only containers renders exactly as
before (no `__job_band__`, no `data-kind-band`).

> ✅ Automated — `deploy-renderer.test.ts` › `does not emit a job band when
> there are no job-only containers`; the existing `deploy-layout.test.ts` /
> `deploy-renderer.test.ts` suites continue to pass unchanged.

## AC-6: app deploy view shows the job band in the right place (e2e)

**Steps:** open a `.krs` with compute + job + unclassified deploy units, switch
to the Deploy tab.

**Expected:** the job band's nodes render below the compute nodes and above the
unclassified nodes.

> ✅ Automated (e2e: at-1738) — `packages/e2e/tests/at-1738-deploy-job-lane.spec.ts`
> verifies the band's vertical placement via `boundingBox` (à la `at-0049-*`).
