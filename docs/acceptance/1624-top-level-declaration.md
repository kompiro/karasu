---
type: acceptance-test
issue: "#1624"
feature: "Top-level user/edge prohibition — top-level-declaration diagnostic"
date: 2026-06-16
---

# AT-1624: Top-level user/edge is rejected with a dedicated diagnostic

## Overview

`user` declarations and edges are only valid inside a `system` block. Declaring
either at the top level of a file now raises the dedicated `top-level-declaration`
error (params `{ construct: "user" | "edge" }`) instead of the generic
`unexpected-token-root`, so the message tells the author to move it inside a
`system`. The offending construct is consumed for clean recovery.

This **edge/declaration placement scope** rule is stated in `docs/spec/syntax.md`
(§system block → Top-level placement) and catalogued in `docs/spec/diagnostics.md`.

Automated coverage: `packages/core/src/parser/parser.test.ts` —
`describe("top-level-declaration diagnostic (#1624)")`.

## AC-1: top-level `user` raises top-level-declaration (automated)

**Input:**
```krs
user Customer [human] {
  description "A general user"
}
```
**Expected:** one `error` with code `top-level-declaration`, params
`{ construct: "user" }`; no `unexpected-token-root` (the declaration is consumed).

## AC-2: top-level edge raises top-level-declaration, sync and async (automated)

**Input:** `A -> B "delegates"` (and `A --> B`) at the top level.
**Expected:** `top-level-declaration` error with params `{ construct: "edge" }`.

## AC-3: user/edge inside a system block are valid (automated)

**Input:**
```krs
system S {
  user Customer [human]
  service A
  service B
  A -> B
}
```
**Expected:** no `top-level-declaration` diagnostic.

## AC-4 (manual): the editor surfaces the dedicated message

**Steps:**
1. In VS Code / the app editor, write a top-level `user` (or `A -> B`) outside any `system`.

**Expected:** a red squiggle with the `top-level-declaration` message
("A top-level user is not allowed — declare it inside a system block"), not a
generic "Unexpected token".
