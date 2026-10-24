#!/usr/bin/env bash
# Claude Code PreToolUse hook (matcher: Bash), wired in .claude/settings.json.
#
# Refuses `gh pr ready <n>` until the local review step of the PR workflow has
# run on the branch, and refuses `gh pr create` without --draft, which would
# skip that step by opening a PR that is already ready (#3342, ADR-3342).
#
# "Has run" means: the CodeRabbit CLI completed a local review whose reviewed
# commit belongs to this PR's branch, i.e. it is an ancestor of the PR head and
# not already on the base branch. Fix commits made after that review are fine:
# the CLI runs once (ADR-3326). The CLI keeps one directory per local review,
# with the reviewed commit in git.json (.head) and the completion state in
# .session-complete-v2 (.state). /engineering:code-review leaves no record, so
# only the CLI run is checked; the refusal names both steps.
#
# Lets the call through when:
# - the PR opted out of CodeRabbit (skip-coderabbit / adr-auto-merge label, or
#   the ignore command in its body), or is not a draft;
# - the command carries KARASU_LOCAL_REVIEW_SKIPPED=<reason> before gh, the
#   deliberate skip for when the CLI cannot run here;
# - anything cannot be determined (gh fails, --repo, unknown CLI record format).
#   The gate must never block work because of its own failure.
#
# Which gh pr command the line runs (if any) comes from gh-pr-command.mts, a
# small shell tokenizer: a text search would be fooled by heredoc bodies,
# quoted strings and comments.
#
# Input: the hook JSON on stdin (.tool_input.command, .cwd).
# Output: nothing, or a PreToolUse deny JSON on stdout.
# Overrides for tests: READY_GATE_GH (gh binary), CODERABBIT_REVIEWS_DIR.

set -u

input=$(cat)
command=$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null) || exit 0
case "$command" in
  *"pr ready"* | *"pr create"*) ;;
  *) exit 0 ;;
esac

deny() {
  jq -n --arg reason "$1" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
  exit 0
}

cwd=$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null)
[ -n "$cwd" ] || cwd=$PWD

# Which gh pr command the line would actually run is a shell-parsing question
# (quotes, $(...), heredoc bodies, comments), answered by gh-pr-command.mts.
# If node or the parser fails, let the call through.
parsed=$(node "$(dirname "$0")/gh-pr-command.mts" "$cwd" <<<"$command" 2>/dev/null) || exit 0
[ -n "$parsed" ] && [ "$parsed" != "null" ] || exit 0
field() { jq -r ".$1" <<<"$parsed"; }

if [ "$(field action)" = "create" ]; then
  [ "$(field draft)" = "true" ] && exit 0
  deny "gh pr create was refused: create the PR as a draft (gh pr create --draft). \
Run /engineering:code-review on the branch diff and one CodeRabbit CLI review before taking it out of \
draft with gh pr ready (docs/process.md PR workflow)."
fi

# action = ready
[ "$(field undo)" = "true" ] && exit 0
[ "$(field repoFlag)" = "true" ] && exit 0
[ "$(field skipped)" = "true" ] && exit 0
dir=$(field dir)
selector=()
[ "$(field selector)" = "null" ] || selector=("$(field selector)")

cd "$dir" 2>/dev/null || exit 0

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

deny "gh pr ready was refused: no completed local CodeRabbit CLI review covers PR #$number's branch \
(head ${head:0:7}). Before taking a PR out of draft (docs/process.md PR workflow): run \
/engineering:code-review on git diff $base_ref...HEAD, then run the CLI once \
(coderabbit review --agent --deep --base $base_ref --committed), commit and push the fixes, and run \
gh pr ready again. If the CLI cannot run here (not installed, not authenticated, out of quota), tell \
the user, then rerun as KARASU_LOCAL_REVIEW_SKIPPED=<reason> gh pr ready $number."
