#!/usr/bin/env node
import { createGrokSearchClient } from "./lib/search/client.mjs";
import { probeWebResearch } from "./lib/search/evidence.mjs";

function parseArguments(argv) {
  const queryParts = [];
  let depth = "quick";
  for (const value of argv) {
    if (value === "--deep") depth = "deep";
    else if (value === "--quick") depth = "quick";
    else queryParts.push(value);
  }
  return { query: queryParts.join(" ").trim(), depth };
}

const args = parseArguments(process.argv.slice(2));
if (!args.query) {
  console.error("Usage: web_research_probe.mjs [--quick|--deep] <search query>");
  process.exit(2);
}

probeWebResearch({ client: createGrokSearchClient(), queries: [args.query], depth: args.depth })
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(String(error?.message || error));
    process.exit(1);
  });
