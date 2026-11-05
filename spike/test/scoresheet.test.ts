import assert from "node:assert/strict";
import { test } from "node:test";
import type { EntryDraft } from "../src/contract.ts";
import { HEADER, parseCsv, readMark, scoreSheet, sheetRow, toCsv } from "../src/scoresheet.ts";

const DRAFT: EntryDraft = {
  cleaned_text: 'ဒီနေ့ ထမင်းစား ၆၀ ဘတ် ကုန်တယ်။ He said "ok", then left.',
  tags: ["money", "travel"],
  mood: 3,
  expenses: [{ amount: 60, currency: "THB", label: "ထမင်း" }],
  reminder: { title: "Take medicine", fire_at_local: "2026-11-07T08:00", repeat: "daily", confidence: 0.9 },
};

test("a row shows what the review screen would show, with blank marks", () => {
  assert.deepEqual(sheetRow({ clip: "a.m4a", model: "m", draft: DRAFT, tags: ["money"] }), [
    "a.m4a",
    "m",
    DRAFT.cleaned_text,
    "money",
    "60 THB ထမင်း",
    "Take medicine | 2026-11-07T08:00 | daily | confidence 0.9",
    "",
    "",
    "",
    "",
    "",
  ]);
});

test("a bad answer is marked wrong on every count", () => {
  const row = sheetRow({ clip: "b.m4a", model: "m", error: "not JSON", failure: "bad-answer" });
  assert.equal(row[2], "FAILED: not JSON");
  assert.deepEqual(row.slice(6, 10), ["n", "n", "n", "n"]);
});

test("no answer from Gemini is left unscored, so a busy provider doesn't count as wrong", () => {
  const row = sheetRow({ clip: "c.m4a", model: "m", error: "HTTP 503: busy", failure: "no-answer" });
  assert.ok(row[2]?.startsWith("NOT SCORED"));
  assert.deepEqual(row.slice(6, 10), ["", "", "", ""]);
});

test("CSV round-trips Burmese, quotes, commas and newlines", () => {
  const rows = [HEADER, ["a.m4a", "m", 'line one, "two"\nline three', "money", "(none)", "(none)", "y", "n", "y", "y", ""]];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
  assert.deepEqual(parseCsv(toCsv([[DRAFT.cleaned_text]])), [[DRAFT.cleaned_text]]);
});

test("cells that a spreadsheet would run as formulas are kept as text", () => {
  assert.deepEqual(parseCsv(toCsv([["=HYPERLINK(\"x\")", "+1", "-2", "@a", "fine"]])), [
    ["'=HYPERLINK(\"x\")", "'+1", "'-2", "'@a", "fine"],
  ]);
});

test("a sheet saved by a spreadsheet app, without quotes or BOM, still parses", () => {
  assert.deepEqual(parseCsv("clip,tags_ok\na.m4a,y\nb.m4a,n"), [
    ["clip", "tags_ok"],
    ["a.m4a", "y"],
    ["b.m4a", "n"],
  ]);
});

test("marks accept y/n and common variants; anything else is unmarked", () => {
  assert.equal(readMark(" Yes "), "right");
  assert.equal(readMark("✓"), "right");
  assert.equal(readMark("N"), "wrong");
  assert.equal(readMark("x"), "wrong");
  assert.equal(readMark(""), "unmarked");
  assert.equal(readMark("maybe"), "unmarked");
});

test("the score counts right and wrong marks per column and overall", () => {
  const blank = ["c", "m", "t", "g", "a", "r"];
  const score = scoreSheet([
    HEADER,
    [...blank, "y", "y", "y", "y", ""],
    [...blank, "y", "n", "y", "", ""],
    ["", "", "", "", "", "", "", "", "", "", ""],
  ]);
  assert.equal(score.clips, 2);
  assert.deepEqual(score.columns.tags_ok, { right: 1, wrong: 1 });
  assert.equal(score.right, 6);
  assert.equal(score.wrong, 1);
  assert.equal(score.unmarked, 1);
});

test("a sheet without the score columns is rejected", () => {
  assert.throws(() => scoreSheet([["clip", "model"]]), /no "transcript_ok" column/);
});
