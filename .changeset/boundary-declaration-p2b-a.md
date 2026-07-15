---
"@karasu-tools/core": minor
"karasu": minor
---

Add the experimental `boundary { contains … }` declaration (P2b-A). A `boundary`
declares a semantic cluster of system-view nodes and builds a 1:1 `boundaryIndex`
(node id → boundary id), mirroring `organization`/`owns`/`ownerIndex`.
Multi-membership resolves first-declared-wins and surfaces the new info
diagnostic `duplicate-boundary-assignment`; a `contains` target that is not found
in the system hierarchy warns via `contains-target-not-found`. This is a
parse-time slice only — the Group-by "boundary" axis and rendering land in a
follow-up. Experimental notation (ADR-20260713-01); backward compatibility is not
yet promised. Refs #1822.
