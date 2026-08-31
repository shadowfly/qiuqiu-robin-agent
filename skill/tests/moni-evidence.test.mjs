import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { probeMoniAccount } from "../scripts/lib/moni/evidence.mjs";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/moni");
const fixture = async (name) => JSON.parse(await readFile(resolve(FIXTURES, name), "utf8"));

test("quick mode uses only the cohesive account endpoint", async () => {
  const calls = [];
  const account = await fixture("full-account.json");
  const client = {
    request: async (name, endpoint, options) => {
      calls.push({ name, endpoint, options });
      return { ok: true, name, endpoint, estimatedPoints: options.estimatedPoints, attempts: 1, latencyMs: 5, data: account };
    },
  };
  const output = await probeMoniAccount({ client, handle: "RobinResearch", mode: "quick", now: 0 });

  assert.equal(calls.length, 1);
  assert.equal(output.coverage.status, "complete");
  assert.equal(output.provenance.estimatedPointsRequested, 8);
  assert.equal(output.subject.identityBinding, "unverified");
});

test("deep mode requests five sources and preserves partial coverage", async () => {
  const fixtures = {
    fullAccount: await fixture("full-account.json"),
    mentionsHistory: await fixture("mentions-history.json"),
    smartMentionsHistory: await fixture("mentions-history.json"),
    smartMentionsFeed: await fixture("smart-mentions.json"),
    accountEvents: await fixture("events.json"),
  };
  const client = {
    request: async (name, endpoint, options) => {
      if (name === "accountEvents") {
        return {
          ok: false,
          name,
          endpoint,
          estimatedPoints: options.estimatedPoints,
          attempts: 1,
          latencyMs: 5,
          errorKind: "upstream_error",
          error: "temporary",
        };
      }
      return {
        ok: true,
        name,
        endpoint,
        estimatedPoints: options.estimatedPoints,
        attempts: 1,
        latencyMs: 5,
        data: fixtures[name],
      };
    },
  };
  const output = await probeMoniAccount({ client, handle: "RobinResearch", mode: "deep", now: 0 });

  assert.equal(output.coverage.status, "partial");
  assert.deepEqual(output.coverage.failedSources, ["accountEvents"]);
  assert.equal(output.provenance.estimatedPointsRequested, 21);
  assert.equal(output.provenance.estimatedPointsSucceeded, 18);
  assert.equal(output.evidence.smartMentions.length, 1);
});

test("an unexpected adapter exception becomes failed coverage", async () => {
  const client = {
    request: async () => {
      throw new Error("adapter exploded");
    },
  };
  const output = await probeMoniAccount({ client, handle: "RobinResearch", mode: "quick", now: 0 });

  assert.equal(output.coverage.status, "failed");
  assert.deepEqual(output.coverage.failedSources, ["fullAccount"]);
  assert.equal(output.coverage.sources.fullAccount.status, "adapter_error");
});
