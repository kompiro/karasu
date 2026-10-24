#!/usr/bin/env bash
# Decides whether a `gh pr ready` / `gh pr create` may run (#3342, ADR-3342).
# Called by the gh wrapper scripts/bin/gh with gh's own arguments, so it sees
# exactly what gh would receive, however the command was written (eval,
# scripts, wrappers, xargs). Prints the refusal reason, or nothing to allow.
#
# - `gh pr create` must pass --draft: a PR created ready skips this gate.
# - `gh pr ready` needs a completed local CodeRabbit CLI review whose reviewed
#   commit belongs to this PR's branch: an ancestor of the PR head that is not
#   on the base branch. Fix commits made after it are fine, since the CLI runs
#   once (ADR-3326). The CLI keeps one directory per local review, with the
#   reviewed commit in git.json (.head) and the completion state in
#   .session-complete-v2 (.state). /engineering:code-review leaves no record,
#   so only the CLI run is checked; the refusal names both steps.
#
# Lets the call through when:
# - KARASU_LOCAL_REVIEW_SKIPPED holds a non-empty reason, the deliberate skip
#   for when the CLI cannot run here;
# - the PR opted out of CodeRabbit (skip-coderabbit / adr-auto-merge label, or
#   the ignore command in its body), or is not a draft;
# - --undo, or --repo / -R (the local checkout may not hold that repository);
# - anything cannot be determined (gh fails, unknown CLI record format). The
#   gate must never block work because of its own failure.
#
# Usage: ready-gate.sh <pr> <ready|create> [gh args...]
# Environment: READY_GATE_GH (the real gh binary), CODERABBIT_REVIEWS_DIR.

set -u

[ "${1:-}" = "pr" ] || exit 0
action=${2:-}
shift 2 2>/dev/null || exit 0

if [ "$action" = "create" ]; then
  for arg in "$@"; do
    case "$arg" in
      --draft | -d | --draft=true) exit 0 ;;
    esac
  done
  echo "gh pr create was refused: create the PR as a draft (gh pr create --draft). Run \
/engineering:code-review on the branch diff and one CodeRabbit CLI review before taking it out of draft \
with gh pr ready (docs/process.md PR workflow)."
  exit 0
fi

[ "$action" = "ready" ] || exit 0
reason=${KARASU_LOCAL_REVIEW_SKIPPED:-}
[ -n "${reason//[[:space:]]/}" ] && exit 0

selector=()
for arg in "$@"; do
  case "$arg" in
    --undo | -R | --repo | --repo=*) exit 0 ;;
    -*) ;;
    *) [ ${#selector[@]} -eq 0 ] && selector=("$arg") ;;
  esac
done

gh_bin=${READY_GATE_GH:-gh}
limit=()
command -v timeout >/dev/null 2>&1 && limit=(timeout 15)
view=$("${limit[@]}" "$gh_bin" pr view "${selector[@]}" \
  --json number,isDraft,labels,body,headRefOid,baseRefName 2>/dev/null) || exit 0

[ "$(jq -r '.isDraft' <<<"$view")" = "true" ] || exit 0
opted_out=$(jq -r '
  ([.labels[].name] | any(. == "skip-coderabbit" or . == "adr-auto-merge"))
  or ((.body // "") | contains("@coderabbitai ignore"))
' <<<"$view")
[ "$opted_out" = "true" ] && exit 0

number=$(jq -r '.number' <<<"$view")
head=$(jq -r '.headRefOid' <<<"$view")
base=$(jq -r '.baseRefName' <<<"$view")
git cat-file -e "$head^{commit}" 2>/dev/null || exit 0
base_ref=origin/$base
git rev-parse --verify --quiet "$base_ref^{commit}" >/dev/null || base_ref=$base
git rev-parse --verify --quiet "$base_ref^{commit}" >/dev/null || exit 0

reviews=${CODERABBIT_REVIEWS_DIR:-$HOME/.coderabbit/reviews}
records=0
for record in "$reviews"/*/*/reviews/*/; do
  [ -f "$record/git.json" ] || continue
  reviewed=$(jq -r '.head // empty' "$record/git.json" 2>/dev/null)
  [ -n "$reviewed" ] || continue
  records=$((records + 1))
  [ "$(jq -r '.state // empty' "$record/.session-complete-v2" 2>/dev/null)" = "complete" ] || continue
  git cat-file -e "$reviewed^{commit}" 2>/dev/null || continue
  git merge-base --is-ancestor "$reviewed" "$head" 2>/dev/null || continue
  git merge-base --is-ancestor "$reviewed" "$base_ref" 2>/dev/null && continue
  exit 0
done

# Records exist but none could be read: the CLI's format changed. Fail open.
if [ "$records" -eq 0 ] && [ -n "$(ls -A "$reviews" 2>/dev/null)" ]; then
  exit 0
fi

echo "gh pr ready was refused: no completed local CodeRabbit CLI review covers PR #$number's branch \
(head ${head:0:7}). Before taking a PR out of draft (docs/process.md PR workflow): run \
/engineering:code-review on git diff $base_ref...HEAD, then run the CLI once \
(coderabbit review --agent --deep --base $base_ref --committed), commit and push the fixes, and run \
gh pr ready again. If the CLI cannot run here (not installed, not authenticated, out of quota), tell \
the user, then rerun as KARASU_LOCAL_REVIEW_SKIPPED=<reason> gh pr ready $number."
