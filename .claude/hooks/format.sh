#!/bin/bash
# PostToolUse on Edit|Write: format the edited file with the project's own prettier.
# Does nothing until prettier is installed locally, so it never downloads a formatter from npm.
FILE=$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')
PRETTIER="${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin/prettier"
[ -n "$FILE" ] && [ -x "$PRETTIER" ] || exit 0
"$PRETTIER" --write --ignore-unknown "$FILE" >/dev/null 2>&1 || true
