## Purpose

<!-- Link to related issue(s) -->
<!-- e.g. Closes #12 -->

## Summary

<!-- Brief description of the changes in this PR (1-3 lines) -->

## Changes

<!-- List the main changes -->

-

## Preview URL

<!-- Cloudflare Pages preview URL (generated automatically by the Preview workflow) -->
<!-- e.g. https://<branch-name>.karasu.pages.dev -->

## Scope filter (new-feature PRs only)

<!--
For PRs that introduce a new user-facing feature or external integration,
confirm the change stays inside karasu's scope filter from
docs/concepts.ja.md "非目標 → 共通フィルタ":

> karasu が扱うのは ゆっくり変化する構造的な文脈 —
> 何が存在し、どう関係し、誰が所有するかであり、
> 実装の詳細も運用の現況もその外側にある。

If any of the bullets below is checked (the PR pulls karasu *toward* one
of those failure modes), justify it in the Summary or in the linked
DesignDoc. For pure refactor / docs / chore / bug-fix PRs, mark "N/A".
-->

- [ ] N/A — not a new-feature PR
- [ ] Pulls implementation detail into the model (code generation, DB schema, function signatures, ...)
- [ ] Pulls runtime metrics / operational state into the model (per-pod state, live metrics, deploy status, ...)
- [ ] Pulls time-axis / high-frequency state into the model (sequence diagrams, execution logs, traces, ...)

## Manual Verification Checklist

<!-- List items that cannot be verified by CI -->
<!-- If none, write "N/A — all covered by automated tests" -->

- [ ]

## TPL impact

<!--
TPL = Test Perspective Library (docs/test-perspectives/README.md).
Lifecycle: concept → proactive TPL → development → bug → retrospective TPL.

Pick the row(s) that apply; write "N/A" if none (pure refactor / docs / chore):

- Bug-fix PR (closes a `bug` Issue) — walk the 3-Yes rule:
  could the same root cause occur in another feature / structurally
  recurring / not yet covered. If all yes, add a retrospective TPL in
  this PR (or open a follow-up). If a matching TPL exists, append the
  Issue to its `discovered_from`.
- New-feature PR (DesignDoc-driven) — scan the design's `topic` in
  `docs/concepts.ja.md` and related ADRs. If a principle could be
  violated by this design and isn't yet a TPL, add a proactive TPL.
  Also: for every TPL (proactive or existing) this feature is designed
  against, turn the relevant checklist items into contract tests / ACs
  shipped with the feature — not later. Record this below.

Examples for Disposition:
  "Added TPL-21 from #N; checklist items 1,3 covered by `foo.test.ts`"
  "Designed against TPL-18; round-trip contract test in `bar.test.ts`"
  "Updated TPL-08.discovered_from with #M"
  "N/A — pure refactor"
-->

> Disposition:

## Related Docs

<!-- Documents updated or referenced -->
<!-- e.g. docs/acceptance/NNNN-xxx.md -->
