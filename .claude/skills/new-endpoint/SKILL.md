---
description: Add an API endpoint end to end. Use when adding or changing anything under supabase/functions or src/api.
argument-hint: [endpoint-path]
allowed-tools: Read, Edit, Grep, Glob, Bash(npm run typecheck), Bash(npm test *)
---

Add the endpoint: $ARGUMENTS

Follow this order exactly:

1. Read the contract table in docs/architecture.md §4. If the endpoint is not listed, add the row first.
2. Write the zod schema for input and output in `src/api/schemas/`.
3. Write a failing test for the handler, including: unauthenticated, quota exhausted, and the happy path.
4. Implement the handler in `supabase/functions/`. Enforce auth, then quota, then validation, then work.
5. Add the typed client method in `src/api/`. Nothing else in the app may import the SDK.
6. Run `npm run typecheck` and `npm test` and paste the output.
7. Hand the diff to @agent-code-reviewer.
