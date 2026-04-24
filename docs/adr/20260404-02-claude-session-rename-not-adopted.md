---
id: ADR-20260404-02
title: Do not rename Claude session to feature name in start-dev skill
status: not_adopted
date: 2026-04-04
topic: build
scope:
---

# ADR-20260404-02: Do not rename Claude session to feature name in start-dev skill

## Status

Rejected

## Context

When using the `start-dev` skill to begin feature development, Claude Code assigns an auto-generated session name (slug) such as `rosy-hugging-axolotl`. This name is visible in the `/resume` picker and the terminal title. The idea was to replace this with a meaningful feature-derived name (e.g., `domain-drift-detection`) after the Issue is confirmed, so that sessions can be identified by feature at a glance.

Two approaches were considered:

1. **Use the worktree directory name as the session name** — Name the worktree `.worktrees/<session-slug>` so the session slug is already reflected in the filesystem path.
2. **Update the JSONL slug field directly** — After deriving a feature slug from the Issue title, rewrite the `slug` field in Claude Code's internal JSONL history file for all entries belonging to the current session.

## Decision

Do not implement session renaming in the `start-dev` skill. The worktree name and branch name already provide sufficient feature identification.

## Reasons

### 1. No public API for mid-session renaming

The only documented way to name a Claude Code session is the `--name` (`-n`) flag at startup. There is no public API to rename a session after it has started. Any mid-session approach must rely on internal implementation details.

### 2. JSONL modification depends on internal structure

Claude Code stores session history as JSONL files under `$CLAUDE_CONFIG_DIR/projects/<project-path>/`. Each entry contains a `slug` field that holds the auto-generated session name. Directly overwriting this field:

- Depends on the undocumented file format and path convention.
- Only affects entries already written; future entries in the same session continue to use the original slug generated at startup.
- May break silently if Claude Code changes its storage format or path derivation logic.

### 3. Worktree and branch name already identify the feature

The `start-dev` skill already creates a worktree at `.worktrees/<feature-name>` and a branch named `feat/<feature-name>` (or `fix/`, `docs/`, etc.). These names appear in `git worktree list`, `git branch`, and the terminal prompt. The session name provides no additional identification value.

## Consequences

- The `start-dev` skill does not rename the Claude session.
- Sessions retain their auto-generated slugs; feature context is conveyed through the worktree path and branch name instead.
- If Claude Code introduces a public API for mid-session renaming, this decision can be revisited.

## Re-evaluation triggers

- Claude Code exposes a documented API or CLI flag to rename a running session.
- Session names become a primary navigation mechanism and the auto-generated names cause practical confusion.
