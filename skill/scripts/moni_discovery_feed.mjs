#!/usr/bin/env node
import { createMoniClient } from "./lib/moni/client.mjs";
import {
  MONI_DISCOVERY_FEEDS,
  MONI_DISCOVERY_TIMEFRAMES,
  probeMoniDiscovery,
} from "./lib/moni/discovery.mjs";

function parseArguments(argv) {
  const feed = argv[0];
  let limit = 20;
  let timeframe = "D30";
  let chain = null;
  let search = null;
  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];
    if (value === "--limit") {
      limit = Number(next);
      index += 1;
    } else if (value.startsWith("--limit=")) limit = Number(value.slice(8));
    else if (value === "--timeframe") {
      timeframe = next;
      index += 1;
    } else if (value.startsWith("--timeframe=")) timeframe = value.slice(12);
    else if (value === "--chain") {
      chain = next;
      index += 1;
    } else if (value.startsWith("--chain=")) chain = value.slice(8);
    else if (value === "--search") {
      search = next;
      index += 1;
    } else if (value.startsWith("--search=")) search = value.slice(9);
    else return null;
  }
  return { feed, limit, timeframe, chain, search };
}

const args = parseArguments(process.argv.slice(2));
if (
  !args ||
  !MONI_DISCOVERY_FEEDS.has(args.feed) ||
  !MONI_DISCOVERY_TIMEFRAMES.has(args.timeframe) ||
  !Number.isInteger(args.limit) ||
  args.limit < 1 ||
  args.limit > 100
) {
  console.error(
    "Usage: moni_discovery_feed.mjs <projects|events|smart-mentions> [--limit 20] [--timeframe D30] [--chain <slug>] [--search <text>]"
  );
  process.exit(2);
}

probeMoniDiscovery({ client: createMoniClient(), ...args })
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(String(error?.message || error));
    process.exit(1);
  });
