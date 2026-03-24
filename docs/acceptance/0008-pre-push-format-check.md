# AT-0008: Pre-push Format Check Hook (Claude Code)

## Overview

Verify that the Claude Code `PreToolUse` hook correctly blocks `git push`
when formatting violations exist, and allows push when all files pass
`oxfmt --check`.

## Prerequisites

- Claude Code session is active (hook fires via Claude Code, not bare git)
- `.claude/settings.json` contains the `PreToolUse` / `Bash` hook

## Test Items

### AT-0008-01: Push is blocked when formatting violations exist

**Steps:**
1. Introduce a deliberate formatting violation in any `.ts` file under `packages/`
2. Stage and commit the change
3. Ask Claude to push the branch

**Expected:** Push is blocked before execution with the message:
`Format check failed. Run: npm run format`

---

### AT-0008-02: Push succeeds when all files are correctly formatted

**Steps:**
1. Ensure `npm run format:check` passes locally
2. Ask Claude to push the branch

**Expected:** Push proceeds normally; no hook error is shown

---

### AT-0008-03: Non-push Bash commands are not affected

**Steps:**
1. Ask Claude to run a Bash command that is not `git push` (e.g., `npm run build`)

**Expected:** The hook exits silently without running `format:check`
