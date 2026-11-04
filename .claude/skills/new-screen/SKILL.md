---
description: Build a screen from the design system. Use when adding or changing anything under app/ or src/features.
argument-hint: [screen-name]
allowed-tools: Read, Edit, Grep, Glob, Bash(npm run typecheck)
---

Build the screen: $ARGUMENTS

1. Read docs/design.md §6 (components) and §7 (screens). Tokens come from src/ui/theme.ts only.
2. List the five states first — loading, empty, error, offline, quota — and build them before the happy path.
3. Compose from existing components in src/ui. Create a new component only if it will be used twice.
4. No data fetching inside components: use the hooks in src/api.
5. Run typecheck, then confirm each of the five states renders.
