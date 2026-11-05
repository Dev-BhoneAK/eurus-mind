import assert from "node:assert/strict";
import { test } from "node:test";
import type { EntryDraft } from "../src/contract.ts";
import { normalizeTags, reviewDraft } from "../src/rules.ts";

const NOW = new Date("2026-11-06T07:05:00Z"); // 14:05 on a Friday in Bangkok
const CTX = { now: NOW, timezone: "Asia/Bangkok" };

function draft(overrides: Partial<EntryDraft> = {}): EntryDraft {
  return { cleaned_text: "text", tags: ["money"], mood: 3, expenses: [], reminder: null, ...overrides };
}

function reminder(fire_at_local: string, confidence = 0.9): EntryDraft["reminder"] {
  return { title: "Take medicine", fire_at_local, repeat: "daily", confidence };
}

test("unknown tags are dropped, case is ignored, duplicates are removed", () => {
  assert.deepEqual(normalizeTags(["Money", "travel", "money", "health"]), {
    tags: ["money", "health"],
    dropped: ["travel"],
    truncated: false,
    fellBack: false,
  });
});

test("only the first three tags are kept", () => {
  const result = normalizeTags(["work", "money", "health", "ideas"]);
  assert.deepEqual(result.tags, ["work", "money", "health"]);
  assert.equal(result.truncated, true);
});

test("no valid tag falls back to other", () => {
  assert.deepEqual(normalizeTags(["travel"]).tags, ["other"]);
  assert.equal(normalizeTags([]).fellBack, true);
});

test("the first kept tag is the lead tag", () => {
  assert.equal(reviewDraft(draft({ tags: ["travel", "health", "money"] }), CTX).leadTag, "health");
});

test("a clean draft has no notes", () => {
  assert.deepEqual(reviewDraft(draft(), CTX).notes, []);
});

test("a reminder at or before the local time now is flagged", () => {
  for (const time of ["2026-11-06T14:05", "2026-11-06T09:00", "2026-11-05T15:00"]) {
    const notes = reviewDraft(draft({ reminder: reminder(time) }), CTX).notes;
    assert.ok(notes.some((n) => n.includes("not in the future")), time);
  }
});

test("a reminder later today is not flagged", () => {
  assert.deepEqual(reviewDraft(draft({ reminder: reminder("2026-11-06T15:00") }), CTX).notes, []);
});

test("a low-confidence reminder is flagged for the time picker", () => {
  const notes = reviewDraft(draft({ reminder: reminder("2026-11-07T09:00", 0.4) }), CTX).notes;
  assert.ok(notes.some((n) => n.includes("time picker")));
});

test("an expense without a currency is flagged", () => {
  const notes = reviewDraft(draft({ expenses: [{ amount: 60, currency: null, label: "lunch" }] }), CTX).notes;
  assert.ok(notes.some((n) => n.includes('"lunch" has no currency')));
});
