import type { EntryDraft } from "./contract.ts";

// One y/n mark per clip for each thing the user sees on the review screen.
export const SCORE_COLUMNS = ["transcript_ok", "tags_ok", "amounts_ok", "reminder_ok"] as const;
export const HEADER = ["clip", "model", "transcript", "tags", "amounts", "reminder", ...SCORE_COLUMNS, "comment"];

// The model is chosen by this bar: the cheaper model ships if it gets more than 90% right.
export const PASS_MARK = 0.9;

// "bad-answer": Gemini answered, but the answer was unusable, which counts against the model.
// "no-answer": the call never got an answer (busy, network, timeout), which says nothing about accuracy.
export type Failure = "bad-answer" | "no-answer";

export interface SheetEntry {
  clip: string;
  model: string;
  draft?: EntryDraft | undefined;
  tags?: readonly string[] | undefined;
  error?: string | undefined;
  failure?: Failure | undefined;
}

function describeAmounts(draft: EntryDraft): string {
  if (draft.expenses.length === 0) return "(none)";
  return draft.expenses.map((e) => `${e.amount} ${e.currency ?? "(no currency)"} ${e.label}`).join("; ");
}

function describeReminder(draft: EntryDraft): string {
  const r = draft.reminder;
  return r ? `${r.title} | ${r.fire_at_local} | ${r.repeat} | confidence ${r.confidence}` : "(none)";
}

export function sheetRow(entry: SheetEntry): string[] {
  const { clip, model, draft } = entry;
  const error = entry.error ?? "unknown error";
  if (!draft && entry.failure === "no-answer") {
    // Left unmarked so it isn't scored: re-run the clip once the provider recovers.
    return [clip, model, `NOT SCORED (no answer from Gemini), re-run this clip: ${error}`, "", "", "", "", "", "", "", ""];
  }
  // The model answered but got nothing usable right, so it is marked wrong up front.
  if (!draft) return [clip, model, `FAILED: ${error}`, "", "", "", "n", "n", "n", "n", ""];
  const tags = (entry.tags ?? draft.tags).join(", ");
  return [clip, model, draft.cleaned_text, tags, describeAmounts(draft), describeReminder(draft), "", "", "", "", ""];
}

// Transcripts come from speech, so a cell could start with "=" and run as a formula in a
// spreadsheet. A leading apostrophe keeps it as text.
function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

// Every field is quoted. The BOM makes Excel read the file as UTF-8, which Burmese needs.
export function toCsv(rows: readonly (readonly string[])[]): string {
  const lines = rows.map((row) => row.map((v) => `"${neutralizeFormula(v).replaceAll('"', '""')}"`).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.startsWith("﻿") ? text.slice(1) : text;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export type Mark = "right" | "wrong" | "unmarked";

export function readMark(value: string | undefined): Mark {
  const v = (value ?? "").trim().toLowerCase();
  if (["y", "yes", "1", "true", "✓", "✔"].includes(v)) return "right";
  if (["n", "no", "0", "false", "x", "✗", "✘"].includes(v)) return "wrong";
  return "unmarked";
}

export interface ColumnScore {
  right: number;
  wrong: number;
}

export interface SheetScore {
  clips: number;
  columns: Record<(typeof SCORE_COLUMNS)[number], ColumnScore>;
  right: number;
  wrong: number;
  unmarked: number;
}

export function scoreSheet(rows: readonly (readonly string[])[]): SheetScore {
  const [header = [], ...data] = rows;
  const clips = data.filter((row) => row.some((cell) => cell.trim() !== ""));
  const score: SheetScore = {
    clips: clips.length,
    columns: { transcript_ok: { right: 0, wrong: 0 }, tags_ok: { right: 0, wrong: 0 }, amounts_ok: { right: 0, wrong: 0 }, reminder_ok: { right: 0, wrong: 0 } },
    right: 0,
    wrong: 0,
    unmarked: 0,
  };
  for (const column of SCORE_COLUMNS) {
    const index = header.indexOf(column);
    if (index === -1) throw new Error(`the sheet has no "${column}" column`);
    for (const row of clips) {
      const mark = readMark(row[index]);
      if (mark === "unmarked") score.unmarked++;
      else {
        score.columns[column][mark]++;
        score[mark]++;
      }
    }
  }
  return score;
}
