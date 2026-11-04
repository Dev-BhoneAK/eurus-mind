---
description: Create a database migration safely. Use whenever the schema must change.
argument-hint: [change description]
disable-model-invocation: true
allowed-tools: Read, Grep, Bash(npx supabase migration new *), Bash(npx supabase db diff *)
---

Schema change: $ARGUMENTS

1. Restate the change and name every table and column affected. Wait for my confirmation.
2. Create the file with `npx supabase migration new <name>`.
3. Write the plain SQL in the chat. Edits under `supabase/migrations/` are denied on purpose, so I paste it into the new file. Additive only: new columns nullable, backfill in a second statement, tighten later.
4. Add or update the RLS policy for any new table. Owner-only.
5. Update the schema block in docs/architecture.md §5 in the same change.
6. Do not run `db push` — I run it after reviewing the file.
