import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { probeWebResearch } from "../scripts/lib/search/evidence.mjs";
import { normalizeGrokResponse } from "../scripts/lib/search/normalize.mjs";

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/search/grok-search.json");

test("normalizes a structured Grok answer with direct sources", async () => {
  const raw = JSON.parse(await readFile(FIXTURE, "utf8"));
  const normalized = normalizeGrokResponse(raw);

  assert.equal(normalized.sources.length, 1);
  assert.equal(normalized.sources[0].url, "https://docs.robinhood.com/crypto/robinhood-chain/");
  assert.equal(normalized.structured, true);
  assert.equal(normalized.usage.totalTokens, 200);
});

test("returns complete Grok evidence when an answer has sources", async () => {
  const raw = JSON.parse(await readFile(FIXTURE, "utf8"));
  const client = {
    model: "grok-chat-fast",
    search: async () => ({
      ok: true,
      model: "grok-chat-fast",
      attempts: 1,
      latencyMs: 10,
      cacheHit: false,
      statusCode: 200,
      data: raw,
    }),
  };
  const output = await probeWebResearch({ client, queries: ["Robinhood Chain docs"], depth: "quick" });

  assert.equal(output.coverage.status, "complete");
  assert.equal(output.fallback.required, false);
  assert.equal(output.sources.length, 1);
});

test("requests built-in Agent web search when Grok is unavailable", async () => {
  const client = {
    model: "grok-chat-fast",
    search: async () => ({
      ok: false,
      model: "grok-chat-fast",
      attempts: 1,
      latencyMs: 3,
      errorKind: "model_unavailable",
      error: "not found",
    }),
  };
  const output = await probeWebResearch({ client, queries: ["Robinhood Chain docs"], depth: "quick" });

  assert.equal(output.fallback.required, true);
  assert.equal(output.fallback.provider, "agent_builtin_web_search");
  assert.deepEqual(output.fallback.queries, ["Robinhood Chain docs"]);
});

test("rejects uncited model prose as unverifiable search", async () => {
  const client = {
    model: "grok-chat-fast",
    search: async () => ({
      ok: true,
      model: "grok-chat-fast",
      attempts: 1,
      latencyMs: 3,
      data: { choices: [{ message: { content: "I remember this project." } }] },
    }),
  };
  const output = await probeWebResearch({ client, queries: ["a project"], depth: "quick" });

  assert.equal(output.coverage.status, "no_verifiable_sources");
  assert.equal(output.fallback.required, true);
});
