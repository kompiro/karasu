#!/usr/bin/env bash
# Decides whether a `gh pr ready` / `gh pr create` may run (#3342, ADR-3342).
# Called by the gh wrapper scripts/bin/gh with gh's own arguments, so it sees
# exactly what gh would receive, however the command was written (eval,
# scripts, wrappers, xargs). Prints the refusal reason, or nothing to allow.
#
# - `gh pr ready` needs a completed local CodeRabbit CLI review whose reviewed
#   commit belongs to this PR's branch: an ancestor of the PR head that is not
#   on the base branch.
# - `gh pr create` without --draft skips `gh pr ready`, so it needs the same
#   review, read against the branch being pushed (--head, or HEAD) and --base
#   (or origin's default branch). A Low ADR PR is opened this way (#3504). Fix commits made after it are fine, since the CLI runs
#   once (ADR-3326). The CLI keeps one directory per local review, with the
#   reviewed commit in git.json (.head) and the completion state in
#   .session-complete-v2 (.state). /engineering:code-review leaves no record,
#   so only the CLI run is checked; the refusal names both steps.
#
# Lets the call through when:
# - KARASU_LOCAL_REVIEW_SKIPPED holds a non-empty reason, the deliberate skip
#   for when the CLI cannot run here;
# - a create passes --draft;
# - the PR is not a draft (every tier records the CLI run, #3286);
# - --undo, or --repo / -R (the local checkout may not hold that repository);
# - anything cannot be determined (gh fails, unknown CLI record format). The
#   gate must never block work because of its own failure.
#
# Usage: ready-gate.sh <pr> <ready|create> [gh args...]
# Environment: READY_GATE_GH (the real gh binary), CODERABBIT_REVIEWS_DIR.

set -u

[ "${1:-}" = "pr" ] || exit 0
action=${2:-}
shift 2 2>/dev/null || exit 0

# Resolves a base branch name to a local ref, preferring the remote one.
base_ref_of() {
  local ref=origin/$1
  git rev-parse --verify --quiet "$ref^{commit}" >/dev/null || ref=$1
  git rev-parse --verify --quiet "$ref^{commit}" >/dev/null || return 1
  echo "$ref"
}

# Succeeds when a completed CLI review covers the branch that ends at $1: its
# reviewed commit is an ancestor of $1 and not on $2 (the base ref). Also
# succeeds when records exist but none can be read (the CLI's format changed),
# so the gate fails open.
reviewed_branch() {
  local head=$1 base_ref=$2 reviews records=0 record reviewed
  reviews=${CODERABBIT_REVIEWS_DIR:-$HOME/.coderabbit/reviews}
  for record in "$reviews"/*/*/reviews/*/; do
    [ -f "$record/git.json" ] || continue
    reviewed=$(jq -r '.head // empty' "$record/git.json" 2>/dev/null)
    [ -n "$reviewed" ] || continue
    records=$((records + 1))
    [ "$(jq -r '.state // empty' "$record/.session-complete-v2" 2>/dev/null)" = "complete" ] || continue
    git cat-file -e "$reviewed^{commit}" 2>/dev/null || continue
    git merge-base --is-ancestor "$reviewed" "$head" 2>/dev/null || continue
    git merge-base --is-ancestor "$reviewed" "$base_ref" 2>/dev/null && continue
    return 0
  done
  [ "$records" -eq 0 ] && [ -n "$(ls -A "$reviews" 2>/dev/null)" ]
}

skipped() {
  local reason=${KARASU_LOCAL_REVIEW_SKIPPED:-}
  [ -n "${reason//[[:space:]]/}" ]
}

if [ "$action" = "create" ]; then
  # Read the arguments the way gh (pflag) does, so that an option's value is
  # never taken for --draft (`--body --draft` passes "--draft" as the body).
  # Options of `gh pr create` that take a value, from `gh pr create --help`:
  value_short="aBbFHlmprTtR"
  # pflag's boolean values; anything it would not accept is not a draft.
  as_bool() {
    case "$1" in
      1 | t | T | true | TRUE | True) echo true ;;
      *) echo false ;;
    esac
  }
  draft=false
  # The option whose value the next argument is: base, head, repo, or other.
  expect_value=""
  base_name=""
  head_name=""
  other_repo=false
  take_value() {
    case "$1" in
      base) base_name=$2 ;;
      head) head_name=$2 ;;
      repo) other_repo=true ;;
    esac
  }
  for arg in "$@"; do
    if [ -n "$expect_value" ]; then
      take_value "$expect_value" "$arg"
      expect_value=""
      continue
    fi
    case "$arg" in
      --) break ;;
      --draft) draft=true ;;
      --draft=*) draft=$(as_bool "${arg#--draft=}") ;;
      --base) expect_value=base ;;
      --base=*) base_name=${arg#--base=} ;;
      --head) expect_value="head" ;;
      --head=*) head_name=${arg#--head=} ;;
      --repo) expect_value=repo ;;
      --repo=*) other_repo=true ;;
      --assignee | --attach | --body | --body-file | --label | --milestone | \
        --project | --recover | --reviewer | --template | --title)
        expect_value=other
        ;;
      --*) ;;
      -?*)
        # A cluster of short options, read by pflag's grammar: each boolean
        # letter is on unless `=<value>` follows it, which ends the cluster; the
        # first letter that takes a value consumes the rest of the word (minus a
        # leading `=`) or, when nothing is left, the next argument. Examples:
        # -dw, -d=false, -tTitle, -t=Title, -t Title.
        cluster=${arg#-}
        while [ -n "$cluster" ]; do
          letter=${cluster:0:1}
          cluster=${cluster:1}
          if [ "${value_short#*"$letter"}" != "$value_short" ]; then
            case "$letter" in
              B) option=base ;;
              H) option="head" ;;
              R) option=repo ;;
              *) option=other ;;
            esac
            if [ -z "$cluster" ]; then
              expect_value=$option
            else
              take_value "$option" "${cluster#=}"
            fi
            break
          fi
          if [ "${cluster:0:1}" = "=" ]; then
            [ "$letter" = "d" ] && draft=$(as_bool "${cluster:1}")
            break
          fi
          [ "$letter" = "d" ] && draft=true
        done
        ;;
    esac
  done
  [ "$draft" = true ] && exit 0
  skipped && exit 0
  [ "$other_repo" = true ] && exit 0
  head_ref=${head_name:-HEAD}
  head=$(git rev-parse --verify --quiet "$head_ref^{commit}" ||
    git rev-parse --verify --quiet "origin/$head_ref^{commit}") || exit 0
  if [ -z "$base_name" ]; then
    base_name=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)
    base_name=${base_name#origin/}
  fi
  base_ref=$(base_ref_of "${base_name:-main}") || exit 0
  reviewed_branch "$head" "$base_ref" && exit 0
  echo "gh pr create was refused: no completed local CodeRabbit CLI review covers this branch \
(head ${head:0:7}). Create the PR as a draft (gh pr create --draft) and take it out of draft with gh pr ready \
once the review is done (docs/process.md PR workflow). To create it ready (a Low ADR PR, \
.claude/rules/adr.md): run /engineering:code-review on git diff $base_ref...HEAD, then run the CLI once \
(coderabbit review --agent --deep --base $base_ref --committed), then create it again. If the CLI cannot run \
here (not installed, not authenticated, out of quota), tell the user, then rerun as \
KARASU_LOCAL_REVIEW_SKIPPED=<reason> gh pr create ..."
  exit 0
fi

[ "$action" = "ready" ] || exit 0
skipped && exit 0

selector=""
for arg in "$@"; do
  case "$arg" in
    # -R also comes attached (-Rowner/repo, -R=owner/repo).
    --undo | -R* | --repo | --repo=*) exit 0 ;;
    -*) ;;
    *) [ -z "$selector" ] && selector=$arg ;;
  esac
done

gh_bin=${READY_GATE_GH:-gh}
limit=()
command -v timeout >/dev/null 2>&1 && limit=(timeout 15)
view=$(${limit[@]+"${limit[@]}"} "$gh_bin" pr view ${selector:+"$selector"} \
  --json number,isDraft,headRefOid,baseRefName 2>/dev/null) || exit 0

[ "$(jq -r '.isDraft' <<<"$view")" = "true" ] || exit 0

number=$(jq -r '.number' <<<"$view")
head=$(jq -r '.headRefOid' <<<"$view")
base=$(jq -r '.baseRefName' <<<"$view")
git cat-file -e "$head^{commit}" 2>/dev/null || exit 0
base_ref=$(base_ref_of "$base") || exit 0
reviewed_branch "$head" "$base_ref" && exit 0

echo "gh pr ready was refused: no completed local CodeRabbit CLI review covers PR #$number's branch \
(head ${head:0:7}). Before taking a PR out of draft (docs/process.md PR workflow): run \
/engineering:code-review on git diff $base_ref...HEAD, then run the CLI once \
(coderabbit review --agent --deep --base $base_ref --committed), commit and push the fixes, and run \
gh pr ready again. If the CLI cannot run here (not installed, not authenticated, out of quota), tell \
the user, then rerun as KARASU_LOCAL_REVIEW_SKIPPED=<reason> gh pr ready $number."
