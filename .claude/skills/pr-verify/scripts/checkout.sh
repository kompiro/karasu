#!/usr/bin/env bash
# Check out a PR's head commit into a throwaway detached worktree with its
# dependencies installed, and print the worktree's absolute path.
#   checkout.sh <pr>          -> .claude/worktrees/pr-verify/<pr> at the PR head
#   checkout.sh <pr> --remove -> removes that worktree
# The PR's own e2e specs and fixtures exist only on its branch, so the
# Playwright run in step 5 runs from here.
set -euo pipefail
pr="${1:?usage: checkout.sh <pr> [--remove]}"
root=$(git -C "$(dirname "$0")" rev-parse --path-format=absolute --git-common-dir)
root=$(dirname "$root")
dir="$root/.claude/worktrees/pr-verify/$pr"
if [ "${2:-}" = "--remove" ]; then
  git -C "$root" worktree remove --force "$dir" 2>/dev/null || true
  exit 0
fi
sha=$(gh pr view "$pr" --json headRefOid --jq .headRefOid)
git -C "$root" fetch -q origin "pull/$pr/head"
if [ -d "$dir" ]; then
  git -C "$dir" checkout -q --detach "$sha"
else
  git -C "$root" worktree add -q --detach "$dir" "$sha"
fi
(cd "$dir" && pnpm install --frozen-lockfile >/dev/null 2>&1) || {
  echo "pnpm install failed in $dir" >&2; exit 1; }
echo "$dir"
