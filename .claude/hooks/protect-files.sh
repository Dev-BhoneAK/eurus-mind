#!/bin/bash
# PreToolUse on Edit|Write: secrets, credentials, the lockfile and git internals are never edited by Claude.
INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')
# macOS filesystems are case-insensitive by default, so compare in lower case.
LOWER=$(printf '%s' "$FILE_PATH" | tr '[:upper:]' '[:lower:]')

PROTECTED=(".env" "google-services.json" "service-account" "package-lock.json" ".git/")

for p in "${PROTECTED[@]}"; do
  if [[ "$LOWER" == *"$p"* ]]; then
    echo "Blocked: $FILE_PATH matches protected pattern '$p'. Ask the human." >&2
    exit 2
  fi
done
exit 0
