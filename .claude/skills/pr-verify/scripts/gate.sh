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

# The commits CodeRabbit reviewed. Like review-state.ts isCommitReview, a dismissed
# review and an empty-body COMMENTED review (GitHub's wrapper for a thread reply,
# pinned to whatever the head is at the time) are not reviews of a commit.
crReviews=$(gh api graphql --paginate -F owner="$owner" -F name="$name" -F pr="$pr" -f query='
  query($owner: String!, $name: String!, $pr: Int!, $endCursor: String) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $pr) {
        reviews(first: 100, after: $endCursor) {
          pageInfo { hasNextPage endCursor }
          nodes { state body author { login } commit { oid } }
        }
      }
    }
  }' --jq '[.data.repository.pullRequest.reviews.nodes[]
            | select((.author.login // "") | test("^coderabbitai"))
            | select(.state != "DISMISSED")
            | select(.state != "COMMENTED" or ((.body // "") | test("\\S")))
            | (.commit.oid // "")]' \
  | jq -cs 'add // []')

# An open PR whose body says "replaces #N" / "supersedes PRs #M and #N" (any tense).
superseded=$(gh pr list --state open --search "$pr in:body" --json number,title,url,body --limit 30 \
  | jq -c --arg pr "$pr" '[.[] | select(.number != ($pr | tonumber))
        | select(.body | test("(replac|supersed)(e|es|ed|ing)\\s+(PRs?\\s+)?(#\\d+(\\s*,\\s*|\\s+and\\s+|\\s*,\\s*and\\s+))*#" + $pr + "\\b"; "i"))
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

# A read that fails must not look like "nothing required" or "no checks": exit
# without JSON instead (SKILL.md stops and reports the error).
base=$(gh pr view "$pr" --json baseRefName --jq .baseRefName)
required=$(gh api "repos/$repo/rules/branches/$base" \
  --jq '[.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context]') || {
  echo "gate.sh: could not read the required checks of $base" >&2; exit 1; }
# `gh pr checks` exits 1 when a check failed and 8 when one is pending, and still
# prints the JSON; with no checks at all it prints nothing and says so on stderr.
checksErr=$(mktemp)
checks=$(gh pr checks "$pr" --json name,bucket,link,workflow 2>"$checksErr") || true
if [ -z "$checks" ] && grep -q "no checks reported" "$checksErr"; then checks='[]'; fi
if ! jq -e 'type == "array"' >/dev/null 2>&1 <<<"$checks"; then
  echo "gate.sh: could not read the checks of #$pr: $(tail -1 "$checksErr")" >&2; rm -f "$checksErr"; exit 1
fi
rm -f "$checksErr"

jq -cn --argjson pr "$pr" --argjson meta "$meta" --argjson threads "$threads" \
  --argjson cr "$coderabbit" --argjson crTiered "$crTiered" --argjson crReviews "$crReviews" \
  --arg head "$head" --argjson checks "$checks" --argjson required "$required" \
  --argjson sup "$superseded" '
  # gh pr checks keeps the latest run per workflow, so a name that appears more than
  # once comes from different workflows (the required "Check" is reported by three).
  # A name is failed when any of them failed, pending when any is pending, cancelled
  # when one was cancelled and none passed, and settled otherwise.
  ($checks | group_by(.name) | map(
      if any(.bucket == "fail") then (map(select(.bucket == "fail"))[0])
      elif any(.bucket == "pending") then (map(select(.bucket == "pending"))[0])
      elif any(.bucket == "pass") then empty
      elif any(.bucket == "cancel") then (map(select(.bucket == "cancel"))[0])
      else empty end)) as $reported
  | ($required + ["Review tier"]) as $blocking
  # A blocking check that has not reported yet (just after a push or ready) is pending.
  | ($blocking - ($checks | map(.name)) | map({name: ., bucket: "pending", link: null})) as $missing
  | ($reported + $missing) as $open
  | ($open | map(select(.name as $n | $blocking | index($n)))) as $blk
  | ($blk | map(select(.bucket == "fail")) | map({name, link})) as $failed
  | ($blk | map(select(.bucket == "cancel")) | map({name, link})) as $cancelled
  | ($blk | map(select(.bucket == "pending")) | map({name, link})) as $pending
  | ($open | map(select(.bucket == "fail" and (.name as $n | $blocking | index($n) | not))) | map({name, link})) as $other
  | ($cr.state.kind // null) as $kind
  | ([$head] + ($cr.sameChangeCommits // [])) as $sameChange
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
       coderabbitReviews: ($crReviews | length),
       # Settled on the head: a review of the head or of a commit that differs from it only
       # by base merges, or a converged state (a clean summary settles a head too).
       coderabbitReviewedHead: ($kind == "converged" or any($crReviews[]; . as $c | $sameChange | index($c) != null)),
       failedChecks: $failed, cancelledChecks: $cancelled, pendingChecks: $pending, otherFailedChecks: $other}'
