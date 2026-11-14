#!/usr/bin/env bash
# Print the Cloudflare Pages previews of a PR as one JSON line:
#   {"pr":N,"headSha":"…",
#    "app": {"url":"https://<hash>.karasu.pages.dev","sha":"…","matchesHead":true} | null,
#    "docs":{"url":"https://<hash>.karasu-docs.pages.dev","sha":"…","matchesHead":true} | null}
# The Preview workflow deploys the app and the Docs Preview workflow deploys the
# docs site, both under the GitHub environment "preview"; a PR gets only the ones
# whose paths it touches. For each site this prints the deployment of the head
# commit, or else the newest one of the branch with matchesHead false, so the
# report can say the preview may lag the PR. A site with no successful
# deployment is null.
# Docs URLs are served under /karasu/ (the production base path).
set -euo pipefail
pr="${1:?usage: preview-url.sh <pr>}"
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
read -r ref sha < <(gh pr view "$pr" --json headRefName,headRefOid --jq '"\(.headRefName) \(.headRefOid)"')

url_of() { # deployment id -> environment_url of its latest successful status, or empty
  # Statuses come newest first; read every page so a success past the first is seen.
  gh api --paginate "repos/$repo/deployments/$1/statuses?per_page=100" \
    --jq '.[] | select(.state == "success") | .environment_url // empty' | sed -n 1p
}

# Read the list into a variable first: a failed read must stop the script rather
# than look like a PR with no preview, which `done < <(…)` would hide. Every page
# is read, newest first. The ref goes in as a field so that a branch name with
# a URI delimiter (feature/#12) is encoded rather than cut at the "#".
deps=$(gh api --paginate -X GET "repos/$repo/deployments" \
  -f environment=preview -f ref="$ref" -f per_page=100 \
  --jq '.[] | "\(.id):\(.sha)"')
app_url="" app_sha="" docs_url="" docs_sha=""
while IFS=: read -r id dsha; do
  [ -z "$id" ] && continue
  u=$(url_of "$id")
  case "$u" in
    *.karasu.pages.dev*)
      if [ -z "$app_url" ] || { [ "$dsha" = "$sha" ] && [ "$app_sha" != "$sha" ]; }; then
        app_url=$u app_sha=$dsha
      fi ;;
    *.karasu-docs.pages.dev*)
      if [ -z "$docs_url" ] || { [ "$dsha" = "$sha" ] && [ "$docs_sha" != "$sha" ]; }; then
        docs_url=$u docs_sha=$dsha
      fi ;;
  esac
  # Both sites found at the head: older deployments cannot change the answer.
  if [ "$app_sha" = "$sha" ] && [ "$docs_sha" = "$sha" ]; then break; fi
done <<<"$deps"

site() { # url sha -> JSON object or null
  if [ -z "$1" ]; then echo null; else
    jq -cn --arg u "$1" --arg s "$2" --arg h "$sha" '{url: $u, sha: $s, matchesHead: ($s == $h)}'
  fi
}

jq -cn --argjson pr "$pr" --arg head "$sha" \
  --argjson app "$(site "$app_url" "$app_sha")" --argjson docs "$(site "$docs_url" "$docs_sha")" \
  '{pr: $pr, headSha: $head, app: $app, docs: $docs}'
