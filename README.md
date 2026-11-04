# Eurus Mind — project documents

Voice-first daily record. Expo (React Native) + Supabase, Android first, PWA second.

## What's here

| File                   | What it is                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/prd.md`          | Product spec: users, principles, the topics-and-actions model, V1 features, reminders, monetization, scope, definition of done, risks, launch plan |
| `docs/architecture.md` | System design: stack decisions, API contract, SQL data model, AI pipeline, quota, billing, reminders, security, cost model, migration path         |
| `docs/tech-stack.md`   | The build list: packages, Android config, Supabase setup, env vars, EAS commands, repo layout, build order                                         |
| `docs/design.md`       | The "Lamplight" design system: tokens, type scale, components, screen specs, states, accessibility, `theme.ts`                                     |
| `docs/ai-workflow.md`  | How Claude Code is configured in this repo: context, guardrails, subagents, skills, verification, CI, cost control                                 |
| `design/*.png`         | Rendered screens at 1080 × 2340 (phone) — Home, Timeline, Insights, and the theme sheet                                                            |

## Suggested repo layout

```
eurus-mind/
  CLAUDE.md                 ← create from docs/ai-workflow.md §3
  .claude/                  ← rules, settings, hooks, agents, skills (same file)
  .mcp.json
  docs/                     ← everything from this zip
  src/
  supabase/
```

## Where to start

1. Scaffold the Expo app, drop `docs/` in, commit.
2. Create the AI workflow files from `docs/ai-workflow.md`, commit those too.
3. Build the **Gemini spike** first: record on a phone, upload, one Gemini call, print the JSON. Nothing else until that works.
4. Then follow the build order in `docs/tech-stack.md` §9.

Two things to start in parallel, because they take calendar time: recruit 12 Play testers (14 continuous days of closed testing is required), and register the Play merchant account and run one test payout.

## Open decisions

Listed at the end of `docs/architecture.md`. The only one that blocks finishing V1 is the speech pipeline — Gemini single-call is the first try, measured against Chirp 3 Dynamic Batch and ElevenLabs Scribe on 50 real clips.
