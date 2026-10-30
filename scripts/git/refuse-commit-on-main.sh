#!/usr/bin/env bash
# lefthook pre-commit / pre-merge-commit: refuse to create a commit on `main`.
#
# `main` takes no direct commits (docs/process.md "ブランチ戦略"). A commit made
# in the main checkout lands on local `main` and diverges it from origin/main.
# Git hooks are shared by every worktree, so this runs wherever the commit is
# made and whoever makes it: a Claude session, a human, another tool
# (#3335, ADR-3335).
#
# Fast-forward pulls create no commit and never reach this. A detached HEAD
# (rebase, bisect) has no branch and is allowed.

set -u

branch=$(git symbolic-ref --quiet --short HEAD) || exit 0
[ "$branch" = "main" ] || exit 0

cat >&2 <<'EOF'
Refusing to commit on main: main takes no direct commits.
Work on a branch in its own worktree and open a PR:

  git worktree add .claude/worktrees/<branch> -b <branch> origin/main

Move these changes there, then commit (docs/process.md "ブランチ戦略").
EOF
exit 1
