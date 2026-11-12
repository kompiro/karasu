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
registered() {
  git -C "$root" worktree list --porcelain | grep -qxF "worktree $dir"
}

if [ "${2:-}" = "--remove" ]; then
  if registered; then git -C "$root" worktree remove --force "$dir"; fi
  exit 0
fi

# Fetch first and take the commit that was fetched, so a push in between cannot
# leave us with a SHA that is not in the object store.
git -C "$root" fetch -q origin "pull/$pr/head"
sha=$(git -C "$root" rev-parse FETCH_HEAD)

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
