import { appendFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { MAX_AUDIO_BYTES, SUPPORTED_EXTENSIONS, mimeTypeFor } from "./audio.ts";
import { EntryDraftSchema, type EntryDraft } from "./contract.ts";
import { GeminiError, callGeminiWithRetry, type GeminiUsage } from "./gemini.ts";
import { reviewDraft } from "./rules.ts";
import { HEADER, sheetRow, toCsv, type Failure } from "./scoresheet.ts";
import { localNow } from "./time.ts";

// The cheapest stable model is the default: it ships if it gets 90%+ of clips right.
// A fixed model id, not a moving alias, so runs stay comparable.
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const SPIKE_DIR = resolve(import.meta.dirname, "..");

const HELP = `Usage: npm run spike -- [options] [clip or folder ...]

Sends each clip to Gemini once and prints the JSON. Default folder: spike/clips.

  --model <id>        model id (default ${DEFAULT_MODEL})
  --lang <code>       expected language, e.g. my or en
  --tz <zone>         IANA timezone (default: this computer's)
  --keyterms <list>   comma-separated words that may come up, such as names and places
  --thinking <level>  thinking level passed to Gemini, e.g. low
`;

interface Options {
  apiKey: string;
  model: string;
  timezone: string;
  languageHint: string | undefined;
  keyterms: string[];
  thinkingLevel: string | undefined;
}

interface ClipResult {
  clip: string;
  model: string;
  mime_type: string;
  bytes: number;
  ms?: number;
  attempts?: number;
  usage?: GeminiUsage;
  draft?: EntryDraft;
  tags?: string[];
  lead_tag?: string;
  notes?: string[];
  error?: string;
  failure?: Failure;
  raw?: string;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readOptions(): { options: Options; targets: string[] } {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        model: { type: "string", default: DEFAULT_MODEL },
        lang: { type: "string" },
        tz: { type: "string" },
        keyterms: { type: "string" },
        thinking: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    fail(`${error instanceof Error ? error.message : String(error)}\n\n${HELP}`);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    console.log(HELP);
    process.exit(0);
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    fail("GEMINI_API_KEY is not set. Create a file named .env in the project root containing the line GEMINI_API_KEY=<your key>.");
  }
  const timezone = values.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    localNow(new Date(), timezone);
  } catch {
    fail(`Unknown timezone: ${timezone}`);
  }

  return {
    options: {
      apiKey,
      model: values.model,
      timezone,
      languageHint: values.lang,
      keyterms: (values.keyterms ?? "").split(",").map((term) => term.trim()).filter(Boolean),
      thinkingLevel: values.thinking,
    },
    targets: positionals.length > 0 ? positionals : [join(SPIKE_DIR, "clips")],
  };
}

async function findClips(targets: readonly string[]): Promise<string[]> {
  const clips: string[] = [];
  for (const target of targets) {
    const info = await stat(target).catch(() => undefined);
    if (!info) console.warn(`not found: ${target}`);
    else if (info.isDirectory()) {
      for (const name of (await readdir(target)).sort()) {
        if (!name.startsWith(".") && mimeTypeFor(name)) clips.push(join(target, name));
      }
    } else if (mimeTypeFor(target)) clips.push(target);
    else console.warn(`skipping ${target}: not a supported audio format`);
  }
  return clips;
}

function describeError(error: unknown): string {
  if (error instanceof GeminiError) return error.message;
  if (error instanceof DOMException && error.name === "TimeoutError") return "timed out waiting for Gemini";
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` (${error.cause.message})` : "";
    return `${error.message}${cause}`;
  }
  return String(error);
}

async function processClip(path: string, options: Options): Promise<ClipResult> {
  const audio = await readFile(path);
  const mimeType = mimeTypeFor(path) ?? "application/octet-stream";
  const result: ClipResult = { clip: basename(path), model: options.model, mime_type: mimeType, bytes: audio.length };
  if (audio.length > MAX_AUDIO_BYTES) {
    const error = `file is over ${MAX_AUDIO_BYTES / 1024 / 1024} MB, too big to send inline`;
    return { ...result, error, failure: "no-answer" };
  }

  const now = new Date();
  const started = performance.now();
  const elapsed = (): number => Math.round(performance.now() - started);
  let text: string;
  try {
    const response = await callGeminiWithRetry(options.apiKey, {
      model: options.model,
      audio,
      mimeType,
      context: { now, timezone: options.timezone, languageHint: options.languageHint, keyterms: options.keyterms },
      thinkingLevel: options.thinkingLevel,
    });
    text = response.text;
    result.usage = response.usage;
    result.attempts = response.attempts;
  } catch (error) {
    // An HTTP error, timeout or network failure means no answer. A 200 with nothing usable is a bad answer.
    const answered = error instanceof GeminiError && error.httpStatus === undefined;
    return { ...result, ms: elapsed(), error: describeError(error), failure: answered ? "bad-answer" : "no-answer" };
  }
  result.ms = elapsed();

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ...result, error: "the model returned text that is not JSON", failure: "bad-answer", raw: text };
  }
  const draft = EntryDraftSchema.safeParse(json);
  if (!draft.success) {
    const error = `the output breaks the contract:\n${z.prettifyError(draft.error)}`;
    return { ...result, error, failure: "bad-answer", raw: text };
  }

  const review = reviewDraft(draft.data, { now, timezone: options.timezone });
  return { ...result, draft: draft.data, tags: review.tags, lead_tag: review.leadTag, notes: review.notes };
}

function printResult(r: ClipResult): void {
  console.log(`\n=== ${r.clip} (${r.mime_type}, ${Math.round(r.bytes / 1024)} KB) ===`);
  const facts = [r.model];
  if (r.ms !== undefined) facts.push(`${(r.ms / 1000).toFixed(1)} s round trip`);
  if (r.attempts !== undefined && r.attempts > 1) facts.push(`${r.attempts} attempts`);
  if (r.usage) {
    const { input, audio, output, thought } = r.usage;
    facts.push(`tokens in ${input ?? "?"} (audio ${audio ?? "?"}), out ${output ?? "?"}, thinking ${thought ?? 0}`);
  }
  console.log(facts.join(" · "));

  if (r.error) {
    console.log(`${r.failure === "no-answer" ? "NO ANSWER (not scored)" : "FAILED"}: ${r.error}`);
    if (r.raw !== undefined) console.log(`raw output:\n${r.raw}`);
    return;
  }
  console.log(JSON.stringify(r.draft, null, 2));
  console.log(`lead tag: ${r.lead_tag}`);
  for (const note of r.notes ?? []) console.log(`note: ${note}`);
}

function median(values: number[]): number | undefined {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return undefined;
  return sorted.length % 2 === 1 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

const { options, targets } = readOptions();
const clips = await findClips(targets);
if (clips.length === 0) {
  fail(`No audio clips found in ${targets.join(", ")}.\nSupported formats: ${SUPPORTED_EXTENSIONS.join(" ")}`);
}

// Results hold transcripts of real speech, so they go to spike/out/, which git ignores.
const outDir = join(SPIKE_DIR, "out");
await mkdir(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = join(outDir, `results-${stamp}.jsonl`);
const sheetFile = join(outDir, `score-${stamp}.csv`);
console.log(`${clips.length} clip(s) · model ${options.model} · timezone ${options.timezone}`);

const results: ClipResult[] = [];
for (const clip of clips) {
  const result = await processClip(clip, options);
  printResult(result);
  results.push(result);
  await appendFile(outFile, `${JSON.stringify(result)}\n`);
}

const passed = results.filter((r) => r.draft !== undefined);
const unanswered = results.filter((r) => r.failure === "no-answer").length;
const retried = results.filter((r) => (r.attempts ?? 1) > 1).length;
const typical = median(results.flatMap((r) => (r.ms === undefined || r.error ? [] : [r.ms])));
console.log(`\n${passed.length} of ${results.length} clip(s) gave valid JSON.`);
if (retried > 0) console.log(`${retried} clip(s) needed a retry because Gemini was busy or failing.`);
if (unanswered > 0) console.log(`${unanswered} clip(s) got no answer; they are not scored. Re-run them later.`);
if (typical !== undefined) console.log(`Median round trip: ${(typical / 1000).toFixed(1)} s (includes any retry waits).`);
await writeFile(sheetFile, toCsv([HEADER, ...results.map((r) => sheetRow(r))]));
console.log(`Results saved to ${outFile}`);
console.log(`Score sheet: ${sheetFile}`);
console.log("Mark each *_ok cell y or n, save it as CSV, then run: npm run score");
process.exitCode = passed.length === results.length ? 0 : 1;
