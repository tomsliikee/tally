#!/usr/bin/env bash
# Links the extension into GNOME Shell for the current user and enables it.
# Run it again after moving the repository; updating is a plain "git pull".
set -euo pipefail

UUID="tally@thomashaiden"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"
FONT_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/fonts"
FONT="$REPO/toms-expressive-design/fonts/GoogleSansFlex.woff2"

command -v gjs >/dev/null || { echo "gjs is missing; it ships with GNOME Shell." >&2; exit 1; }

if [ -e "$TARGET" ] && [ ! -L "$TARGET" ]; then
    echo "$TARGET exists and is not a link. Move it away first." >&2
    exit 1
fi
mkdir -p "$(dirname "$TARGET")"
ln -sfn "$REPO/extension" "$TARGET"
echo "Linked $TARGET"

if ! fc-list : family | grep -q "Google Sans Flex"; then
    mkdir -p "$FONT_DIR"
    cp "$FONT" "$FONT_DIR/"
    fc-cache -f "$FONT_DIR"
    echo "Installed Google Sans Flex to $FONT_DIR"
fi
# The bundled web font carries no variable axes for fontconfig, so the wide
# and rounded cuts need the variable TTF from Google Fonts.
if ! fc-list : family variable | grep "Google Sans Flex" | grep -q "variable=True"; then
    echo "Note: for the design's wide, rounded type, install the variable"
    echo "      Google Sans Flex TTF from fonts.google.com into $FONT_DIR."
fi

# Claude Code's status line gets the plan limits after every answer in a
# terminal session; recording them there costs nothing. The command is only
# extended, and only after asking.
SETTINGS="$HOME/.claude/settings.json"
RECORD='echo "$input" | "$HOME/.local/share/gnome-shell/extensions/'"$UUID"'/record-limits.sh";'
if [ -f "$SETTINGS" ] && command -v jq >/dev/null && ! grep -q "record-limits.sh" "$SETTINGS"; then
    read -r -p "Record the limits from Claude Code's status line in $SETTINGS? [y/N] " answer
    if [[ "$answer" == [yY]* ]]; then
        cp "$SETTINGS" "$SETTINGS.before-tally"
        tmp="$(mktemp)"
        # An existing command keeps running unchanged, fed the same input.
        jq --arg record "$RECORD" '
            (.statusLine.command // "") as $old
            | .statusLine.type = "command"
            | .statusLine.command =
                if $old == "" then "input=$(cat); " + $record
                elif $old | startswith("input=$(cat);") then "input=$(cat); " + $record + ($old | ltrimstr("input=$(cat);"))
                else "input=$(cat); " + $record + " echo \"$input\" | { " + $old + "; }"
                end
        ' "$SETTINGS" > "$tmp" && mv "$tmp" "$SETTINGS"
        echo "Status line extended; the previous settings are in $SETTINGS.before-tally"
    fi
fi

# Written to the setting directly: the running shell only learns about a new
# extension at the next login, and "gnome-extensions enable" fails until then.
enabled="$(gsettings get org.gnome.shell enabled-extensions)"
if [[ "$enabled" != *"'$UUID'"* ]]; then
    if [[ "$enabled" == "@as []" || "$enabled" == "[]" ]]; then
        gsettings set org.gnome.shell enabled-extensions "['$UUID']"
    else
        gsettings set org.gnome.shell enabled-extensions "${enabled%]}, '$UUID']"
    fi
fi
echo "Enabled. Log out and back in to load it."
