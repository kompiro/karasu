#!/usr/bin/env bash
# Claude Code PostToolUse / PostToolUseFailure hook (matcher: Bash), wired in
# .claude/settings.json.
#
# After Claude opens a PR with `gh pr create`, list in the same turn the TPLs
# whose body names a file the PR changes (top 10 by weight), and ask it to cite
# the ones that apply under `## TPL impact` while the PR is still a draft
# (#3486, ADR-3486). It never gates: the checklist items are judgment, so
# asking for a reason per skipped TPL would only grow boilerplate.
#
# The PR is taken from the URL gh prints, not from the command text (as in
# scripts/pr-shots/reminder.sh, ADR-3359). The list is computed in the worktree
# that has the PR's head branch checked out: the hook starts in
# $CLAUDE_PROJECT_DIR (the main checkout), which cannot see `## 関連テスト`
# lines the PR itself adds, and the input `cwd` does not follow
# `cd X && gh pr create`. The diff is taken against the PR's own base, so a
# stacked PR does not count the files of the PR below it.
#
# Input: the hook JSON on stdin. Output: nothing, or an additionalContext JSON.
# Every unexpected state (no URL, no worktree, no tpl binary, a failing call)
# exits 0 silently: a reminder must never break a Bash call.
#
# Override the gh binary with TPL_CHANGED_HOOK_GH (tests use a stub).

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

gh_bin=${TPL_CHANGED_HOOK_GH:-gh}
limit=()
# One gh call and one tpl call, 10 s each, inside the hook's 30 s timeout
# (.claude/settings.json).
command -v timeout >/dev/null 2>&1 && limit=(timeout 10)

refs=$(${limit[@]+"${limit[@]}"} "$gh_bin" pr view "$number" --repo "$repo" \
  --json headRefName,baseRefName --jq '.headRefName + " " + .baseRefName' 2>/dev/null) || exit 0
read -r head base <<<"$refs"
[ -n "${head:-}" ] && [ -n "${base:-}" ] || exit 0

worktree=$(git -C "${CLAUDE_PROJECT_DIR:-$PWD}" worktree list --porcelain 2>/dev/null \
  | awk -v ref="branch refs/heads/$head" '/^worktree /{path = substr($0, 10)} $0 == ref {print path; exit}')
[ -n "$worktree" ] || exit 0
tpl_bin="$worktree/node_modules/.bin/tpl"
[ -x "$tpl_bin" ] || exit 0

list=$(cd "$worktree" && ${limit[@]+"${limit[@]}"} "$tpl_bin" related --config tpl.config.json \
  --base "origin/$base" 2>/dev/null) || exit 0

if [ -n "$list" ]; then
  ctx="TPLs whose body names a file PR $repo#$number changes (\`pnpm tpl:changed --base origin/$base\`, \
top 10 by weight):

$list

Read the ones that touch this change and cite them under \`## TPL impact\` in the PR body, saying how \
the change meets them (a test, a checked item). Nothing needs to be written for the ones that do not \
apply. If you cite a TPL that is not listed here, add the file it should have named to its \
\`## 関連テスト\` (or \`scope.paths\`) in this PR. Editing the body does not push, so it costs no \
review round."
else
  ctx="No TPL names a file PR $repo#$number changes (\`pnpm tpl:changed --base origin/$base\`). \
Cross-cutting TPLs are not recalled by file: check \`pnpm tpl:related <topic>\` for the topics this \
change touches, and cite the ones that apply under \`## TPL impact\`."
fi

jq -n --arg ctx "$ctx" --arg event "$event" \
  '{hookSpecificOutput: {hookEventName: $event, additionalContext: $ctx}}'
