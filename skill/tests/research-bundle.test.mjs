import test from "node:test";
import assert from "node:assert/strict";
import { assembleResearchBundle, buildResearchBundle, selectXSubject } from "../scripts/robinhood_research_bundle.mjs";

const chainResult = {
  ca: "0x1111111111111111111111111111111111111111",
  completeness: "complete",
  narrativeSearch: { queries: ['"0x1111111111111111111111111111111111111111"', '"first_handle" Robinhood Chain'] },
  untrustedEvidence: {
    socials: [
      { type: "twitter", xHandle: "first_handle" },
      { type: "twitter", xHandle: "second_handle" },
    ],
  },
};

test("selects an explicit handle without hiding token-supplied candidates", () => {
  const identity = selectXSubject(chainResult, "chosen_handle");

  assert.equal(identity.handle, "chosen_handle");
  assert.equal(identity.source, "explicit_cli");
  assert.deepEqual(identity.candidates, ["chosen_handle", "first_handle", "second_handle"]);
});

test("keeps on-chain and social coverage independent", () => {
  const identity = selectXSubject(chainResult);
  const output = assembleResearchBundle({
    chainResult,
    chainProbeExitCode: 0,
    chainProbeStderr: "",
    identity,
    socialIntelligence: { coverage: { status: "failed" } },
  });

  assert.equal(output.coverage.onchain, "complete");
  assert.equal(output.coverage.social, "failed");
  assert.equal(output.coverage.web, "unknown");
  assert.equal(output.identityResolution.binding, "unverified");
  assert.equal(output.integration.socialFailureDoesNotChangeExitCode, true);
});

test("builds an end-to-end bundle through injected adapters", async () => {
  const client = {
    request: async (name, endpoint, options) => ({
      ok: true,
      name,
      endpoint,
      estimatedPoints: options.estimatedPoints,
      attempts: 1,
      latencyMs: 2,
      cacheHit: false,
      data: { data: { username: "first_handle", moni_score: 50 } },
    }),
  };
  const result = await buildResearchBundle({
    ca: chainResult.ca,
    mode: "quick",
    client,
    chainProbeRunner: async () => ({ result: chainResult, exitCode: 0, stderr: "" }),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.output.identityResolution.selectedXHandle, "first_handle");
  assert.equal(result.output.socialIntelligence.account.moniScore, 50);
  assert.equal(result.output.coverage.onchain, "complete");
  assert.equal(result.output.webResearch.coverage.status, "skipped_mode");
});

test("deep bundles use Grok search by default", async () => {
  const client = {
    request: async (name, endpoint, options) => ({
      ok: true,
      name,
      endpoint,
      estimatedPoints: options.estimatedPoints,
      attempts: 1,
      latencyMs: 1,
      data: { data: { username: "first_handle" } },
    }),
  };
  const searchClient = {
    model: "grok-chat-fast",
    search: async () => ({
      ok: true,
      model: "grok-chat-fast",
      attempts: 1,
      latencyMs: 2,
      data: {
        choices: [
          {
            message: {
              content:
                '{"answer":"Evidence found.","sources":[{"url":"https://example.com/source","title":"Source"}],"queriesUsed":[]}',
            },
          },
        ],
      },
    }),
  };
  const result = await buildResearchBundle({
    ca: chainResult.ca,
    mode: "deep",
    client,
    searchClient,
    chainProbeRunner: async () => ({ result: chainResult, exitCode: 0, stderr: "" }),
  });

  assert.equal(result.output.coverage.web, "complete");
  assert.equal(result.output.webResearch.coverage.model, "grok-chat-fast");
  assert.equal(result.output.webResearch.fallback.required, false);
});
