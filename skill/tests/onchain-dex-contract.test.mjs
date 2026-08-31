import test from "node:test";
import assert from "node:assert/strict";
import { buildContractRisk } from "../scripts/lib/onchain/contract-risk.mjs";
import { aggregatePairs, createDexAnalyzer } from "../scripts/lib/onchain/dexscreener.mjs";
import { createSanitizer } from "../scripts/lib/onchain/sanitize.mjs";

const CA = "0x1111111111111111111111111111111111111111";

test("Dex analyzer removes anomalous pools before selecting the main pair", () => {
  const sanitizer = createSanitizer();
  const analyzer = createDexAnalyzer(sanitizer);
  const healthy = {
    chainId: "robinhood",
    pairAddress: "0x2222222222222222222222222222222222222222",
    baseToken: { address: CA, symbol: "GOOD" },
    quoteToken: { address: "0x3333333333333333333333333333333333333333" },
    priceUsd: "1",
    fdv: 1000,
    liquidity: { usd: 100 },
    volume: { h24: 20 },
    txns: { h24: { buys: 3, sells: 2 } },
    pairCreatedAt: 1000,
  };
  const broken = {
    ...healthy,
    pairAddress: "0x4444444444444444444444444444444444444444",
    priceUsd: "1000",
    fdv: null,
    liquidity: { usd: 999999 },
  };
  const crossChain = { ...healthy, chainId: "base", url: "https://dexscreener.com/base/example" };
  const result = analyzer.screenPairs([broken, healthy, crossChain], CA);

  assert.equal(result.mainPair.pairAddress, healthy.pairAddress);
  assert.equal(result.screening, "screened_outliers");
  assert.equal(result.anomalous[0].pairAddress, broken.pairAddress);
  assert.equal(result.crossChainPairs[0].chainId, "base");
  assert.deepEqual(aggregatePairs(result.healthy), {
    pairCount: 1,
    liquidityUsd: 100,
    volume24h: 20,
    txns24h: { buys: 3, sells: 2 },
    earliestPairCreatedAt: 1000,
    earliestPairCreatedAtIso: "1970-01-01T00:00:01.000Z",
  });
});

test("contract risk scans inherited sources and ignores comments", () => {
  const sanitizer = createSanitizer();
  const risk = buildContractRisk(
    {
      file_path: "Token.sol",
      source_code: "contract Token is Controls { /* function mint(address a) public {} */ }",
      additional_sources: [
        {
          file_path: "Controls.sol",
          source_code: "contract Controls { function pause() public onlyOwner {} }",
        },
      ],
    },
    sanitizer.sanitizeText
  );

  assert.equal(risk.scanStatus, "scanned");
  assert.deepEqual(risk.scanScope.scannedFiles, ["Token.sol", "Controls.sol"]);
  assert.equal(risk.keywordHits.mint.status, "absent");
  assert.equal(risk.keywordHits.owner_admin.status, "present");
  assert.equal(risk.keywordHits.pause.status, "present");
});
