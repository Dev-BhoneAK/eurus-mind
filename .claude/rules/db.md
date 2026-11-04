---
paths:
  - "supabase/migrations/**"
---
- One migration per change, plain SQL, named with a timestamp prefix. Never edit an applied migration.
- Every user table has row-level security enabled and an owner-only policy.
- Migrations must be backward compatible for one release: add columns nullable, backfill, then tighten.
- Destructive statements (drop, truncate, delete without where) require explicit confirmation in the chat first.
