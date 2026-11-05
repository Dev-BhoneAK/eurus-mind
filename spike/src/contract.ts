import { z } from "zod";

// The fixed topic list. The model only guesses from these; users correct silently.
export const TAGS = ["money", "feelings", "work", "health", "ideas", "other"] as const;
export type Tag = (typeof TAGS)[number];

// V1 repeats only. Weekly and monthly are out of scope.
export const REPEATS = ["once", "daily", "yearly"] as const;

export const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// The model output contract from architecture §6. Tags stay plain strings so that an unknown
// tag gets dropped by the server rules instead of failing the whole entry.
export const EntryDraftSchema = z.strictObject({
  cleaned_text: z.string(),
  tags: z.array(z.string()),
  mood: z.number().int().min(1).max(5).nullable(),
  expenses: z.array(
    z.strictObject({
      amount: z.number().positive(),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .nullable(),
      label: z.string(),
    }),
  ),
  reminder: z
    .strictObject({
      title: z.string().min(1),
      fire_at_local: z.string().regex(LOCAL_DATE_TIME),
      repeat: z.enum(REPEATS),
      confidence: z.number().min(0).max(1),
    })
    .nullable(),
});
export type EntryDraft = z.infer<typeof EntryDraftSchema>;

// The same contract as JSON Schema, sent as response_format so decoding is constrained.
// Written by hand because Gemini accepts only a subset of JSON Schema (null via type arrays).
export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    cleaned_text: { type: "string", description: "What was said, cleaned, in the spoken language." },
    tags: {
      type: "array",
      items: { type: "string", enum: [...TAGS] },
      minItems: 1,
      maxItems: 3,
      description: "Most important topic first.",
    },
    mood: { type: ["integer", "null"], minimum: 1, maximum: 5 },
    expenses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          amount: { type: "number", minimum: 0 },
          currency: { type: ["string", "null"], description: "ISO 4217 code, only if spoken or clearly implied." },
          label: { type: "string" },
        },
        required: ["amount", "currency", "label"],
        additionalProperties: false,
      },
    },
    reminder: {
      type: ["object", "null"],
      properties: {
        title: { type: "string" },
        fire_at_local: { type: "string", description: "Local date and time, YYYY-MM-DDTHH:mm." },
        repeat: { type: "string", enum: [...REPEATS] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["title", "fire_at_local", "repeat", "confidence"],
      additionalProperties: false,
    },
  },
  required: ["cleaned_text", "tags", "mood", "expenses", "reminder"],
  additionalProperties: false,
} as const;
