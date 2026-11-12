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
  gh api "repos/$repo/deployments/$1/statuses" \
    --jq '[.[] | select(.state == "success")][0].environment_url // empty'
}

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
done < <(gh api "repos/$repo/deployments?environment=preview&ref=$ref&per_page=30" \
  --jq '.[] | "\(.id):\(.sha)"')

site() { # url sha -> JSON object or null
  if [ -z "$1" ]; then echo null; else
    jq -cn --arg u "$1" --arg s "$2" --arg h "$sha" '{url: $u, sha: $s, matchesHead: ($s == $h)}'
  fi
}

jq -cn --argjson pr "$pr" --arg head "$sha" \
  --argjson app "$(site "$app_url" "$app_sha")" --argjson docs "$(site "$docs_url" "$docs_sha")" \
  '{pr: $pr, headSha: $head, app: $app, docs: $docs}'
