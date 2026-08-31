#!/usr/bin/env node
import { createMoniClient } from "./lib/moni/client.mjs";
import { MONI_MODES, MONI_TIMEFRAMES, probeMoniAccount } from "./lib/moni/evidence.mjs";
import { sanitizeXHandle } from "./lib/moni/normalize.mjs";

const handle = sanitizeXHandle(process.argv[2]);
const mode = process.argv[3] || "quick";
const timeframe = process.argv[4] || "D30";

if (!handle || !MONI_MODES.has(mode) || !MONI_TIMEFRAMES.has(timeframe)) {
  console.error("Usage: moni_discover_probe.mjs <x_handle> [quick|deep] [H1|H24|D7|D30|D90|D180|Y1]");
  process.exit(2);
}

const client = createMoniClient();

probeMoniAccount({ client, handle, mode, timeframe })
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(String(error?.message || error));
    process.exit(1);
  });
