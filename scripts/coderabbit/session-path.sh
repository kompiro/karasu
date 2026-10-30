#!/usr/bin/env bash
# Claude Code SessionStart hook, wired in .claude/settings.json (#3342, ADR-3342).
#
# Puts scripts/bin first on PATH for the Bash commands the session runs, so the
# gh wrapper there sees every `gh` call. Claude Code sources $CLAUDE_ENV_FILE
# before each Bash command. The line is idempotent, because SessionStart runs
# again on resume, /clear and compaction and the file may be sourced into a
# PATH that already has the entry.

set -u

[ -n "${CLAUDE_ENV_FILE:-}" ] || exit 0
bin="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}/scripts/bin"
[ -x "$bin/gh" ] || exit 0

# $PATH stays literal here: it is expanded when the file is sourced.
# shellcheck disable=SC2016
printf 'case ":$PATH:" in *:%q:*) ;; *) export PATH=%q:"$PATH" ;; esac\n' "$bin" "$bin" >>"$CLAUDE_ENV_FILE"
