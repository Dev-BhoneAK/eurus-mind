import { TAGS, type EntryDraft, type Tag } from "./contract.ts";
import { localNow } from "./time.ts";

export const MAX_TAGS = 3;
export const LOW_CONFIDENCE = 0.6;

function isTag(value: string): value is Tag {
  return (TAGS as readonly string[]).includes(value);
}

export interface NormalizedTags {
  tags: Tag[];
  dropped: string[];
  truncated: boolean;
  fellBack: boolean;
}

// Server rules 1–2: unknown tags are dropped, at most three are kept, and an empty result means "other".
export function normalizeTags(raw: readonly string[]): NormalizedTags {
  const tags: Tag[] = [];
  const dropped: string[] = [];
  for (const value of raw) {
    const tag = value.trim().toLowerCase();
    if (!isTag(tag)) dropped.push(value);
    else if (!tags.includes(tag)) tags.push(tag);
  }
  const truncated = tags.length > MAX_TAGS;
  const fellBack = tags.length === 0;
  return { tags: fellBack ? ["other"] : tags.slice(0, MAX_TAGS), dropped, truncated, fellBack };
}

export interface RuleReview {
  tags: Tag[];
  leadTag: Tag;
  notes: string[];
}

// Applies the architecture §6 server rules and says, in plain words, what the server would change or flag.
export function reviewDraft(draft: EntryDraft, ctx: { now: Date; timezone: string }): RuleReview {
  const notes: string[] = [];
  const { tags, dropped, truncated, fellBack } = normalizeTags(draft.tags);
  if (dropped.length > 0) notes.push(`unknown tags dropped: ${dropped.join(", ")}`);
  if (truncated) notes.push(`more than ${MAX_TAGS} tags; extra ones dropped`);
  if (fellBack) notes.push('no valid tag; fell back to "other"');

  for (const expense of draft.expenses) {
    if (expense.currency === null) {
      notes.push(`expense "${expense.label}" has no currency; the default currency applies and is flagged on review`);
    }
  }

  const reminder = draft.reminder;
  if (reminder) {
    const now = localNow(ctx.now, ctx.timezone).iso;
    // Same fixed-width format on both sides, so string order is time order.
    if (reminder.fire_at_local <= now) {
      notes.push(`reminder time ${reminder.fire_at_local} is not in the future (now ${now}); the server would reject it`);
    }
    if (reminder.confidence < LOW_CONFIDENCE) {
      notes.push(`reminder confidence ${reminder.confidence} is below ${LOW_CONFIDENCE}; the confirm card opens on the time picker`);
    }
  }

  return { tags, leadTag: tags[0] ?? "other", notes };
}
