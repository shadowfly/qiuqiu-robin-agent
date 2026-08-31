import test from "node:test";
import assert from "node:assert/strict";
import { createMoniClient } from "../scripts/lib/moni/client.mjs";

test("client sends Api-Key and encodes query parameters", async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = createMoniClient({ apiKey: "fixture-key", fetchImpl, maxRetries: 0, now: () => 100, cache: null });
  const result = await client.request("history", "accounts/alice/history/mentions_count/", {
    query: { timeframe: "D30" },
    estimatedPoints: 2,
  });

  assert.equal(result.ok, true);
  assert.equal(captured.options.headers["Api-Key"], "fixture-key");
  assert.equal(captured.url.searchParams.get("timeframe"), "D30");
  assert.equal(JSON.stringify(result).includes("fixture-key"), false);
});

test("client fails closed without an API key and does not call fetch", async () => {
  let called = false;
  const client = createMoniClient({
    apiKey: "",
    fetchImpl: async () => {
      called = true;
    },
    cache: null,
  });
  const result = await client.request("fullAccount", "accounts/alice/info/full/", { estimatedPoints: 8 });

  assert.equal(called, false);
  assert.equal(result.errorKind, "missing_api_key");
  assert.equal(result.attempts, 0);
});

test("client retries rate limits once", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return new Response("slow down", { status: 429, headers: { "retry-after": "0" } });
    return new Response(JSON.stringify({ data: { id: 1 } }), { status: 200 });
  };
  const client = createMoniClient({ apiKey: "fixture-key", fetchImpl, maxRetries: 1, sleep: async () => {}, cache: null });
  const result = await client.request("fullAccount", "accounts/alice/info/full/", { estimatedPoints: 8 });

  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(calls, 2);
});

test("client classifies an unknown account", async () => {
  const client = createMoniClient({
    apiKey: "fixture-key",
    fetchImpl: async () => new Response("not found for fixture-key", { status: 404 }),
    maxRetries: 0,
    cache: null,
  });
  const result = await client.request("fullAccount", "accounts/missing/info/full/");

  assert.equal(result.ok, false);
  assert.equal(result.errorKind, "account_not_indexed");
  assert.equal(result.error.includes("fixture-key"), false);
});
