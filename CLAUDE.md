# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

This repo is **documents only** — a PRD, architecture spec, tech-stack list, and a design system, plus four rendered mockups in `design/`. There is no `package.json`, no `src/`, no `supabase/`. Nothing here currently builds, lints, or tests. `.claude/` holds only the security gate so far. Before writing any app code, scaffold per `docs/tech-stack.md` §2–4 (Expo app + Supabase project) and set up the rest of the `.claude/` workflow per `docs/ai-workflow.md` §2–6 (rules, hooks, agents, skills) — that doc contains copy-pasteable file contents for all of it.

The first thing to build, before any UI or database work, is the **Gemini spike**: record on a phone, upload the file, one Gemini call, print the JSON. See `docs/architecture.md` §6 and `docs/tech-stack.md` §9.

## What this is

Eurus Mind: voice-first daily record. Expo (React Native) + Supabase, Android first, PWA second. Press record, speak up to 60s, get back a transcript, 1–3 topic tags, extracted expenses, and a proposed reminder — all shown for confirmation before anything is saved or scheduled.

## Read before writing code

- `docs/prd.md` — users, principles, the topics-and-actions content model, V1 feature list, what's explicitly out of scope, definition of done
- `docs/architecture.md` — system diagram, stack decisions and why, API contract, SQL schema, AI pipeline contract, quota mechanics, billing/entitlement flow, migration path off Supabase
- `docs/tech-stack.md` — exact packages, Android manifest permissions, env vars, EAS commands, repo layout, build order
- `docs/design.md` — the "Lamplight" design system: colour tokens, type scale, component and screen specs. Wins on anything visual.
- `docs/ai-workflow.md` — the intended `.claude/` setup (rules, hooks, agents, skills, CI). Source of truth if `.claude/` ever drifts from what's described there.

## Non-negotiable architecture rules

These hold regardless of what's scaffolded yet:

1. The app never calls Supabase or an AI provider directly. Everything goes through a thin API layer (`src/api/` client-side, Supabase Edge Functions / later NestJS server-side).
2. No Supabase SDK import outside `src/api/`. No vendor key (Gemini, speech, Play) in any client bundle, including the web/PWA build.
3. Quota, entitlement and validation are enforced in endpoint code, not only in RLS policies. RLS is a second line of defence.
4. Database changes are plain SQL migrations in `supabase/migrations/`, one change per file, timestamp-prefixed. Never hand-edit the schema or an applied migration.
5. Platform-specific code (recorder, notifications, billing) lives behind a shared interface with `*.native.ts` / `*.web.ts` implementations. No `Platform.OS` branching inside features.
6. Styling comes from `src/ui/theme.ts` tokens (see `docs/design.md`). No hard-coded hex values.
7. Topics (money/feelings/work/health/ideas/other) are a fixed list, AI-guessed, silently correctable — wrong is a minor annoyance. Actions (expense, reminder) always require an explicit confirm step before saving — wrong is a trust-breaking bug. Never auto-schedule a reminder or auto-save an amount without the user seeing it first.
8. Reminders are scheduled **on-device** (`expo-notifications`/`expo-calendar`); the server stores them so they survive a reinstall but never delivers them.
9. The entitlement check (`pro` or not) is always server-side; the client never decides who is Pro, and checks `entitlement === 'pro'`, never a specific product id.

## Scope discipline

If a request isn't in the V1 feature list (`docs/prd.md` §6) or is explicitly listed out-of-scope (§10 — e.g. AI advice, free-typed tags, search, photo attachments, weekly/monthly reminder repeats, iOS native, Stripe on web), say so before building it. V1 only captures and files; anything that interprets the user's life is V2.

## Commands

None yet — see "Current state" above. Once the Expo app is scaffolded, the project is expected to use `npm run typecheck`, `npm run lint`, `npm test`, and `npx supabase db push` for migrations (ask before running the last one), per `docs/ai-workflow.md` §3–4. Update this section once a real `package.json` exists with its actual script names.

## Definition of done for any task

Match it against `docs/prd.md` §11. For code changes specifically: typecheck passes, lint passes, tests pass, and the command output is shown as evidence — don't report "done" without having run the commands.

## Security gate (before every commit)

- Before any `git commit`, stage the changes and run the `security-gate` skill. It reviews every uncommitted change (staged, unstaged, untracked) against OWASP Top 10:2025, the OWASP API/Mobile/LLM Top 10 lists, and the project's security rules, and records a pass only when no Critical or High finding remains.
- `.claude/hooks/security-gate.sh` (a PreToolUse hook) blocks `git commit` unless the recorded pass matches the exact current working-tree state. Any edit or `git add` after the pass needs a new review. Commit in its own command, not chained after edits.
- `.githooks/pre-commit` runs the same check on every commit, including ones made in a terminal or the IDE. It lets `git commit -a` and pathspec commits through only when every committed file matches what was reviewed. Enable it once per clone with `git config core.hooksPath .githooks`.
- Only the skill runs `security-gate.sh record`, as its final step after a genuine PASS. Never write the pass marker any other way.
- New security rules go in `.claude/skills/security-gate/SKILL.md` (project rules) or `checklist.md` (general checks).

## Style

- TypeScript strict, no `any`. Validate external input (API payloads, model output) with zod.
- Small files, one responsibility. Prefer pure functions for anything unit-testable.
- Comments explain why, not what.
