import { z } from "zod";
import { RESPONSE_SCHEMA } from "./contract.ts";
import { SYSTEM_INSTRUCTION, buildContextText, type CallContext } from "./prompt.ts";

// Interactions API, the current Gemini surface. Output arrives in steps[] since the May 2026 revision.
export const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const TIMEOUT_MS = 90_000;

export interface GeminiCall {
  model: string;
  audio: Buffer;
  mimeType: string;
  context: CallContext;
  thinkingLevel?: string | undefined;
}

export interface GeminiUsage {
  input?: number | undefined;
  output?: number | undefined;
  thought?: number | undefined;
  audio?: number | undefined;
}

export interface GeminiResult {
  text: string;
  usage: GeminiUsage;
}

export class GeminiError extends Error {
  readonly httpStatus: number | undefined;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.name = "GeminiError";
    this.httpStatus = httpStatus;
  }
}

export function buildRequestBody(call: GeminiCall): Record<string, unknown> {
  return {
    model: call.model,
    system_instruction: SYSTEM_INSTRUCTION,
    input: [
      { type: "audio", data: call.audio.toString("base64"), mime_type: call.mimeType },
      { type: "text", text: buildContextText(call.context) },
    ],
    response_format: { type: "text", mime_type: "application/json", schema: RESPONSE_SCHEMA },
    // Diary audio is private: don't keep the interaction on Google's side for later retrieval.
    store: false,
    ...(call.thinkingLevel ? { generation_config: { thinking_level: call.thinkingLevel } } : {}),
  };
}

// Only the fields the spike reads. Unknown fields are ignored, because the provider adds them freely.
const InteractionSchema = z.object({
  status: z.string().optional(),
  steps: z
    .array(
      z.object({
        type: z.string(),
        content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
      }),
    )
    .optional(),
  usage: z
    .object({
      total_input_tokens: z.number().optional(),
      total_output_tokens: z.number().optional(),
      total_thought_tokens: z.number().optional(),
      input_tokens_by_modality: z.array(z.object({ modality: z.string(), tokens: z.number() })).optional(),
    })
    .optional(),
});

const ErrorBodySchema = z.object({ error: z.object({ message: z.string() }) });

function topLevelKeys(body: unknown): string {
  return body !== null && typeof body === "object" ? Object.keys(body).join(", ") : typeof body;
}

export async function callGemini(apiKey: string, call: GeminiCall): Promise<GeminiResult> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    // The key goes in a header, never the URL, so it can't leak through a logged URL.
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(buildRequestBody(call)),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const error = ErrorBodySchema.safeParse(body);
    const detail = error.success ? `: ${error.data.error.message.slice(0, 500)}` : "";
    throw new GeminiError(`HTTP ${response.status}${detail}`, response.status);
  }

  const parsed = InteractionSchema.safeParse(body);
  if (!parsed.success) {
    throw new GeminiError(`unexpected response shape (keys: ${topLevelKeys(body)}):\n${z.prettifyError(parsed.error)}`);
  }
  const { steps = [], status, usage } = parsed.data;
  const text = steps
    .filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
  if (!text) {
    throw new GeminiError(`no text in the response (status ${status ?? "unknown"}, keys: ${topLevelKeys(body)})`);
  }

  return {
    text,
    usage: {
      input: usage?.total_input_tokens,
      output: usage?.total_output_tokens,
      thought: usage?.total_thought_tokens,
      audio: usage?.input_tokens_by_modality?.find((m) => m.modality.toLowerCase() === "audio")?.tokens,
    },
  };
}

// Busy or briefly failing provider: worth another try. Anything else (bad request, bad key) is not.
const RETRYABLE_STATUS = new Set([429, 500, 503, 504]);
// Two retries at most, so a bad minute at the provider can't run up time or cost.
export const RETRY_DELAYS_MS = [2_000, 5_000] as const;

const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

export async function callGeminiWithRetry(
  apiKey: string,
  call: GeminiCall,
  sleep: (ms: number) => Promise<void> = wait,
): Promise<GeminiResult & { attempts: number }> {
  for (let attempt = 1; ; attempt++) {
    try {
      return { ...(await callGemini(apiKey, call)), attempts: attempt };
    } catch (error) {
      const retryable = error instanceof GeminiError && error.httpStatus !== undefined && RETRYABLE_STATUS.has(error.httpStatus);
      const delay = RETRY_DELAYS_MS[attempt - 1];
      if (!retryable || delay === undefined) {
        if (error instanceof GeminiError && attempt > 1) {
          throw new GeminiError(`${error.message} (after ${attempt} attempts)`, error.httpStatus);
        }
        throw error;
      }
      await sleep(delay);
    }
  }
}
