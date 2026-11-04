# Security checklist

This checklist follows the OWASP Top 10:2025. Each heading also lists the matching items from other OWASP lists:

- **API**: OWASP API Security Top 10 (2023)
- **M**: OWASP Mobile Top 10 (2024)
- **LLM**: OWASP Top 10 for LLM Applications (2025)

Check every section the change touches.

## A01 Broken Access Control — API1, API3, API5, API7, M3

- Every endpoint takes the user from the verified JWT, never from a `user_id` in the body, query string or headers.
- Every read, update or delete by id also filters on `user_id = <JWT user>`. This is mandatory with the service-role client, which bypasses RLS.
- Update handlers whitelist the fields they accept, using zod `.strict()` or `.pick()`. A client can't set `user_id`, `status`, `source`, entitlement or `recordings_used`. (API3, mass assignment)
- Responses return only the fields the caller needs. Rows from `select('*')` or joins are never passed through unfiltered. (API3)
- Job-only operations can't be reached with a user JWT: the deletion job, the insights rollup and the daily quota reconcile. (API5)
- New tables enable RLS with owner-only policies for each command. No policy uses `using (true)`. Views use `security_invoker = true`.
- Storage object paths start with the user id, and policies check `(storage.foldername(name))[1] = auth.uid()::text`. Signed URLs are issued only after an ownership check.
- SSRF, which the 2025 list folds into A01 (API7): the server never fetches a URL supplied by the client. The audio URL passed to the transcription pipeline is built on the server from the stored `audio_path`.
- CORS: authenticated endpoints allowlist the PWA origins. A wildcard or reflected origin is never combined with credentials.
- OAuth and deep-link redirect targets come from an allowlist. A query parameter can't trigger an open redirect.

## A02 Security Misconfiguration — API8, M8

- No debug flags, verbose errors, or logging of request bodies in functions.
- `app.json` and config plugins request only the permissions in tech-stack §3. Any new exported Android component or intent filter is justified. `android.allowBackup` has been reviewed, because the local SQLite database holds diary content.
- `.env*` files are never committed. Dev and prod keys are never mixed.
- Changes to `supabase/config.toml` keep the auth redirect allowlist and `site_url` tight, and keep rate limits on anonymous sign-in.
- The web build is served over HTTPS only, with security headers: a CSP, `X-Content-Type-Options: nosniff`, a `Referrer-Policy`, and `frame-ancestors`.
- The `audio` bucket stays private.

## A03 Software Supply Chain Failures — M2, LLM03

- Each new dependency is the real package: check its spelling against the well-known name. It should be maintained and widely used, with no unexpected `postinstall` script. Expo modules are added with `npx expo install`.
- The lockfile is committed and changed only by npm. There are no unpinned `git+` or tarball dependencies.
- `npm audit --omit=dev --audit-level=high` is clean, or each remaining advisory is explained.
- GitHub Actions are pinned to a version or commit SHA. `pull_request_target` never runs untrusted code with secrets available.
- Provider SDKs and model ids are pinned. Moving "latest" aliases aren't used in production config.

## A04 Cryptographic Failures — M5, M10

- Traffic goes over TLS only: no `http://` endpoints, no disabled certificate validation, no cleartext-traffic exceptions.
- Ids and tokens come from `crypto.randomUUID()`, `expo-crypto` or Web Crypto, never `Math.random()`.
- The guest device hash is HMAC-SHA-256 or salted SHA-256 with a secret held on the server. It never uses MD5 or SHA-1 and never hashes an advertising id.
- There's no home-made crypto, and no hard-coded keys or IVs.

## A05 Injection — M4

- SQL uses only parameterized queries or the query builder. User input never goes into template-string SQL, and `execute format(...)` in SQL functions uses `%L` or `%I`.
- User input is never concatenated into PostgREST filter strings such as `.or()`, `.filter()` or `.textSearch()` without validation.
- No `eval`, `new Function`, or dynamic `import`/`require` of anything derived from input.
- On web, entry text never goes into `dangerouslySetInnerHTML`. HTML for exports is escaped.
- Functions never spawn processes with user input.
- Strings from users or the model are stripped of newlines and control characters before logging, if they're logged at all.

## A06 Insecure Design — API4, API6

- The quota hold is a single atomic statement taken before the upload URL is issued. There's no read-then-write race.
- Quota refunds are idempotent: one recording can never be refunded twice, even when retries pile up.
- Guest sign-up is rate-limited and bound to the device hash. The per-account monthly ceiling alerts when reached. (API6)
- The server enforces the maximum audio duration and byte size, page size on `/entries`, and the allowed range on `/insights`. (API4)
- Saving an entry and verifying a purchase are idempotent, so a retry never creates a duplicate.
- No reminder is ever scheduled without the user's explicit confirmation (PRD §7).

## A07 Authentication Failures — API2, M1, M3

- JWTs are fully verified (signature, expiry, audience, issuer) in one middleware. Decoding a token without verifying it is never enough.
- Linking an anonymous account to Google upgrades it in place. Linking can't attach an identity that already belongs to another account.
- Tokens are never stored in plaintext in AsyncStorage or SQLite, and never in `localStorage`, URLs or logs. Native protects them with secure store, either directly or as the key to an encrypted session. Web uses memory plus an HttpOnly refresh cookie.
- Logging out clears tokens and the cached entitlement. Deleting an account revokes its sessions.
- No credentials in code, `app.json` or `eas.json`. Build-time secrets live in EAS secrets. (M1)

## A08 Software or Data Integrity Failures

- Play purchase tokens are verified on the server with the Play Developer API and acknowledged. The client's receipt is never trusted on its own.
- `/webhooks/play` verifies the Pub/Sub push OIDC token (signature, audience and service-account email) and deduplicates on message id.
- All JSON from the model, providers, webhooks and the client is validated with zod before use.
- Values from the outbox sync are bounds-checked, including `occurred_at` and `duration_ms`. The server computes `status` and `lead_tag` itself.
- Production OTA updates should use EAS Update code signing. Not having it is Medium.

## A09 Security Logging & Alerting Failures

- These events are logged on the server, with no content attached: auth failures, quota denials (402), purchase-verification failures, webhook auth failures, and deletion requests.
- These are never logged: transcripts, entry text, amounts, reminder titles, audio paths, signed URLs, JWTs, purchase tokens, API keys.
- The change doesn't remove or weaken the alerts in architecture §13.

## A10 Mishandling of Exceptional Conditions

- Security checks fail closed. If an auth, quota or entitlement check throws or times out, the request is denied. It never defaults to allowed or to Pro.
- The client receives only `{ code, message }`, never a stack trace or a raw provider error.
- Partial failures are compensated:
  - On a processing failure, the quota unit is refunded exactly once.
  - A failed entry keeps its audio and is marked `failed` (architecture §6).
  - Deleting an entry cancels its notification before deleting the entry.
- Every external call has a timeout. A failure never leaves a quota hold dangling.
- No empty `catch` blocks on security paths.

## LLM-specific — OWASP Top 10 for LLM Applications (2025)

- **LLM01 Prompt injection.** The transcript is user-controlled. The prompt treats it as data, the response schema constrains the output, and nothing in the output can trigger a privileged action.
- **LLM02 Sensitive information disclosure.** Each call sends only the audio and the context it needs: timezone, language hint and keyterms. It never includes other users' data or secrets.
- **LLM05 Improper output handling.** The strict JSON contract is validated with zod, and the server-side rules in architecture §6 are applied.
- **LLM06 Excessive agency.** The model gets no tools or function calls that write data. The server decides every write.
- **LLM07 System prompt leakage.** Prompts contain no secrets or internal URLs.
- **LLM10 Unbounded consumption.** One model call per recording, with duration and size caps, bounded retries with backoff, and per-user ceilings.
- Provider plans don't train on inputs (architecture §10).

## Mobile-specific — OWASP Mobile Top 10 (2024)

- **M6 Inadequate privacy controls.** Permissions are requested just in time: the microphone on the first recording, `POST_NOTIFICATIONS` on the first confirmed reminder. Any new data collection comes with a privacy-policy update.
- **M7 Insufficient binary protections.** Anything compiled into the APK or JS bundle can be extracted, including every `EXPO_PUBLIC_*` value. No secret belongs there.
- **M8 Security misconfiguration.** Deep-link handlers validate their parameters. New URL schemes and intent filters are reviewed.
- **M9 Insecure data storage.** Audio is stored only in app-private storage (`FileSystem.documentDirectory`) and deleted with its entry. No tokens are kept in SQLite.
