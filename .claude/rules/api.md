---
paths:
  - "src/api/**"
  - "supabase/functions/**"
---
- Every endpoint validates its input with zod before touching the database.
- Quota is taken as a hold before an upload URL is issued (see architecture.md §7). Never trust a client count.
- Entitlement is read from the server. The client never decides who is Pro.
- Errors return a typed shape: `{ code, message }`. Never leak a provider error verbatim.
- Any new endpoint must be added to the contract table in docs/architecture.md in the same change.
