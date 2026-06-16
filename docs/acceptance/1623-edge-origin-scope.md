---
type: acceptance-test
issue: "#1623"
feature: "Edge origin scope — documented rule + edge-source-mismatch diagnostic"
date: 2026-06-16
---

# AT-1623: Edge origin scope is documented and enforced

## Overview

An edge declared inside a `service` / `domain` block originates from that block:
the implicit `-> <to>` form uses the enclosing block id, and an explicit
`<from> -> <to>` must name that same enclosing id. A mismatched explicit source
raises the `edge-source-mismatch` error (for both `->` and `-->`). Edges inside a
`system` block may use any declared node as their source.

This **edge origin scope** rule is now stated in `docs/spec/syntax.md` (§Edge
declaration) and catalogued in `docs/spec/diagnostics.md` (the diagnostic was
already implemented; #1623 documents it). The constraint behaviour is covered by
automated tests; the manual case verifies the editor surface.

Automated coverage: `packages/core/src/parser/parser.test.ts` —
- "errors when explicit edge source does not match parent in service/domain block"
- "errors on async (-->) explicit edge source mismatch in service/domain block (#1623)"
- "allows explicit edge with matching source in service/domain block"
- "allows arbitrary edge source in system block"

## AC-1: explicit mismatched source inside a domain raises edge-source-mismatch (automated)

**Input:**
```krs
system Test {
  service S {
    domain Contract {
      OtherDomain -> Billing
    }
  }
}
```
**Expected:** an `error` diagnostic with code `edge-source-mismatch`, params naming
`OtherDomain` (the offending source) and `Contract` (the enclosing block id).

## AC-2: async (`-->`) mismatch raises the same error (automated)

**Input:** as AC-1 but `OtherDomain --> Billing`.
**Expected:** `edge-source-mismatch` error — the rule applies to async edges too.

## AC-3: matching source and implicit form are accepted (automated)

**Input:** `Contract -> Billing` (and the implicit `-> Billing`) inside `domain Contract`.
**Expected:** no error; the edge's `from` is `Contract`.

## AC-4: a system-block edge may use any source (automated)

**Input:**
```krs
system Test {
  service A
  service B
  A -> B "delegates"
}
```
**Expected:** no `edge-source-mismatch`; arbitrary sources are valid at system scope.

## AC-5 (manual): the editor surfaces the diagnostic at the offending edge

**Steps:**
1. Open a `.krs` with the AC-1 input in VS Code (or the app editor).
2. Place a mis-scoped explicit edge inside a `domain` block.

**Expected:** a red squiggle on the offending edge line with the
`edge-source-mismatch` message ("Edge source ... must match the enclosing block
id ..."), not a generic parse error.
