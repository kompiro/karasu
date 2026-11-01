#!/usr/bin/env bash
# Decides whether a `gh pr ready` / `gh pr create` may run (#3342, ADR-3342).
# Called by the gh wrapper scripts/bin/gh with gh's own arguments, so it sees
# exactly what gh would receive, however the command was written (eval,
# scripts, wrappers, xargs). Prints the refusal reason, or nothing to allow.
#
# - `gh pr ready` needs a completed local CodeRabbit CLI review whose reviewed
#   commit belongs to this PR's branch: an ancestor of the PR head that is not
#   on the base branch. Fix commits made after it are fine, since the CLI runs
#   once (ADR-3326). The CLI keeps one directory per local review, with the
#   reviewed commit in git.json (.head) and the completion state in
#   .session-complete-v2 (.state). /engineering:code-review leaves no record,
#   so only the CLI run is checked; the refusal names both steps.
# - `gh pr create` must pass --draft, except for a Low PR (--label "risk: low"):
#   a Low ADR PR opens without a draft (#3504). "risk: low" must be the only
#   tier label: Review tier takes the strictest, so another one makes the PR
#   that tier, which goes through a draft. Such a create skips
#   `gh pr ready`, so it needs the same review, of HEAD against the base gh
#   picks (--base, the branch's gh-merge-base, or origin's default branch, read
#   from origin only). A higher tier still goes through a draft, so the ready
#   and its converge hook (ADR-3333) are not skipped. Such a create takes one
#   form only, the one where gh pushes the checked-out branch to origin's
#   repository: --head, --repo / -R, GH_REPO / GH_HOST, or a `gh repo
#   set-default` other than origin is refused, and so is a base origin does not
#   have. Reading each of those the way gh would is a list with no end, and
#   --draft is always a way through.
#
# Lets the call through when:
# - a ready, and KARASU_LOCAL_REVIEW_SKIPPED holds a non-empty reason, the
#   deliberate skip for when the CLI cannot run here. A Low create does not
#   take it: Review tier refuses a Low PR whose record skipped the CLI, so such
#   a PR is raised to Medium and goes through a draft;
# - a create passes --draft;
# - the PR is not a draft (every tier records the CLI run, #3286);
# - a ready with --undo, or with --repo / -R naming a repository other than
#   origin (the local checkout may not hold it). Naming origin itself changes
#   nothing, so the check still runs (#3514);
# - anything about a ready cannot be determined (gh fails, unknown CLI record
#   format). The gate must never block work because of its own failure.
#
# Usage: ready-gate.sh <pr> <ready|create> [gh args...]
# Environment: READY_GATE_GH (the real gh binary), CODERABBIT_REVIEWS_DIR.

set -u

[ "${1:-}" = "pr" ] || exit 0
action=${2:-}
shift 2 2>/dev/null || exit 0

# Resolves a base branch name to a local ref, preferring the remote one. With
# $2 "remote", only origin's branch counts.
base_ref_of() {
  local ref=origin/$1
  if ! git rev-parse --verify --quiet "$ref^{commit}" >/dev/null; then
    [ "${2:-}" = remote ] && return 1
    ref=$1
  fi
  git rev-parse --verify --quiet "$ref^{commit}" >/dev/null || return 1
  echo "$ref"
}

# Succeeds when a completed CLI review covers the branch that ends at $1: its
# reviewed commit is an ancestor of $1 and not on $2 (the base ref). Unless $3
# is "strict", also succeeds when the store is not empty but holds no readable
# record (the CLI's format changed), so the gate fails open.
reviewed_branch() {
  local head=$1 base_ref=$2 mode=${3:-} reviews records=0 record reviewed
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
  [ "$mode" != strict ] && [ "$records" -eq 0 ] && [ -n "$(ls -A "$reviews" 2>/dev/null)" ]
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
  # The option whose value the next argument is: base, head, label, repo, or
  # other.
  expect_value=""
  base_name=""
  head_name=""
  low=false
  higher=false
  repo_name=""
  take_value() {
    local name
    case "$1" in
      base) base_name=$2 ;;
      head) head_name=$2 ;;
      label)
        # gh splits a --label value on commas.
        while IFS= read -r -d , name; do
          name=${name#"${name%%[![:space:]]*}"}
          name=${name%"${name##*[![:space:]]}"}
          case "$name" in
            "risk: low") low=true ;;
            "risk: design" | "risk: medium" | "risk: high") higher=true ;;
          esac
        done <<<"$2,"
        ;;
      repo) repo_name=$2 ;;
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
      --label) expect_value=label ;;
      --label=*) take_value label "${arg#--label=}" ;;
      --repo) expect_value=repo ;;
      --repo=*) repo_name=${arg#--repo=} ;;
      --assignee | --attach | --body | --body-file | --milestone | \
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
              l) option=label ;;
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
  if [ "$low" != true ] || [ "$higher" = true ]; then
    echo "gh pr create was refused: create the PR as a draft (gh pr create --draft). Run \
/engineering:code-review on the branch diff and one CodeRabbit CLI review before taking it out of draft \
with gh pr ready (docs/process.md PR workflow). Only a Low PR (--label \"risk: low\" and no other tier label, a Low ADR PR in \
.claude/rules/adr.md) is created without --draft."
    exit 0
  fi
  if skipped; then
    echo "gh pr create was refused: a Low PR needs the CLI review, and Review tier refuses a Low record \
that skipped it. Label the PR risk: medium, create it as a draft (gh pr create --draft), and take it out of \
draft with KARASU_LOCAL_REVIEW_SKIPPED=<reason> gh pr ready (docs/process/review.md)."
    exit 0
  fi
  # From here on the gate reads what the PR will be. A Low create takes one
  # form, the one where gh pushes HEAD to origin's repository; anything else is
  # refused rather than read, since --draft is always a way to open the PR.
  unverifiable() {
    echo "gh pr create was refused: $1, so the local review of this PR cannot be checked. Create it as a \
draft (gh pr create --draft) and take it out of draft with gh pr ready (docs/process.md PR workflow)."
    exit 0
  }
  [ -z "$head_name" ] || unverifiable "a Low PR without --draft is created from the checked-out branch, not --head"
  [ -z "$repo_name" ] || unverifiable "a Low PR without --draft is created in origin's repository, not --repo"
  [ -z "${GH_REPO:-}${GH_HOST:-}" ] || unverifiable "GH_REPO or GH_HOST picks the repository"
  # `gh repo set-default` records the chosen remote as remote.<name>.gh-resolved.
  resolved=$(git config --get-regexp '^remote\..*\.gh-resolved$' 2>/dev/null)
  if [ -n "$resolved" ] && [ "$resolved" != "remote.origin.gh-resolved base" ]; then
    unverifiable "gh repo set-default picks a repository other than origin"
  fi
  head=$(git rev-parse --verify --quiet "HEAD^{commit}") || unverifiable "HEAD is not a commit"
  # The base gh picks: --base, then the branch's gh-merge-base, then the
  # repository's default branch (origin/HEAD here).
  if [ -z "$base_name" ]; then
    branch=$(git symbolic-ref --quiet --short HEAD 2>/dev/null) &&
      base_name=$(git config --get "branch.$branch.gh-merge-base" 2>/dev/null)
  fi
  if [ -z "$base_name" ]; then
    base_name=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null) ||
      unverifiable "origin's default branch is not known here (git remote set-head origin --auto)"
    base_name=${base_name#origin/}
  fi
  base_ref=$(base_ref_of "$base_name" remote) || unverifiable "origin has no base branch $base_name here"
  reviewed_branch "$head" "$base_ref" strict && exit 0
  echo "gh pr create was refused: no completed local CodeRabbit CLI review covers this branch \
(HEAD at ${head:0:7}). A Low PR is created without --draft only after its local review \
(.claude/rules/adr.md): run /engineering:code-review on git diff $base_ref...HEAD, \
then run the CLI once \
(coderabbit review --agent --deep --base $base_ref --committed), then create it again. If the CLI cannot run \
here (not installed, not authenticated, out of quota), tell the user, label the PR risk: medium and create it \
as a draft: Review tier refuses a Low record that skipped the CLI."
  exit 0
fi

[ "$action" = "ready" ] || exit 0
skipped && exit 0

# host/owner/repo, lowercased, of a GitHub URL or of [HOST/]OWNER/REPO (gh's
# default host is github.com).
repo_id() {
  local s=${1%/}
  s=${s%.git}
  s=${s#*://}
  s=${s#*@}
  s=$(printf '%s' "${s//://}" | tr '[:upper:]' '[:lower:]')
  case "$s" in
    */*/*) ;;
    *) s=github.com/$s ;;
  esac
  echo "$s"
}

selector=""
repo=""
expect_repo=false
for arg in "$@"; do
  if [ "$expect_repo" = true ]; then
    repo=$arg
    expect_repo=false
    continue
  fi
  case "$arg" in
    --undo) exit 0 ;;
    -R | --repo) expect_repo=true ;;
    # -R also comes attached (-Rowner/repo, -R=owner/repo).
    -R=*) repo=${arg#-R=} ;;
    -R*) repo=${arg#-R} ;;
    --repo=*) repo=${arg#--repo=} ;;
    -*) ;;
    *) [ -z "$selector" ] && selector=$arg ;;
  esac
done
if [ -n "$repo" ]; then
  origin=$(git remote get-url origin 2>/dev/null) || exit 0
  [ "$(repo_id "$repo")" = "$(repo_id "$origin")" ] || exit 0
fi

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
