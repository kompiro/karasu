#!/usr/bin/env bash
# Claude Code PostToolUse hook (matcher: Bash), wired in .claude/settings.json.
#
# After Claude takes a PR out of draft with `gh pr ready <n>`, tell it in the
# same turn to start /coderabbit-converge on that PR. /hane:start-dev and
# /hane:ship end at "CI green, status: in-review" and never hand over to
# converge, so without this note the rounds wait for a human (#3333, ADR-3333).
#
# Input: the hook JSON on stdin (.tool_input.command, .cwd).
# Output: nothing, or a PostToolUse additionalContext JSON on stdout.
# Every unexpected state exits 0 silently: a reminder must never break a Bash call.
#
# Override the gh binary with CONVERGE_HOOK_GH (tests use a stub).

set -u

input=$(cat)
command=$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null) || exit 0
case "$command" in
  *"gh pr ready"*) ;;
  *) exit 0 ;;
esac

# First `gh pr ready` in the command, and its first non-flag argument.
args=$(grep -oE 'gh pr ready([[:space:]]+[^;&|]*)?' <<<"$command" | head -n 1)
args=${args#gh pr ready}
pr=""
undo=0
for word in $args; do
  case "$word" in
    --undo) undo=1 ;;
    -*) ;;
    *) [ -z "$pr" ] && pr=$word ;;
  esac
done
[ "$undo" -eq 1 ] && exit 0
# Only literal selectors (number, URL, branch). A shell variable cannot be resolved here.
case "$pr" in
  *'$'* | *'`'*) pr="" ;;
esac
pr=${pr//\"/}
pr=${pr//\'/}

gh_bin=${CONVERGE_HOOK_GH:-gh}
cwd=$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null)
# gh pr view without a selector resolves the PR from the working directory's branch.
if [ -n "$cwd" ]; then
  cd "$cwd" 2>/dev/null || exit 0
fi

emit() {
  jq -n --arg ctx "$1" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
}

generic="A PR was just taken out of draft with gh pr ready. Next, run /coderabbit-converge on it \
(the converge step of the docs/process.md PR workflow), unless its body has the CodeRabbit ignore command on a line of its own or it \
carries the skip-coderabbit / adr-auto-merge label. This takes precedence over a skill that stops at \
\"CI green, status: in-review\" (such as /hane:start-dev or /hane:ship)."

# coreutils timeout is missing on stock macOS; run without a limit there.
limit=()
command -v timeout >/dev/null 2>&1 && limit=(timeout 15)

# pr may be empty: gh pr view then resolves the current branch's PR.
# shellcheck disable=SC2086 # an empty selector must expand to no argument
view=$("${limit[@]}" "$gh_bin" pr view $pr --json number,isDraft,labels,body 2>/dev/null) || {
  emit "$generic"
  exit 0
}

is_draft=$(jq -r '.isDraft' <<<"$view")
[ "$is_draft" = "false" ] || exit 0

number=$(jq -r '.number' <<<"$view")
opted_out=$(jq -r '
  ([.labels[].name] | any(. == "skip-coderabbit" or . == "adr-auto-merge"))
  or ((.body // "") | split("\n") | map(sub("\\s+$"; "")) | any(. == "@coderabbitai ignore"))
' <<<"$view")
[ "$opted_out" = "true" ] && exit 0

emit "PR #$number is out of draft. Next, run /coderabbit-converge on #$number now (the converge step of the docs/process.md \
PR workflow) and keep driving it until CodeRabbit approves or a human decision is needed. \
This takes precedence over a skill that stops at \"CI green, status: in-review\" (such as \
/hane:start-dev or /hane:ship)."
