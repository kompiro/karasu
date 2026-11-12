#!/usr/bin/env bash
# Decide whether a PR needs more work before the maintainer reviews it.
# Prints one JSON line:
#   {"pr":N, "verdict":"closed"|"superseded"|"fix"|"wait"|"proceed", "reasons":[…],
#    "supersededBy":[{"number","title","url"}],
#    "tier":"risk: high"|null, "isDraft":bool, "state":"OPEN",
#    "mergeable":"MERGEABLE"|"CONFLICTING"|"UNKNOWN", "mergeStateStatus":"…",
#    "unresolvedThreads":[{"url","path","line","firstLine"}],
#    "coderabbit": <await-review.ts --once output> | null,
#    "failedChecks":[{"name","link"}], "pendingChecks":[{"name","link"}]}
#
# verdict "closed": the PR is already merged or closed; nothing else is checked.
# verdict "superseded": another open PR's body says it replaces or supersedes this
#   one, so fixing this PR would be wasted work; the other checks are still reported.
# verdict "fix": an unresolved CodeRabbit thread, an unanswered CodeRabbit body
#   finding or thread reply, a failed required check, or a conflict with the base.
# verdict "wait": nothing to fix, but a required check or CodeRabbit is still running.
# verdict "proceed": otherwise.
# Run it from a checkout of the repository (await-review.ts reads local git).
set -euo pipefail
pr="${1:?usage: gate.sh <pr>}"
here=$(cd "$(dirname "$0")" && pwd)
root=$(git -C "$here" rev-parse --show-toplevel)
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
owner=${repo%/*} name=${repo#*/}

# GitHub computes mergeability lazily; UNKNOWN right after a push settles in seconds.
for _ in 1 2 3 4 5; do
  meta=$(gh pr view "$pr" --json state,isDraft,mergeable,mergeStateStatus,labels \
    --jq '{state, isDraft, mergeable, mergeStateStatus,
           tier: ([.labels[].name | select(startswith("risk: "))][0] // null)}')
  [ "$(jq -r .mergeable <<<"$meta")" != "UNKNOWN" ] && break
  [ "$(jq -r .state <<<"$meta")" != "OPEN" ] && break
  sleep 3
done

if [ "$(jq -r .state <<<"$meta")" != "OPEN" ]; then
  jq -cn --argjson pr "$pr" --argjson meta "$meta" \
    '{pr: $pr, verdict: "closed", reasons: ["the PR is \($meta.state | ascii_downcase)"]} + $meta'
  exit 0
fi

threads=$(gh api graphql -F owner="$owner" -F name="$name" -F pr="$pr" -f query='
  query($owner: String!, $name: String!, $pr: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100) {
          nodes {
            isResolved isOutdated path line
            comments(first: 1) { nodes { url body author { login } } }
          }
        }
      }
    }
  }' --jq '[.data.repository.pullRequest.reviewThreads.nodes[]
            | select(.isResolved | not)
            | .comments.nodes[0] as $c
            | select($c.author.login | test("^coderabbitai"))
            | {url: $c.url, path, line, outdated: .isOutdated,
               firstLine: ($c.body | split("\n") | map(select(test("\\S"))) | .[0:3] | join(" ") | .[0:200])}]')

# An open PR whose body says "replaces #N" / "supersedes #N" (any tense).
superseded=$(gh pr list --state open --search "$pr in:body" --json number,title,url,body --limit 30 \
  | jq -c --arg pr "$pr" '[.[] | select(.number != ($pr | tonumber))
        | select(.body | test("(replac|supersed)(e|es|ed|ing)\\s+(PR\\s+)?#" + $pr + "\\b"; "i"))
        | {number, title, url}]' 2>/dev/null) || superseded='[]'
[ -z "$superseded" ] && superseded='[]'

# CodeRabbit reviews only High (or no tier label) and Design PRs.
tier=$(jq -r '.tier // ""' <<<"$meta")
coderabbit=null
if [ -z "$tier" ] || [ "$tier" = "risk: high" ] || [ "$tier" = "risk: design" ]; then
  coderabbit=$(cd "$root" && pnpm exec tsx scripts/coderabbit/await-review.ts "$pr" --once 2>/dev/null | tail -1) || coderabbit=null
  jq -e . >/dev/null 2>&1 <<<"$coderabbit" || coderabbit=null
fi

# `gh pr checks` exits non-zero when a check failed or is pending; the JSON is still printed.
checks=$(gh pr checks "$pr" --required --json name,bucket,link 2>/dev/null || true)
[ -z "$checks" ] && checks='[]'

jq -cn --argjson pr "$pr" --argjson meta "$meta" --argjson threads "$threads" \
  --argjson cr "$coderabbit" --argjson checks "$checks" --argjson sup "$superseded" '
  ($checks | map(select(.bucket == "fail" or .bucket == "cancel")) | map({name, link})) as $failed
  | ($checks | map(select(.bucket == "pending")) | map({name, link})) as $pending
  | ([ (if ($threads | length) > 0 then "unresolved CodeRabbit threads: \($threads | length)" else empty end),
       (if $cr != null and ($cr.bodyFindings // 0) > 0 then "unanswered CodeRabbit body findings: \($cr.bodyFindings)" else empty end),
       (if $cr != null and ($cr.threadReplies // 0) > 0 then "CodeRabbit replies waiting on the author: \($cr.threadReplies)" else empty end),
       (if ($failed | length) > 0 then "failed required checks: \($failed | map(.name) | join(", "))" else empty end),
       (if $meta.mergeable == "CONFLICTING" then "conflicts with the base branch" else empty end)
     ]) as $fix
  | ([ (if ($pending | length) > 0 then "required checks still running: \($pending | map(.name) | join(", "))" else empty end),
       (if $cr != null and ($cr.state.kind == "in_progress" or $cr.state.kind == "rate_limited" or $cr.state.kind == "limit_elapsed")
          then "CodeRabbit has not answered the head yet (\($cr.state.kind))" else empty end)
     ]) as $wait
  | ($sup | map("replaced by open PR #\(.number)")) as $replaced
  | {pr: $pr,
     verdict: (if ($replaced | length) > 0 then "superseded"
               elif ($fix | length) > 0 then "fix" elif ($wait | length) > 0 then "wait" else "proceed" end),
     reasons: ($replaced + $fix + $wait)}
    + $meta
    + {supersededBy: $sup, unresolvedThreads: $threads, coderabbit: $cr, failedChecks: $failed, pendingChecks: $pending}'
