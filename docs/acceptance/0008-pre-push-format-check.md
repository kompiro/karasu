---
type: tool
---

# AT-0008: Pre-push Checks (lefthook)

## Overview

Verify that the lefthook `pre-push` hook correctly runs format check, lint,
and type check in parallel before pushing, blocking the push if any check fails.

## Prerequisites

- `npm install` has been run (lefthook is installed)
- `lefthook install` has been run to register git hooks

## Test Items

### AT-0008-01: Push is blocked when formatting violations exist

**Steps:**

1. Introduce a deliberate formatting violation in any `.ts` file under `packages/`
2. Stage and commit the change
3. Run `git push`

**Expected:** Push is blocked with a format check failure message

---

### AT-0008-02: Push is blocked when lint errors exist

**Steps:**

1. Introduce a lint error (e.g., unused variable) in any `.ts` file under `packages/`
2. Stage and commit the change
3. Run `git push`

**Expected:** Push is blocked with a lint failure message

---

### AT-0008-03: Push is blocked when type errors exist

**Steps:**

1. Introduce a type error in any `.ts` file under `packages/`
2. Stage and commit the change
3. Run `git push`

**Expected:** Push is blocked with a type check failure message

---

### AT-0008-04: Push succeeds when all checks pass

**Steps:**

1. Ensure `npm run format:check`, `npm run lint`, and `npm run typecheck` all pass
2. Run `git push`

**Expected:** Push proceeds normally; all checks show ✔️ in lefthook output

---

### AT-0008-05: Checks run in parallel

**Steps:**

1. Run `npx lefthook run pre-push --force`

**Expected:** format, lint, and typecheck commands start simultaneously and
the summary shows individual elapsed times (typecheck takes longest at ~2s)
