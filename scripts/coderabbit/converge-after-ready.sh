#!/usr/bin/env bash
# Claude Code PostToolUse hook (matcher: Bash), wired in .claude/settings.json.
#
# After Claude takes a PR out of draft with `gh pr ready`, tell it in the same
# turn to start /coderabbit-converge on that PR. /hane:start-dev and /hane:ship
# end at "CI green, status: in-review" and never hand over to converge, so
# without this note the rounds wait for a human (#3333, ADR-3333).
#
# The PR is taken from gh's own status line in the tool output
# (`Pull request <owner>/<repo>#<n> is marked as "ready for review"`), not from
# the command text. A command that only mentions `gh pr ready` (grep, heredoc)
# prints no such line, and the line names the repository even when the command
# ran in another checkout or with --repo.
#
# Input: the hook JSON on stdin (.tool_input.command, .tool_response.stdout/stderr).
# Output: nothing, or a PostToolUse additionalContext JSON on stdout.
# Every unexpected state exits 0 silently: a reminder must never break a Bash call.
#
# Override the gh binary with CONVERGE_HOOK_GH (tests use a stub).

set -u

input=$(cat)
command=$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null) || exit 0
case "$command" in
  *"pr ready"*) ;;
  *) exit 0 ;;
esac

output=$(jq -r '[.tool_response.stdout?, .tool_response.stderr?] | map(strings) | join("\n")' \
  <<<"$input" 2>/dev/null) || exit 0
readied=$(grep -oE 'Pull request [A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+#[0-9]+ is marked as "ready for review"' \
  <<<"$output" | awk '{print $3}' | sort -u)
[ -n "$readied" ] || exit 0

gh_bin=${CONVERGE_HOOK_GH:-gh}
# coreutils timeout is missing on stock macOS; run without a limit there.
limit=()
command -v timeout >/dev/null 2>&1 && limit=(timeout 15)

for ref in $readied; do
  repo=${ref%#*}
  number=${ref##*#}
  # gh just reached GitHub to mark the PR ready, so a failed read here is not a
  # reason to guess: skip the reminder.
  view=$("${limit[@]}" "$gh_bin" pr view "$number" --repo "$repo" --json isDraft,labels,body \
    2>/dev/null) || continue

  [ "$(jq -r '.isDraft' <<<"$view")" = "false" ] || continue
  opted_out=$(jq -r '
    ([.labels[].name] | any(. == "skip-coderabbit" or . == "adr-auto-merge"))
    or ((.body // "") | split("\n") | map(sub("\\s+$"; "")) | any(. == "@coderabbitai ignore"))
  ' <<<"$view")
  [ "$opted_out" = "true" ] && continue

  jq -n --arg ctx "PR $ref is out of draft. Next, run /coderabbit-converge on it now (the converge \
step of the docs/process.md PR workflow, from that PR's worktree) and keep driving it until CodeRabbit \
approves or a human decision is needed. This takes precedence over a skill that stops at \
\"CI green, status: in-review\" (such as /hane:start-dev or /hane:ship)." \
    '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
  # One PR per Bash call is the workflow (stacked PRs leave draft one at a time).
  exit 0
done
