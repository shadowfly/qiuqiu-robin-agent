import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { probeMoniDiscovery } from "../scripts/lib/moni/discovery.mjs";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/moni");

test("normalizes the project discovery feed and estimates returned-item cost", async () => {
  const data = JSON.parse(await readFile(resolve(FIXTURES, "projects.json"), "utf8"));
  const client = {
    request: async (name, endpoint, options) => ({
      ok: true,
      name,
      endpoint,
      estimatedPoints: options.estimatedPoints,
      attempts: 1,
      latencyMs: 4,
      cacheHit: false,
      data,
    }),
  };
  const output = await probeMoniDiscovery({
    client,
    feed: "projects",
    limit: 20,
    timeframe: "D30",
    chain: "robinhood",
  });

  assert.equal(output.coverage.status, "complete");
  assert.equal(output.items[0].username, "project_alpha");
  assert.deepEqual(output.items[0].chains, ["robinhood"]);
  assert.equal(output.provenance.estimatedPointsMaximum, 20);
  assert.equal(output.provenance.estimatedPointsBillable, 1);
});

test("keeps a discovery adapter failure as provider coverage", async () => {
  const client = {
    request: async () => {
      throw new Error("offline");
    },
  };
  const output = await probeMoniDiscovery({ client, feed: "events", limit: 5 });

  assert.equal(output.coverage.status, "adapter_error");
  assert.deepEqual(output.items, []);
  assert.equal(output.provenance.estimatedPointsBillable, 0);
});
