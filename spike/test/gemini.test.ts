import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { RESPONSE_SCHEMA } from "../src/contract.ts";
import {
  ENDPOINT,
  GeminiError,
  RETRY_DELAYS_MS,
  buildRequestBody,
  callGemini,
  callGeminiWithRetry,
  type GeminiCall,
} from "../src/gemini.ts";

const KEY = "test-key-not-real-000000";
const CALL: GeminiCall = {
  model: "gemini-test",
  audio: Buffer.from("fake audio"),
  mimeType: "audio/m4a",
  context: { now: new Date("2026-11-06T07:05:00Z"), timezone: "Asia/Bangkok" },
};

afterEach(() => mock.restoreAll());

function respondWith(status: number, body: unknown) {
  return mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(body), { status }));
}

test("the request sends audio first, constrains JSON output, and opts out of storage", () => {
  const body = buildRequestBody(CALL);
  assert.equal(body.model, "gemini-test");
  assert.equal(body.store, false);
  assert.deepEqual(body.response_format, { type: "text", mime_type: "application/json", schema: RESPONSE_SCHEMA });
  const input = body.input as Array<Record<string, unknown>>;
  assert.deepEqual(input[0], { type: "audio", data: Buffer.from("fake audio").toString("base64"), mime_type: "audio/m4a" });
  assert.equal(input[1]?.type, "text");
  assert.ok(String(input[1]?.text).startsWith("Current local time: 2026-11-06T14:05, Friday."));
  assert.equal("generation_config" in body, false);
  assert.deepEqual(buildRequestBody({ ...CALL, thinkingLevel: "low" }).generation_config, { thinking_level: "low" });
});

test("the API key goes only in the header", async () => {
  const fetchMock = respondWith(200, { steps: [{ type: "model_output", content: [{ type: "text", text: "{}" }] }] });
  await callGemini(KEY, CALL);
  const [url, init] = fetchMock.mock.calls[0]?.arguments ?? [];
  assert.equal(url, ENDPOINT);
  assert.equal((init?.headers as Record<string, string>)["x-goog-api-key"], KEY);
  assert.ok(!String(url).includes(KEY));
  assert.ok(!String(init?.body).includes(KEY));
});

test("text and token counts are read from the model_output step", async () => {
  respondWith(200, {
    status: "completed",
    steps: [
      { type: "thought", content: [{ type: "text", text: "ignored" }] },
      { type: "model_output", content: [{ type: "text", text: '{"a":' }, { type: "text", text: "1}" }] },
    ],
    usage: {
      total_input_tokens: 1400,
      total_output_tokens: 120,
      total_thought_tokens: 30,
      input_tokens_by_modality: [
        { modality: "text", tokens: 600 },
        { modality: "audio", tokens: 800 },
      ],
    },
  });
  assert.deepEqual(await callGemini(KEY, CALL), {
    text: '{"a":1}',
    usage: { input: 1400, output: 120, thought: 30, audio: 800 },
  });
});

test("an HTTP error becomes a GeminiError with the provider message", async () => {
  respondWith(400, { error: { code: 400, message: "Unsupported MIME type: audio/m4a", status: "INVALID_ARGUMENT" } });
  await assert.rejects(callGemini(KEY, CALL), (error: unknown) => {
    assert.ok(error instanceof GeminiError);
    assert.equal(error.httpStatus, 400);
    assert.equal(error.message, "HTTP 400: Unsupported MIME type: audio/m4a");
    return true;
  });
});

const OK_BODY = { steps: [{ type: "model_output", content: [{ type: "text", text: "{}" }] }] };

function respondInTurn(...replies: Array<[number, unknown]>) {
  let call = 0;
  return mock.method(globalThis, "fetch", async () => {
    const [status, body] = replies[Math.min(call++, replies.length - 1)] ?? [500, {}];
    return new Response(JSON.stringify(body), { status });
  });
}

test("a busy provider is retried with backoff, then succeeds", async () => {
  const fetchMock = respondInTurn([503, { error: { message: "busy" } }], [429, { error: { message: "slow down" } }], [200, OK_BODY]);
  const waits: number[] = [];
  const result = await callGeminiWithRetry(KEY, CALL, async (ms) => void waits.push(ms));
  assert.equal(result.attempts, 3);
  assert.deepEqual(waits, [...RETRY_DELAYS_MS]);
  assert.equal(fetchMock.mock.callCount(), 3);
});

test("retries stop after the last delay and say how many attempts were made", async () => {
  const fetchMock = respondInTurn([503, { error: { message: "busy" } }]);
  await assert.rejects(callGeminiWithRetry(KEY, CALL, async () => {}), /HTTP 503: busy \(after 3 attempts\)/);
  assert.equal(fetchMock.mock.callCount(), 3);
});

test("a bad request is not retried", async () => {
  const fetchMock = respondInTurn([400, { error: { message: "API key not valid" } }]);
  await assert.rejects(callGeminiWithRetry(KEY, CALL, async () => {}), /^GeminiError: HTTP 400: API key not valid$/);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("a response with no model text names the keys it did have", async () => {
  respondWith(200, { status: "failed", outputs: [] });
  await assert.rejects(callGemini(KEY, CALL), /no text in the response \(status failed, keys: status, outputs\)/);
});
