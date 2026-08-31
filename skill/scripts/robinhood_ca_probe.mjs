#!/usr/bin/env node
import { isAddress } from "./lib/onchain/evm.mjs";
import { probeRobinhoodCa } from "./lib/onchain/probe.mjs";

const ca = (process.argv[2] || "").trim();

if (!isAddress(ca)) {
  console.error("Usage: robinhood_ca_probe.mjs <0x...40 hex CA>");
  process.exit(2);
}

probeRobinhoodCa(ca)
  .then((output) => {
    console.log(JSON.stringify(output, null, 2));
    if (output.completeness === "failed") {
      console.error(
        "All data sources failed (" +
          output.failedSources.length +
          "/" +
          Object.keys(output.sources).length +
          "). Probe output carries no evidence."
      );
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
