#!/usr/bin/env node
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createMoniClient } from "./lib/moni/client.mjs";
import { MONI_MODES, MONI_TIMEFRAMES, probeMoniAccount, unavailableMoniEvidence } from "./lib/moni/evidence.mjs";
import { sanitizeExternalText, sanitizeXHandle } from "./lib/moni/normalize.mjs";
import { createGrokSearchClient } from "./lib/search/client.mjs";
import { probeWebResearch, unavailableWebResearch } from "./lib/search/evidence.mjs";
import { sanitizeSearchQuery } from "./lib/search/normalize.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CHAIN_PROBE_PATH = resolve(SCRIPT_DIR, "robinhood_ca_probe.mjs");

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));
}

export function selectXSubject(chainResult, explicitHandle = null) {
  const explicit = sanitizeXHandle(explicitHandle);
  const discovered = (chainResult?.untrustedEvidence?.socials || [])
    .map((social) => sanitizeXHandle(social?.xHandle))
    .filter(Boolean);
  const candidates = [...new Set(discovered)];
  if (explicit) {
    return { handle: explicit, source: "explicit_cli", candidates: [...new Set([explicit, ...candidates])] };
  }
  return { handle: candidates[0] || null, source: candidates.length ? "token_supplied_dex_profile" : null, candidates };
}

export function selectSearchQueries(chainResult, mode = "quick") {
  const limit = mode === "deep" ? 12 : 6;
  return [
    ...new Set(
      (chainResult?.narrativeSearch?.queries || []).map((query) => sanitizeSearchQuery(query)).filter(Boolean)
    ),
  ].slice(0, limit);
}

export function assembleResearchBundle({
  chainResult,
  chainProbeExitCode,
  chainProbeStderr,
  socialIntelligence,
  webResearch,
  identity,
}) {
  return {
    ca: chainResult?.ca || null,
    generatedAt: new Date().toISOString(),
    coverage: {
      onchain: chainResult?.completeness || "unknown",
      social: socialIntelligence?.coverage?.status || "unknown",
      web: webResearch?.coverage?.status || "unknown",
      note:
        "On-chain, Moni, and web-search coverage are independent. Provider failures must not change chain findings, and missing chain evidence cannot be repaired by popularity or search results.",
    },
    identityResolution: {
      selectedXHandle: identity.handle,
      selectedFrom: identity.source,
      candidateXHandles: identity.candidates,
      binding: "unverified",
      note:
        "The selected handle is only a lookup key. Verify that the website and X account explicitly recognize the CA before changing binding to verified.",
    },
    onchain: chainResult,
    socialIntelligence,
    webResearch,
    integration: {
      chainProbeExitCode,
      chainProbeStderr: sanitizeExternalText(chainProbeStderr, 500),
      socialFailureDoesNotChangeExitCode: true,
      webFailureDoesNotChangeExitCode: true,
    },
  };
}

export function runChainProbe(ca, { probePath = CHAIN_PROBE_PATH, timeoutMs = 120000 } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      process.execPath,
      [probePath, ca],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: timeoutMs },
      (error, stdout, stderr) => {
        let parsed;
        try {
          parsed = JSON.parse(stdout);
        } catch (parseError) {
          rejectPromise(
            new Error(
              "Chain probe did not return valid JSON: " +
                sanitizeExternalText(parseError?.message || parseError, 200) +
                (stderr ? " | " + sanitizeExternalText(stderr, 300) : "")
            )
          );
          return;
        }
        const exitCode = Number.isInteger(error?.code) ? error.code : 0;
        resolvePromise({ result: parsed, exitCode, stderr });
      }
    );
  });
}

export async function buildResearchBundle({
  ca,
  mode = "quick",
  timeframe = "D30",
  explicitHandle,
  client,
  searchClient,
  includeWebSearch,
  chainProbeRunner = runChainProbe,
}) {
  if (!isAddress(ca)) throw new TypeError("Invalid CA; expected 0x followed by 40 hexadecimal characters");
  if (!MONI_MODES.has(mode)) throw new TypeError("Invalid mode; expected quick or deep");
  if (!MONI_TIMEFRAMES.has(timeframe)) throw new TypeError("Invalid timeframe");
  if (explicitHandle !== null && explicitHandle !== undefined && !sanitizeXHandle(explicitHandle)) {
    throw new TypeError("Invalid explicit X handle");
  }

  const chainProbe = await chainProbeRunner(ca);
  const identity = selectXSubject(chainProbe.result, explicitHandle);
  const searchQueries = selectSearchQueries(chainProbe.result, mode);
  let socialIntelligence;
  if (!identity.handle) {
    socialIntelligence = unavailableMoniEvidence(
      null,
      "skipped_no_x_handle",
      "No valid X handle was discovered. Supply one with --x only after checking which account belongs to the project."
    );
  } else {
    try {
      socialIntelligence = await probeMoniAccount({
        client: client || createMoniClient(),
        handle: identity.handle,
        mode,
        timeframe,
      });
    } catch (error) {
      socialIntelligence = unavailableMoniEvidence(
        identity.handle,
        "failed_adapter",
        "Moni enrichment failed without changing the chain result: " + sanitizeExternalText(error?.message || error, 200)
      );
    }
  }

  const shouldSearch = includeWebSearch ?? mode === "deep";
  let webResearch;
  if (!shouldSearch) {
    webResearch = unavailableWebResearch(
      searchQueries,
      "skipped_mode",
      "Web research is disabled for this run. Use --search to enable it in quick mode.",
      false
    );
  } else if (!searchQueries.length) {
    webResearch = unavailableWebResearch([], "skipped_no_queries", "The chain probe generated no safe search queries.", false);
  } else {
    webResearch = await probeWebResearch({
      client: searchClient || createGrokSearchClient(),
      queries: searchQueries,
      depth: mode,
    });
  }

  return {
    output: assembleResearchBundle({
      chainResult: chainProbe.result,
      chainProbeExitCode: chainProbe.exitCode,
      chainProbeStderr: chainProbe.stderr,
      socialIntelligence,
      webResearch,
      identity,
    }),
    exitCode: chainProbe.exitCode,
  };
}

function parseArguments(argv) {
  const positional = [];
  let explicitHandle = null;
  let timeframe = "D30";
  let includeWebSearch = null;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--x") {
      explicitHandle = argv[index + 1];
      index += 1;
    } else if (value.startsWith("--x=")) {
      explicitHandle = value.slice(4);
    } else if (value === "--timeframe") {
      timeframe = argv[index + 1];
      index += 1;
    } else if (value.startsWith("--timeframe=")) {
      timeframe = value.slice(12);
    } else if (value === "--search") {
      includeWebSearch = true;
    } else if (value === "--no-search") {
      includeWebSearch = false;
    } else {
      positional.push(value);
    }
  }
  return { ca: positional[0], mode: positional[1] || "quick", explicitHandle, timeframe, includeWebSearch };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (
    !isAddress(args.ca) ||
    !MONI_MODES.has(args.mode) ||
    !MONI_TIMEFRAMES.has(args.timeframe) ||
    (args.explicitHandle !== null && !sanitizeXHandle(args.explicitHandle))
  ) {
    console.error(
      "Usage: robinhood_research_bundle.mjs <CA> [quick|deep] [--x <handle>] [--timeframe D30] [--search|--no-search]"
    );
    process.exit(2);
  }
  const { output, exitCode } = await buildResearchBundle(args);
  console.log(JSON.stringify(output, null, 2));
  process.exitCode = exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(String(error?.message || error));
    process.exit(1);
  });
}
