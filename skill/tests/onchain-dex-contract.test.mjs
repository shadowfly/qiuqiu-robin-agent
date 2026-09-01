import test from "node:test";
import assert from "node:assert/strict";
import { buildContractRisk, buildHookRisk } from "../scripts/lib/onchain/contract-risk.mjs";
import { CROSS_CHAIN_PAIRS_SHOWN, aggregatePairs, createDexAnalyzer, summarizeOrders } from "../scripts/lib/onchain/dexscreener.mjs";
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

test("contract risk reports an inheritance chain it stopped short of", () => {
  const sanitizer = createSanitizer();
  const chain = (name, base) => ({ file_path: `${name}.sol`, source_code: `contract ${name} is ${base} {}` });
  const risk = buildContractRisk(
    {
      file_path: "Token.sol",
      source_code: "contract Token is A {}",
      additional_sources: [chain("A", "B"), chain("B", "C"), chain("C", "D"), { file_path: "D.sol", source_code: "contract D { function mint(address a) public {} }" }],
    },
    sanitizer.sanitizeText
  );

  // D holds the mint, and D is past the depth cap. The scan must say so rather than
  // reporting mint as absent.
  assert.equal(risk.keywordHits.mint.status, "absent");
  assert.equal(risk.scanComplete, false);
  assert.equal(risk.scanScope.depthLimitReached, true);
  assert.deepEqual(risk.scanScope.inherits, ["A", "B", "C", "D"]);
  assert.deepEqual(risk.scanScope.unresolvedBases, ["D"]);
});

test("contract risk names the bases that shipped no source", () => {
  const sanitizer = createSanitizer();
  const risk = buildContractRisk(
    { file_path: "Token.sol", source_code: "contract Token is Ownable, Pausable {}", additional_sources: [] },
    sanitizer.sanitizeText
  );

  assert.deepEqual(risk.scanScope.basesNotInBundle, ["Ownable", "Pausable"]);
  assert.equal(risk.scanScope.depthLimitReached, false);
  assert.equal(risk.scanComplete, false);
});

test("a pool that declares no hook is a positive answer, not an unread one", () => {
  const sanitizer = createSanitizer();
  const none = buildHookRisk("0x0000000000000000000000000000000000000000", null, sanitizer.sanitizeText);
  assert.equal(none.scanStatus, "no_hook");
  assert.equal(none.address, "0x0000000000000000000000000000000000000000");

  const unread = buildHookRisk("0x5555555555555555555555555555555555555555", { is_verified: false }, sanitizer.sanitizeText);
  assert.equal(unread.scanStatus, "unknown_no_source");
});

test("Dex analyzer caps the cross-chain list and says it capped it", () => {
  const sanitizer = createSanitizer();
  const analyzer = createDexAnalyzer(sanitizer);
  const pairs = Array.from({ length: CROSS_CHAIN_PAIRS_SHOWN + 3 }, (unused, index) => ({
    chainId: `chain${index}`,
    baseToken: { address: CA },
    quoteToken: { address: "0x3333333333333333333333333333333333333333" },
  }));
  const result = analyzer.screenPairs(pairs, CA);

  assert.equal(result.crossChainPairs.length, CROSS_CHAIN_PAIRS_SHOWN);
  assert.equal(result.crossChainPairsTotal, CROSS_CHAIN_PAIRS_SHOWN + 3);
  assert.equal(result.crossChainPairsTruncated, true);
  assert.equal(result.screening, "no_base_side_pair");
});

test("a paid-orders response without an orders array is unknown, not unpaid", () => {
  const sanitizer = createSanitizer();
  const malformed = summarizeOrders({ boosts: ["x"] }, sanitizer);
  assert.equal(malformed.status, "unknown_malformed_response");
  assert.equal(malformed.tokenProfileApproved, null);
  assert.equal(malformed.orders, null);
  assert.match(malformed.note, /Unknown is not/);

  const empty = summarizeOrders({ orders: [] }, sanitizer);
  assert.equal(empty.status, "ok");
  assert.equal(empty.tokenProfileApproved, false);
});
