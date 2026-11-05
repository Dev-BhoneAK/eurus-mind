import assert from "node:assert/strict";
import { test } from "node:test";
import { mimeTypeFor } from "../src/audio.ts";
import { buildContextText } from "../src/prompt.ts";
import { localNow } from "../src/time.ts";

test("local time is computed in the given timezone", () => {
  assert.deepEqual(localNow(new Date("2026-11-06T07:05:00Z"), "Asia/Bangkok"), {
    iso: "2026-11-06T14:05",
    weekday: "Friday",
  });
});

test("midnight is 00, not 24", () => {
  assert.equal(localNow(new Date("2026-11-05T17:00:00Z"), "Asia/Bangkok").iso, "2026-11-06T00:00");
});

test("an unknown timezone throws", () => {
  assert.throws(() => localNow(new Date(), "Mars/Base"), RangeError);
});

test("context gives the local time, weekday and optional hints", () => {
  const now = new Date("2026-11-06T07:05:00Z");
  assert.equal(
    buildContextText({ now, timezone: "Asia/Yangon" }),
    "Current local time: 2026-11-06T13:35, Friday.\nTimezone: Asia/Yangon.",
  );
  const withHints = buildContextText({ now, timezone: "Asia/Bangkok", languageHint: "my", keyterms: ["Ko Aung", "Mae Sot"] });
  assert.ok(withHints.includes("Expected language: my."));
  assert.ok(withHints.includes("Words that may come up: Ko Aung, Mae Sot."));
});

test("audio MIME types come from the extension, ignoring case", () => {
  assert.equal(mimeTypeFor("clips/Lunch.M4A"), "audio/m4a");
  assert.equal(mimeTypeFor("a.webm"), "audio/webm");
  assert.equal(mimeTypeFor("notes.txt"), undefined);
  assert.equal(mimeTypeFor("noextension"), undefined);
});
