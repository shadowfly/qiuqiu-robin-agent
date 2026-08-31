import test from "node:test";
import assert from "node:assert/strict";
import { createGrokSearchClient, DEFAULT_GROK_SEARCH_MODEL } from "../scripts/lib/search/client.mjs";

const messages = [{ role: "user", content: "research this" }];

test("search client uses the configured Bearer key and default Grok model", async () => {
  let captured;
  const client = createGrokSearchClient({
    apiKey: "fixture-key",
    cache: null,
    fetchImpl: async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
    },
  });
  const result = await client.search(messages);

  assert.equal(result.ok, true);
  assert.equal(captured.options.headers.authorization, "Bearer fixture-key");
  assert.equal(captured.body.model, DEFAULT_GROK_SEARCH_MODEL);
  assert.equal(captured.url, "https://ai.taosu.xyz/v1/chat/completions");
  assert.equal(JSON.stringify(result).includes("fixture-key"), false);
});

test("search client does not issue a request without a key", async () => {
  let called = false;
  const client = createGrokSearchClient({
    apiKey: "",
    cache: null,
    fetchImpl: async () => {
      called = true;
    },
  });
  const result = await client.search(messages);

  assert.equal(called, false);
  assert.equal(result.errorKind, "missing_api_key");
});

test("search client classifies an unavailable model and redacts the key", async () => {
  const client = createGrokSearchClient({
    apiKey: "fixture-key",
    cache: null,
    maxRetries: 0,
    fetchImpl: async () => new Response("model missing for fixture-key", { status: 404 }),
  });
  const result = await client.search(messages);

  assert.equal(result.errorKind, "model_unavailable");
  assert.equal(result.error.includes("fixture-key"), false);
});
