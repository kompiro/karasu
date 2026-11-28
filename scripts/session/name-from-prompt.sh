#!/usr/bin/env bash
# Claude Code UserPromptSubmit hook, wired in .claude/settings.json (#3920).
#
# Names a session after the start skill that opened it, so sessions can address
# each other by name (docs/process/review.md 「セッション同士のやりとり」):
#
#   /impl <N>          -> impl-<N>
#   /local-review <N>  -> review-<N>   (/review is an alias of the built-in /code-review)
#   /verify <N>        -> verify-<N>
#
# The whole prompt, with surrounding whitespace and newlines trimmed, must be
# one of these; `#` before the number is allowed. Any other prompt gets no
# output, so other sessions keep their names.
#
# The VS Code extension puts the editor context in front of what kompiro typed:
# <ide_opened_file>...</ide_opened_file> and <ide_selection>...</ide_selection>
# blocks, followed by a newline (seen on 2.1.332, on the first prompt of a
# session while a file is open). Those leading blocks are dropped before the
# match; only they are, so text typed before or after the command still keeps
# the name unchanged.
#
# A session that already carries another role's name (impl-3920 typing
# /verify 3920) is left alone: a role name must only ever be on a session doing
# that role. The current name is read from the hook input's session_title,
# which Claude Code sends once the session has a name from /rename, --name or
# this hook (seen on 2.1.332; not documented). Without it, the name is read
# from the last {"type":"custom-title","customTitle":...} line of
# transcript_path, which is how Claude Code records those names (seen on
# 2.1.329; not documented). Neither means the session has no name yet.
#
# The name is returned as hookSpecificOutput.sessionTitle, which renames the
# session the way --name does (seen on 2.1.329; not documented). If a release
# drops it, sessions keep their automatic names and the start skills fall back
# to asking kompiro for /rename.
#
# Input: the hook JSON on stdin. Output: nothing, or the sessionTitle JSON.
# The hook uses no network, and every unexpected state exits 0 silently: a
# naming hook must never block a prompt.

set -u

input=$(cat)
# Drops each leading editor-context block that is closed; an unclosed one stays, so the match fails.
prompt=$(jq -r '
  def strip_ide:
    if test("^\\s*<ide_opened_file>[\\s\\S]*?</ide_opened_file>") then
      sub("^\\s*<ide_opened_file>[\\s\\S]*?</ide_opened_file>"; "") | strip_ide
    elif test("^\\s*<ide_selection>[\\s\\S]*?</ide_selection>") then
      sub("^\\s*<ide_selection>[\\s\\S]*?</ide_selection>"; "") | strip_ide
    else . end;
  .prompt // empty | strings | strip_ide | gsub("^\\s+|\\s+$"; "")' <<<"$input" 2>/dev/null) || exit 0

if [[ "$prompt" =~ ^/(impl|local-review|verify)\ #?([0-9]+)$ ]]; then
  case "${BASH_REMATCH[1]}" in
    impl) role=impl ;;
    local-review) role=review ;;
    verify) role=verify ;;
  esac
  name="$role-${BASH_REMATCH[2]}"
else
  exit 0
fi

current=$(jq -r '.session_title // empty | strings' <<<"$input" 2>/dev/null) || current=""
transcript=$(jq -r '.transcript_path // empty' <<<"$input" 2>/dev/null) || transcript=""
if [ -z "$current" ] && [ -n "$transcript" ] && [ -r "$transcript" ]; then
  # Anchored to the start of the line, the form Claude Code writes the record in, so a tool input
  # that merely contains the text cannot pose as the last name.
  current=$(grep '^{"type":"custom-title"' "$transcript" 2>/dev/null | tail -n 1 |
    jq -r '.customTitle // empty' 2>/dev/null) || current=""
fi

if [[ "$current" =~ ^(impl|review|verify)-[0-9]+$ ]] && [ "${BASH_REMATCH[1]}" != "$role" ]; then
  exit 0
fi

jq -n --arg name "$name" \
  '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", sessionTitle: $name}}'
