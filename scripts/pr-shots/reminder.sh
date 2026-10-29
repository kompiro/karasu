#!/usr/bin/env bash
# Claude Code PostToolUse / PostToolUseFailure hook (matcher: Bash), wired in
# .claude/settings.json.
#
# After Claude opens a PR with `gh pr create`, remind it in the same turn to
# attach before/after screenshots when the PR touches code or models that can
# change what users see and its `## Before / after` section is still empty
# (#3359, docs/design/pr-before-after-screenshots.md "案 3-C"). Written in
# docs/process.md alone, the step would happen only when asked.
#
# The path test decides only whether to remind. Whether anything was drawn
# differently is `pnpm pr:shots`'s answer (it compares SVGs), so a path list
# that is too wide costs one "No rendering change" line, not a wrong picture.
#
# The PR is taken from the URL gh prints, not from the command text (as in
# converge-after-ready.sh, ADR-3333): a command that only mentions
# `gh pr create` prints no PR URL.
#
# Input: the hook JSON on stdin. Output: nothing, or an additionalContext JSON.
# Every unexpected state exits 0 silently: a reminder must never break a Bash call.
#
# Override the gh binary with PR_SHOTS_HOOK_GH (tests use a stub).

set -u

input=$(cat)
command=$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null) || exit 0
case "$command" in
  *"pr create"*) ;;
  *) exit 0 ;;
esac

[ "$(jq -r '.is_interrupt // false' <<<"$input" 2>/dev/null)" = "true" ] && exit 0
event=$(jq -r '.hook_event_name // "PostToolUse"' <<<"$input" 2>/dev/null) || exit 0
output=$(jq -r '[.tool_response.stdout?, .tool_response.stderr?, .error?] | map(strings) | join("\n")' \
  <<<"$input" 2>/dev/null) || exit 0
url=$(grep -oE 'https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/[0-9]+' <<<"$output" | head -n 1)
[ -n "$url" ] || exit 0
repo=$(sed -E 's#https://github\.com/([^/]+/[^/]+)/pull/.*#\1#' <<<"$url")
number=${url##*/}

gh_bin=${PR_SHOTS_HOOK_GH:-gh}
limit=()
command -v timeout >/dev/null 2>&1 && limit=(timeout 15)

files=$(${limit[@]+"${limit[@]}"} "$gh_bin" pr diff "$number" --repo "$repo" --name-only 2>/dev/null) || exit 0
# Source that draws (core's renderer and layout, the app UI) or a model that is
# drawn (examples/). Tests change nothing a user sees.
visible=$(grep -E '^(packages/(core|app)/src/|examples/)' <<<"$files" \
  | grep -vE '(\.test\.|\.spec\.|/__tests__/)' | head -n 1)
[ -n "$visible" ] || exit 0

view=$(${limit[@]+"${limit[@]}"} "$gh_bin" pr view "$number" --repo "$repo" --json body \
  2>/dev/null) || exit 0
# Comments go first: the template's own comment in the section names the
# "No rendering change" line, and an untouched template is not a filled section.
body=$(jq -r '.body // "" | gsub("<!--[\\s\\S]*?-->"; "")' <<<"$view" 2>/dev/null) || exit 0
# The section runs from its heading to the next level-2 heading. An image
# elsewhere in the body says nothing about before/after.
section=$(awk '/^## /{inside = ($0 ~ /^## Before \/ after[[:space:]]*$/); next} inside' <<<"$body")
grep -qE 'user-attachments|No rendering change' <<<"$section" && exit 0

jq -n --arg ctx "PR $repo#$number changes $visible (and maybe more) but its \"## Before / after\" \
section has no screenshot. Run \`pnpm pr:shots\` from this PR's worktree: it renders the acceptance-test \
fences in the diff and the examples at the merge base and here, and writes the changed pairs (or a \
\"No rendering change\" line) to reports/pr-shots/. Put its section into the PR body and upload the \
images with \`gh pr edit $number --body-file <file> --attach <png> ...\` as it prints. For an app UI \
change, use \`pnpm pr:shots --url <path>\` against \`pnpm dev\`. Editing the body does not push, so it \
costs no review round." --arg event "$event" \
  '{hookSpecificOutput: {hookEventName: $event, additionalContext: $ctx}}'
