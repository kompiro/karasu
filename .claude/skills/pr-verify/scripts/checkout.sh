#!/usr/bin/env bash
# Check out a PR's head commit into a throwaway detached worktree with its
# dependencies installed, and print the worktree's absolute path.
#   checkout.sh <pr>          -> .claude/worktrees/pr-verify/<pr> at the PR head
#   checkout.sh <pr> --remove -> removes that worktree
# The PR's own e2e specs and fixtures exist only on its branch, so the
# Playwright run in step 5 runs from here. This installs and later runs the PR's
# own code; SKILL.md asks kompiro first when the PR comes from a fork.
set -euo pipefail
pr="${1:?usage: checkout.sh <pr> [--remove]}"
root=$(git -C "$(dirname "$0")" rev-parse --path-format=absolute --git-common-dir)
root=$(dirname "$root")
dir="$root/.claude/worktrees/pr-verify/$pr"

# True when $dir is one of this repository's registered worktrees. A directory
# that is not would resolve git commands to the enclosing main checkout.
# The list is read whole first: `grep -q` exiting on the first match would
# SIGPIPE git under pipefail once the list outgrows the pipe buffer.
registered() {
  local list
  list=$(git -C "$root" worktree list --porcelain)
  grep -xF "worktree $dir" >/dev/null <<<"$list"
}

if [ "${2:-}" = "--remove" ]; then
  if registered; then
    git -C "$root" worktree remove --force "$dir"
  elif [ -e "$dir" ]; then
    echo "$dir exists but is not a registered worktree; remove it by hand" >&2
    exit 1
  fi
  git -C "$root" update-ref -d "refs/pr-verify/$pr" 2>/dev/null || true
  exit 0
fi

# Fetch into a ref of our own and take the commit that was fetched: a push in
# between cannot leave a SHA that was never fetched, and another session's fetch
# in the shared checkout cannot overwrite it the way it would FETCH_HEAD.
git -C "$root" fetch -q origin "+pull/$pr/head:refs/pr-verify/$pr"
sha=$(git -C "$root" rev-parse "refs/pr-verify/$pr")

if registered; then
  git -C "$dir" checkout -q --detach "$sha"
elif [ -e "$dir" ]; then
  echo "$dir exists but is not a registered worktree; remove it by hand and re-run" >&2
  exit 1
else
  git -C "$root" worktree add -q --detach "$dir" "$sha"
fi
(cd "$dir" && pnpm install --frozen-lockfile >/dev/null 2>&1) || {
  echo "pnpm install failed in $dir" >&2; exit 1; }
echo "$dir"
