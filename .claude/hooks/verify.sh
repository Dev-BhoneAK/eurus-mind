#!/bin/bash
# Stop hook: Claude can't finish a turn that leaves source changes failing typecheck. Exit 2 sends it back.
INPUT=$(cat)
# Already sent back once this turn: let it stop rather than loop.
[ "$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
jq -e '.scripts.typecheck' package.json >/dev/null 2>&1 || exit 0
[ -n "$(git status --porcelain -- src app supabase 2>/dev/null)" ] || exit 0

command -v npm >/dev/null 2>&1 || {
  echo "verify.sh: npm is not on PATH, so typecheck could not run. Tell the user; don't report the task as verified." >&2
  exit 2
}

OUT=$(npm run typecheck 2>&1) || {
  printf 'Typecheck failed. Fix before finishing:\n%s\n' "$(printf '%s' "$OUT" | tail -60)" >&2
  exit 2
}
exit 0
