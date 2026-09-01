import test from "node:test";
import assert from "node:assert/strict";
import { infrastructureAddresses, summarizeHolders } from "../scripts/lib/onchain/holders.mjs";
import { createSanitizer } from "../scripts/lib/onchain/sanitize.mjs";

const DEPLOYER = "0x1111111111111111111111111111111111111111";
const CURVE = "0x2222222222222222222222222222222222222222";
const WHALE = "0x3333333333333333333333333333333333333333";
const SMALL = "0x4444444444444444444444444444444444444444";

const holder = (address, value) => ({ address: { hash: address }, value: String(value) });
const infra = () => infrastructureAddresses({ deployer: DEPLOYER, tokenLaunched: { curve: CURVE } }, null);
const summarize = (result, supply) => summarizeHolders(result, supply, infra(), createSanitizer().sanitizeText);

test("an unknown total supply leaves every percentage null instead of zero", () => {
  const output = summarize({ ok: true, data: { items: [holder(WHALE, "500"), holder(DEPLOYER, "300")] } }, null);

  assert.equal(output.status, "ok");
  assert.equal(output.supplyKnown, false);
  assert.equal(output.percentagesKnown, false);
  // A zero here would read as "nobody holds anything", which is the opposite of unknown.
  assert.equal(output.top10Pct, null);
  assert.equal(output.top10ConcentrationPct, null);
  assert.equal(output.insiderPct, null);
  assert.equal(output.pooledOrBurnedPct, null);
  assert.equal(output.top10[0].pct, null);
});

test("a single unparseable balance does not silently shrink the totals", () => {
  const output = summarize({ ok: true, data: { items: [holder(WHALE, "400"), holder(SMALL, "not-a-number")] } }, "1000");

  assert.equal(output.supplyKnown, true);
  assert.equal(output.unknownPercentageHolders, 1);
  assert.equal(output.percentagesKnown, false);
  assert.equal(output.top10Pct, null);
  // The parseable rows still carry their own percentage; only the sums go unknown.
  assert.equal(output.top10[0].pct, 40);
});

test("holders are ranked here, not in the order the source returned them", () => {
  const output = summarize(
    { ok: true, data: { items: [holder(SMALL, "10"), holder(WHALE, "600"), holder(CURVE, "300")] } },
    "1000"
  );

  assert.deepEqual(output.top10.map((row) => row.address), [WHALE, CURVE, SMALL]);
  assert.equal(output.top10ConcentrationPct, 61);
  assert.equal(output.pooledOrBurnedPct, 30);
  assert.equal(output.top10Pct, 91);
  assert.equal(output.coverage, "all_holders_returned");
  assert.equal(output.top10Exact, true);
});

test("a first page of holders is reported as a lower bound", () => {
  const output = summarize(
    { ok: true, data: { items: [holder(WHALE, "600"), holder(DEPLOYER, "100")], next_page_params: { index: 2 } } },
    "1000"
  );

  assert.equal(output.morePages, true);
  assert.equal(output.coverage, "first_page_only");
  assert.equal(output.top10Exact, false);
  assert.equal(output.top10ConcentratingExact, false);
  assert.equal(output.insiderPct, 10);
});

test("an ok holders response with no item list is unknown, not empty", () => {
  const malformed = summarize({ ok: true, data: { message: "no data" } }, "1000");
  assert.equal(malformed.status, "unknown_malformed_response");
  assert.equal(malformed.top10Pct, undefined);
  assert.match(malformed.note, /not as clean/);

  const failed = summarize({ ok: false, status: 500 }, "1000");
  assert.equal(failed.status, "unknown_source_failed");
});
