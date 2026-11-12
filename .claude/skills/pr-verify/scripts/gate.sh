#!/usr/bin/env bash
# Decide whether a PR needs more work before the maintainer reviews it.
# Prints one JSON line:
#   {"pr":N, "verdict":"closed"|"superseded"|"fix"|"wait"|"proceed", "reasons":[…],
#    "supersededBy":[{"number","title","url"}],
#    "headSha":"…", "tier":"risk: high"|null, "isDraft":bool, "state":"OPEN",
#    "isCrossRepository":bool, "author":"login",
#    "mergeable":"MERGEABLE"|"CONFLICTING"|"UNKNOWN", "mergeStateStatus":"…",
#    "unresolvedThreads":[{"url","path","line","outdated","firstLine"}],
#    "coderabbit": <await-review.ts --once output> | null,
#    "coderabbitReviews":N, "coderabbitReviewedHead":bool,
#    "failedChecks":[{"name","link"}], "cancelledChecks":[…], "pendingChecks":[…],
#    "otherFailedChecks":[…]}
#
# verdict "closed": the PR is already merged or closed; nothing else is checked.
# verdict "superseded": another open PR's body says it replaces or supersedes this
#   one, so fixing this PR would be wasted work; the other checks are still reported.
# verdict "fix": work for the implementing session: an unresolved CodeRabbit thread,
#   an unanswered CodeRabbit body finding or thread reply, a CodeRabbit rate limit
#   that has passed (someone has to re-request the review), a failed blocking check,
#   or a conflict with the base.
# verdict "wait": nothing to fix yet, but something has not settled: a blocking check
#   running or cancelled (re-run the latest run), CodeRabbit still reviewing or
#   rate-limited, a High/Design PR CodeRabbit has never answered (state "waiting" and
#   no CodeRabbit review on the PR; a clean summary alone settles it), a CodeRabbit state
#   that could not be read, or a mergeability GitHub has not computed.
# verdict "proceed": otherwise.
# Blocking checks are the ruleset's required checks plus "Review tier", which the
# review process requires although the ruleset does not list it. Other failing
# checks are reported in otherFailedChecks without changing the verdict.
# Run it from a checkout of the repository (await-review.ts reads local git).
set -euo pipefail
pr="${1:?usage: gate.sh <pr>}"
here=$(cd "$(dirname "$0")" && pwd)
root=$(git -C "$here" rev-parse --show-toplevel)
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
owner=${repo%/*} name=${repo#*/}

# GitHub computes mergeability lazily; UNKNOWN right after a push settles in seconds.
for _ in 1 2 3 4 5; do
  meta=$(gh pr view "$pr" --json state,isDraft,mergeable,mergeStateStatus,labels,headRefOid,isCrossRepository,author \
    --jq '{state, isDraft, mergeable, mergeStateStatus, headSha: .headRefOid, isCrossRepository,
           author: .author.login,
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
head=$(jq -r .headSha <<<"$meta")

# Every review thread, page by page (--paginate prints one array per page).
threads=$(gh api graphql --paginate -F owner="$owner" -F name="$name" -F pr="$pr" -f query='
  query($owner: String!, $name: String!, $pr: Int!, $endCursor: String) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100, after: $endCursor) {
          pageInfo { hasNextPage endCursor }
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
            | select(($c.author.login // "") | test("^coderabbitai"))
            | {url: $c.url, path, line, outdated: .isOutdated,
               firstLine: ($c.body | split("\n") | map(select(test("\\S"))) | .[0:3] | join(" ") | .[0:200])}]' \
  | jq -cs 'add // []')

# CodeRabbit's reviews: whether it has reviewed the PR at all, and the head itself.
crReviews=$(gh api graphql -F owner="$owner" -F name="$name" -F pr="$pr" -f query='
  query($owner: String!, $name: String!, $pr: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $pr) {
        reviews(last: 100) { nodes { author { login } commit { oid } } }
      }
    }
  }' --jq '[.data.repository.pullRequest.reviews.nodes[]
            | select((.author.login // "") | test("^coderabbitai")) | (.commit.oid // "")]')

# An open PR whose body says "replaces #N" / "supersedes #N" (any tense).
superseded=$(gh pr list --state open --search "$pr in:body" --json number,title,url,body --limit 30 \
  | jq -c --arg pr "$pr" '[.[] | select(.number != ($pr | tonumber))
        | select(.body | test("(replac|supersed)(e|es|ed|ing)\\s+(PR\\s+)?#" + $pr + "\\b"; "i"))
        | {number, title, url}]' 2>/dev/null) || superseded='[]'
[ -z "$superseded" ] && superseded='[]'

# CodeRabbit reviews only High (or no tier label) and Design PRs. For those, a state
# that cannot be read is "unavailable", never null (null means "not reviewed by tier").
tier=$(jq -r '.tier // ""' <<<"$meta")
coderabbit=null
crTiered=false
if [ -z "$tier" ] || [ "$tier" = "risk: high" ] || [ "$tier" = "risk: design" ]; then
  crTiered=true
  crErr=$(mktemp)
  coderabbit=$(cd "$root" && pnpm exec tsx scripts/coderabbit/await-review.ts "$pr" --once 2>"$crErr" | tail -1) || coderabbit=""
  if ! jq -e . >/dev/null 2>&1 <<<"$coderabbit"; then
    coderabbit=$(jq -cn --arg err "$(tail -3 "$crErr")" '{state: {kind: "unavailable"}, error: $err}')
  fi
  rm -f "$crErr"
fi

required=$(gh api "repos/$repo/rules/branches/$(gh pr view "$pr" --json baseRefName --jq .baseRefName)" \
  --jq '[.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context]' \
  2>/dev/null) || required='[]'
[ -z "$required" ] && required='[]'
# `gh pr checks` exits non-zero when a check failed or is pending; the JSON is still printed.
checks=$(gh pr checks "$pr" --json name,bucket,link 2>/dev/null || true)
[ -z "$checks" ] && checks='[]'

jq -cn --argjson pr "$pr" --argjson meta "$meta" --argjson threads "$threads" \
  --argjson cr "$coderabbit" --argjson crTiered "$crTiered" --argjson crReviews "$crReviews" \
  --arg head "$head" --argjson checks "$checks" --argjson required "$required" \
  --argjson sup "$superseded" '
  # A check name can appear more than once (re-runs, two workflows); it counts as
  # passed when any of its runs passed, and otherwise by its worst state.
  ($checks | group_by(.name) | map(
      if any(.bucket == "pass" or .bucket == "skipping") then empty
      else (if any(.bucket == "fail") then (map(select(.bucket == "fail"))[0])
            elif any(.bucket == "pending") then (map(select(.bucket == "pending"))[0])
            else .[0] end) end)) as $open
  | ($required + ["Review tier"]) as $blocking
  | ($open | map(select(.name as $n | $blocking | index($n)))) as $blk
  | ($blk | map(select(.bucket == "fail")) | map({name, link})) as $failed
  | ($blk | map(select(.bucket == "cancel")) | map({name, link})) as $cancelled
  | ($blk | map(select(.bucket == "pending")) | map({name, link})) as $pending
  | ($open | map(select(.bucket == "fail" and (.name as $n | $blocking | index($n) | not))) | map({name, link})) as $other
  | ($cr.state.kind // null) as $kind
  | ([ (if ($threads | length) > 0 then "unresolved CodeRabbit threads: \($threads | length)" else empty end),
       (if ($cr.bodyFindings // 0) > 0 then "unanswered CodeRabbit body findings: \($cr.bodyFindings)" else empty end),
       (if ($cr.threadReplies // 0) > 0 then "CodeRabbit replies waiting on the author: \($cr.threadReplies)" else empty end),
       (if $kind == "limit_elapsed" then "CodeRabbit rate limit has passed; the implementing session has to re-request the review" else empty end),
       (if ($failed | length) > 0 then "failed checks: \($failed | map(.name) | join(", "))" else empty end),
       (if $meta.mergeable == "CONFLICTING" then "conflicts with the base branch" else empty end)
     ]) as $fix
  | ([ (if ($pending | length) > 0 then "checks still running: \($pending | map(.name) | join(", "))" else empty end),
       (if ($cancelled | length) > 0 then "checks cancelled, re-run the latest run: \($cancelled | map(.name) | join(", "))" else empty end),
       (if $kind == "in_progress" or $kind == "rate_limited" then "CodeRabbit has not answered the head yet (\($kind))" else empty end),
       (if $kind == "unavailable" then "CodeRabbit state could not be read (\($cr.error))" else empty end),
       (if $crTiered and $kind == "waiting" and ($crReviews | length) == 0 then "CodeRabbit has not reviewed this PR yet" else empty end),
       (if $meta.mergeable == "UNKNOWN" then "GitHub has not computed mergeability yet" else empty end)
     ]) as $wait
  | ($sup | map("replaced by open PR #\(.number)")) as $replaced
  | {pr: $pr,
     verdict: (if ($replaced | length) > 0 then "superseded"
               elif ($fix | length) > 0 then "fix" elif ($wait | length) > 0 then "wait" else "proceed" end),
     reasons: ($replaced + $fix + $wait)}
    + $meta
    + {supersededBy: $sup, unresolvedThreads: $threads, coderabbit: $cr,
       coderabbitReviews: ($crReviews | length), coderabbitReviewedHead: ($crReviews | index($head) != null),
       failedChecks: $failed, cancelledChecks: $cancelled, pendingChecks: $pending, otherFailedChecks: $other}'
