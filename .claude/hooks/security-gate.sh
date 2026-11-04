#!/bin/bash
# Pre-commit security gate.
#   security-gate.sh record       Record a pass for the current working-tree state. Run only by the
#                                 security-gate skill, as its last step, after a PASS verdict.
#   security-gate.sh pre-commit   Git pre-commit hook (.githooks/pre-commit). Blocks the commit if any
#                                 file it changes differs from what the recorded pass reviewed.
#   security-gate.sh              Claude Code PreToolUse hook (stdin = hook JSON). Blocks `git commit`
#                                 unless the recorded pass matches the current state exactly, and
#                                 blocks direct writes to the pass marker.
set -u

MARKER_NAME=security-gate-pass

# Fingerprint of everything a commit could include: the real index, plus the whole working tree
# (tracked and untracked, minus .gitignore) built in a throwaway index so the real one is untouched.
state() {
  local idx tmp wt=""
  idx=$(git write-tree 2>/dev/null) || return 1
  tmp=$(mktemp "${TMPDIR:-/tmp}/security-gate.XXXXXX") || return 1
  cp "$(git rev-parse --git-path index)" "$tmp" 2>/dev/null || rm -f "$tmp"
  if GIT_INDEX_FILE="$tmp" git add -A >/dev/null 2>&1; then
    wt=$(GIT_INDEX_FILE="$tmp" git write-tree 2>/dev/null)
  fi
  rm -f "$tmp"
  [ -n "$wt" ] || return 1
  echo "$idx $wt"
}

tree_exists() { [ -n "${1:-}" ] && git cat-file -e "$1^{tree}" 2>/dev/null; }
changed_paths() { git diff --no-renames --name-only "$1" "$2" | sort; }

if [ "${1:-}" = "record" ]; then
  git rev-parse --git-dir >/dev/null 2>&1 || { echo "security-gate: not a git repository" >&2; exit 1; }
  S=$(state) || { echo "security-gate: could not fingerprint the working tree (unresolved merge?)" >&2; exit 1; }
  printf '%s\n' "$S" > "$(git rev-parse --git-path "$MARKER_NAME")"
  echo "security-gate: pass recorded for the current changes. Any further edit or git add needs a new review."
  exit 0
fi

if [ "${1:-}" = "pre-commit" ]; then
  export LC_ALL=C
  COMMIT_TREE=$(git write-tree) || exit 1
  EMPTY_TREE=$(git hash-object -t tree /dev/null)
  HEAD_TREE=$(git rev-parse -q --verify 'HEAD^{tree}' 2>/dev/null || echo "$EMPTY_TREE")
  [ "$COMMIT_TREE" = "$HEAD_TREE" ] && exit 0

  REVIEWED_INDEX=""; REVIEWED_TREE=""
  MARKER=$(git rev-parse --git-path "$MARKER_NAME")
  [ -f "$MARKER" ] && read -r REVIEWED_INDEX REVIEWED_TREE < "$MARKER"

  if tree_exists "$REVIEWED_INDEX" && tree_exists "$REVIEWED_TREE"; then
    # A committed path counts as reviewed if it matches the reviewed index or the reviewed working tree.
    UNREVIEWED=$(comm -12 <(changed_paths "$HEAD_TREE" "$COMMIT_TREE") \
      <(comm -12 <(changed_paths "$COMMIT_TREE" "$REVIEWED_INDEX") <(changed_paths "$COMMIT_TREE" "$REVIEWED_TREE")))
    [ -z "$UNREVIEWED" ] && exit 0
  else
    UNREVIEWED=$(changed_paths "$HEAD_TREE" "$COMMIT_TREE")
  fi

  {
    echo "Blocked by the security gate: these changes have no passing security review:"
    printf '%s\n' "$UNREVIEWED" | head -20 | sed 's/^/  /'
    echo "Run /security-gate in Claude Code, then commit again."
  } >&2
  exit 1
fi

INPUT=$(cat)
if command -v jq >/dev/null 2>&1; then
  TARGET=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // .tool_input.file_path // empty')
else
  TARGET=$INPUT
fi

case "$TARGET" in
  *"$MARKER_NAME"*)
    echo "Blocked: the security-gate pass marker is written only by 'security-gate.sh record' at the end of a passing security-gate review." >&2
    exit 2 ;;
esac

# `git commit` anywhere in the command, including after global options such as `git -C dir commit`.
printf '%s\n' "$TARGET" \
  | grep -Eq '(^|[^[:alnum:]_.-])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+commit([[:space:]]|$)' \
  || exit 0

git rev-parse --git-dir >/dev/null 2>&1 || exit 0

S=$(state) || {
  echo "Blocked: the security gate could not fingerprint the working tree (unresolved merge?). Resolve it, then run the security-gate skill." >&2
  exit 2
}

EMPTY_TREE=$(git hash-object -t tree /dev/null)
HEAD_TREE=$(git rev-parse -q --verify 'HEAD^{tree}' 2>/dev/null || echo "$EMPTY_TREE")
[ "$S" = "$HEAD_TREE $HEAD_TREE" ] && exit 0

MARKER=$(git rev-parse --git-path "$MARKER_NAME")
[ -f "$MARKER" ] && [ "$(cat "$MARKER")" = "$S" ] && exit 0

cat >&2 <<'EOF'
Blocked by the security gate: there is no passing security review for the current changes.
Run the security-gate skill (/security-gate), fix every Critical or High finding, and commit only after it records a pass.
Any edit or `git add` after the pass needs a new review. Run the commit as its own command, not chained after edits.
EOF
exit 2
