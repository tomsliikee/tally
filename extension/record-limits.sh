#!/usr/bin/env bash
# Called from Claude Code's status line command with the status line JSON on
# stdin. Records the plan limits it carries, for the extension to read.
# Prints nothing and never fails, so the status line itself is not disturbed.

dir="${XDG_CACHE_HOME:-$HOME/.cache}/tally"
file="$dir/statusline.json"

mkdir -p "$dir" 2>/dev/null || exit 0
# Sessions without limits (before the first answer, or without a subscription)
# must not erase what an earlier one reported.
record="$(jq -c 'select(.rate_limits | type == "object") | {at: (now * 1000 | floor), rate_limits}' 2>/dev/null)"
[ -n "$record" ] || exit 0
# Written beside the target and moved, so a reader never sees half a file.
tmp="$(mktemp "$dir/.statusline.XXXXXX" 2>/dev/null)" || exit 0
printf '%s\n' "$record" > "$tmp" && mv -f "$tmp" "$file" 2>/dev/null || rm -f "$tmp"
exit 0
