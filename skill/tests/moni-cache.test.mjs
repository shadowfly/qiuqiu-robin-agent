import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createMoniCache } from "../scripts/lib/moni/cache.mjs";
import { createMoniClient } from "../scripts/lib/moni/client.mjs";

test("cache avoids a duplicate billable request within its TTL", async (context) => {
  const directory = await mkdtemp(resolve(tmpdir(), "moni-cache-test-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  let now = 1000;
  let fetchCalls = 0;
  const cache = createMoniCache({ directory, ttlMs: 1000, now: () => now });
  const client = createMoniClient({
    apiKey: "fixture-key",
    cache,
    now: () => now,
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ data: { id: 1 } }), { status: 200 });
    },
  });

  const first = await client.request("account", "accounts/alice/info/full/", { estimatedPoints: 8 });
  now = 1500;
  const second = await client.request("account", "accounts/alice/info/full/", { estimatedPoints: 8 });

  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(fetchCalls, 1);
});
