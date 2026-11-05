import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PASS_MARK, SCORE_COLUMNS, parseCsv, scoreSheet } from "./scoresheet.ts";

// Usage: npm run score [-- path/to/score sheet.csv]   (default: the newest sheet in spike/out)
const outDir = resolve(import.meta.dirname, "..", "out");

async function newestSheet(): Promise<string | undefined> {
  const names = await readdir(outDir).catch(() => []);
  const sheets = names.filter((n) => n.startsWith("score-") && n.endsWith(".csv")).sort();
  const newest = sheets.at(-1);
  return newest ? join(outDir, newest) : undefined;
}

function percent(right: number, wrong: number): string {
  const total = right + wrong;
  return total === 0 ? "not marked" : `${((right / total) * 100).toFixed(1)}% (${right}/${total})`;
}

const path = process.argv[2] ?? (await newestSheet());
if (!path) {
  console.error("No score sheet found. Run npm run spike first, mark the sheet, then run this again.");
  process.exit(1);
}

const rows = parseCsv(await readFile(path, "utf8"));
const score = scoreSheet(rows);
const models = [...new Set(rows.slice(1).map((row) => row[1] ?? "").filter(Boolean))];

console.log(`${path}\n${score.clips} clip(s) · model ${models.join(", ") || "unknown"}\n`);
for (const column of SCORE_COLUMNS) {
  const { right, wrong } = score.columns[column];
  console.log(`${column.padEnd(14)} ${percent(right, wrong)}`);
}
console.log(`${"overall".padEnd(14)} ${percent(score.right, score.wrong)}`);

if (score.unmarked > 0) {
  console.log(`\n${score.unmarked} cell(s) not marked yet. Mark each with y or n, then run this again.`);
} else if (score.right + score.wrong > 0) {
  const passed = score.right / (score.right + score.wrong) > PASS_MARK;
  console.log(`\n${passed ? "PASSES" : "Does NOT pass"} the bar of more than ${PASS_MARK * 100}% correct.`);
}
